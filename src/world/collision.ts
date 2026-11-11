import { Vector2 } from 'three';
import type { Position } from 'geojson';
import { buildingBlocks } from './buildings';
import type { CityData } from './data';
import { roadWidth, waterwayWidth } from './ground';
import { polygonsOf, projectRings } from './polygon';
import type { Projection } from './projection';

const CELL_SIZE = 12;
const GRID_MARGIN = 150;
const MAX_QUERY_RADIUS = 0.5;
const RESOLVE_ITERATIONS = 6;
const SEGMENT_STRIDE = 5;
const WATER_PIXELS_PER_METRE = 1;
const WATER_ALPHA_THRESHOLD = 128;

export interface CollisionWorld {
  /** 玩家可以企嘅範圍（bbox 一半長度，米） */
  halfExtent: Vector2;
  /** 將圓形推出所有建築，直接改 position；推唔出（例如夾喺窄罅）就回傳 false */
  resolveBuildings(position: Vector2, radius: number): boolean;
  /** 水面而且冇橋或者路蓋住 */
  isWater(x: number, z: number): boolean;
  /** 由 (ax, ay, az) 去 (bx, by, bz) 第一個撞到建築嘅位置，回傳 0 至 1，冇撞到就係 1 */
  raycast(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number;
}

function buildSegments(data: CityData, projection: Projection): Float32Array {
  const segments: number[] = [];
  for (const feature of data.buildings.features) {
    for (const block of buildingBlocks(feature, projection)) {
      // 懸空屋頂下面可以行，只有落地嘅部分（牆、柱）先會擋路
      if (block.bottom > 0) continue;
      for (const ring of block.rings) {
        ring.forEach((a, index) => {
          const b = ring[(index + 1) % ring.length]!;
          segments.push(a.x, a.y, b.x, b.y, block.top);
        });
      }
    }
  }
  return new Float32Array(segments);
}

function traceLine(
  context: CanvasRenderingContext2D,
  line: Position[],
  projection: Projection,
): void {
  context.beginPath();
  line.forEach((position, index) => {
    const point = projection.toLocal(position);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

/** 用 canvas 將水面畫成 1 米一格嘅位圖，路（包括橋）畫過嘅位置就可以行 */
function rasterizeWater(
  data: CityData,
  projection: Projection,
): { mask: Uint8Array; width: number; height: number } {
  const { halfExtent } = projection;
  const width = Math.ceil(halfExtent.x * 2 * WATER_PIXELS_PER_METRE);
  const height = Math.ceil(halfExtent.y * 2 * WATER_PIXELS_PER_METRE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('瀏覽器唔支援 canvas 2D');

  context.setTransform(
    WATER_PIXELS_PER_METRE,
    0,
    0,
    WATER_PIXELS_PER_METRE,
    halfExtent.x * WATER_PIXELS_PER_METRE,
    halfExtent.y * WATER_PIXELS_PER_METRE,
  );
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const feature of data.water.features) {
    for (const polygon of polygonsOf(feature)) {
      context.beginPath();
      for (const ring of projectRings(polygon, projection)) {
        ring.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
      }
      context.fill('evenodd');
    }
    if (feature.geometry.type === 'LineString') {
      const width = waterwayWidth(feature.properties?.['waterway']);
      if (width) {
        context.lineWidth = width;
        traceLine(context, feature.geometry.coordinates, projection);
      }
    }
  }

  context.globalCompositeOperation = 'destination-out';
  for (const feature of data.roads.features) {
    const width = roadWidth(feature.properties?.['highway']);
    if (width && feature.geometry.type === 'LineString') {
      context.lineWidth = width;
      traceLine(context, feature.geometry.coordinates, projection);
    }
  }

  const pixels = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = pixels[i * 4 + 3]! >= WATER_ALPHA_THRESHOLD ? 1 : 0;
  }
  return { mask, width, height };
}

export function createCollisionWorld(data: CityData, projection: Projection): CollisionWorld {
  const { halfExtent } = projection;
  const segments = buildSegments(data, projection);
  const water = rasterizeWater(data, projection);

  const originX = -halfExtent.x - GRID_MARGIN;
  const originZ = -halfExtent.y - GRID_MARGIN;
  const columns = Math.ceil(((halfExtent.x + GRID_MARGIN) * 2) / CELL_SIZE);
  const rows = Math.ceil(((halfExtent.y + GRID_MARGIN) * 2) / CELL_SIZE);
  const cells: number[][] = Array.from({ length: columns * rows }, () => []);

  const columnOf = (x: number): number =>
    Math.min(columns - 1, Math.max(0, Math.floor((x - originX) / CELL_SIZE)));
  const rowOf = (z: number): number =>
    Math.min(rows - 1, Math.max(0, Math.floor((z - originZ) / CELL_SIZE)));

  for (let index = 0; index < segments.length; index += SEGMENT_STRIDE) {
    const ax = segments[index]!;
    const az = segments[index + 1]!;
    const bx = segments[index + 2]!;
    const bz = segments[index + 3]!;
    const firstColumn = columnOf(Math.min(ax, bx) - MAX_QUERY_RADIUS);
    const lastColumn = columnOf(Math.max(ax, bx) + MAX_QUERY_RADIUS);
    const firstRow = rowOf(Math.min(az, bz) - MAX_QUERY_RADIUS);
    const lastRow = rowOf(Math.max(az, bz) + MAX_QUERY_RADIUS);
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        cells[row * columns + column]!.push(index);
      }
    }
  }

  return {
    halfExtent,

    resolveBuildings(position, radius) {
      const cell = cells[rowOf(position.y) * columns + columnOf(position.x)]!;
      for (let iteration = 0; iteration < RESOLVE_ITERATIONS; iteration += 1) {
        let moved = false;
        for (const index of cell) {
          const ax = segments[index]!;
          const az = segments[index + 1]!;
          const edgeX = segments[index + 2]! - ax;
          const edgeZ = segments[index + 3]! - az;
          const lengthSquared = edgeX * edgeX + edgeZ * edgeZ;
          if (lengthSquared === 0) continue;

          const t = Math.max(
            0,
            Math.min(1, ((position.x - ax) * edgeX + (position.y - az) * edgeZ) / lengthSquared),
          );
          const offsetX = position.x - (ax + edgeX * t);
          const offsetZ = position.y - (az + edgeZ * t);
          const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
          if (distanceSquared >= radius * radius || distanceSquared === 0) continue;

          const distance = Math.sqrt(distanceSquared);
          const push = (radius - distance) / distance;
          position.x += offsetX * push;
          position.y += offsetZ * push;
          moved = true;
        }
        if (!moved) return true;
      }
      return false;
    },

    isWater(x, z) {
      const column = Math.floor((x + halfExtent.x) * WATER_PIXELS_PER_METRE);
      const row = Math.floor((z + halfExtent.y) * WATER_PIXELS_PER_METRE);
      if (column < 0 || row < 0 || column >= water.width || row >= water.height) return false;
      return water.mask[row * water.width + column] === 1;
    },

    raycast(ax, ay, az, bx, by, bz) {
      let nearest = 1;
      const rayX = bx - ax;
      const rayZ = bz - az;
      const firstColumn = columnOf(Math.min(ax, bx));
      const lastColumn = columnOf(Math.max(ax, bx));
      const firstRow = rowOf(Math.min(az, bz));
      const lastRow = rowOf(Math.max(az, bz));

      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          for (const index of cells[row * columns + column]!) {
            const sx = segments[index]!;
            const sz = segments[index + 1]!;
            const edgeX = segments[index + 2]! - sx;
            const edgeZ = segments[index + 3]! - sz;
            const denominator = rayX * edgeZ - rayZ * edgeX;
            if (denominator === 0) continue;

            const t = ((sx - ax) * edgeZ - (sz - az) * edgeX) / denominator;
            const u = ((sx - ax) * rayZ - (sz - az) * rayX) / denominator;
            if (t < 0 || t >= nearest || u < 0 || u > 1) continue;
            // 鏡頭高過屋頂就唔算撞到
            if (ay + (by - ay) * t <= segments[index + 4]!) nearest = t;
          }
        }
      }
      return nearest;
    },
  };
}
