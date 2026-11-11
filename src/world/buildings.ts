import * as THREE from 'three';
import type { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';
import { polygonsOf, projectRings, triangulate, type Ring } from './polygon';
import type { Projection } from './projection';

const LEVEL_HEIGHT = 3;
const RESIDENTIAL_TYPES = new Set([
  'residential',
  'house',
  'apartments',
  'detached',
  'terrace',
  'dormitory',
  'bungalow',
]);
const COMMERCIAL_TYPES = new Set(['commercial', 'retail', 'office', 'hotel']);

const CANOPY_MAX_HEIGHT = 4.5;
const CANOPY_THICKNESS = 0.8;
const CANOPY_MIN_CLEARANCE = 2.4;
const PILLAR_HALF_WIDTH = 0.15;
const PILLAR_SPACING = 6;
const PILLAR_MIN_GAP = 1.5;

/** OSM building=roof 係有頂冇牆（例如西樓門、舞殿、拱廊），人可以由下面行過 */
export function isOpenStructure(properties: GeoJsonProperties): boolean {
  return properties?.['building'] === 'roof';
}

export function buildingHeight(properties: GeoJsonProperties): number {
  const height = Number.parseFloat(String(properties?.['height']));
  if (height > 0) return height;

  const levels = Number.parseFloat(String(properties?.['levels']));
  if (levels > 0) return levels * LEVEL_HEIGHT;

  const type = String(properties?.['building']);
  if (RESIDENTIAL_TYPES.has(type)) return 6;
  if (COMMERCIAL_TYPES.has(type)) return 9;
  return 7;
}

/** 一個實心方塊：外牆由 bottom 去到 top */
export interface Block {
  rings: Ring[];
  bottom: number;
  top: number;
}

function pillarRing(center: THREE.Vector2): Ring {
  const { x, y } = center;
  const h = PILLAR_HALF_WIDTH;
  // 同 projectRings 一樣，外環喺 x/z 平面面積為負
  return [
    new THREE.Vector2(x - h, y - h),
    new THREE.Vector2(x - h, y + h),
    new THREE.Vector2(x + h, y + h),
    new THREE.Vector2(x + h, y - h),
  ];
}

/** 沿外環放柱：每個頂點同長邊每隔幾米一支，太近嘅唔重複放 */
function pillarPositions(outer: Ring): THREE.Vector2[] {
  const pillars: THREE.Vector2[] = [];
  const place = (point: THREE.Vector2): void => {
    if (pillars.every((pillar) => pillar.distanceTo(point) >= PILLAR_MIN_GAP)) {
      pillars.push(point);
    }
  };
  outer.forEach((a, index) => {
    const b = outer[(index + 1) % outer.length]!;
    const count = Math.floor(a.distanceTo(b) / PILLAR_SPACING);
    place(a.clone());
    for (let i = 1; i <= count; i += 1) {
      place(a.clone().lerp(b, i / (count + 1)));
    }
  });
  return pillars;
}

/** 將一棟建築拆成實心方塊；有頂冇牆嘅構造變成一塊屋頂加柱 */
export function buildingBlocks(feature: Feature, projection: Projection): Block[] {
  const height = buildingHeight(feature.properties);
  const isOpen = isOpenStructure(feature.properties);

  return polygonsOf(feature).flatMap((polygon) => {
    const rings = projectRings(polygon, projection);
    if (rings.length === 0) return [];
    if (!isOpen) return [{ rings, bottom: 0, top: height }];

    const top = Math.min(height, CANOPY_MAX_HEIGHT);
    const bottom = Math.max(CANOPY_MIN_CLEARANCE, top - CANOPY_THICKNESS);
    const canopy: Block = { rings, bottom, top: Math.max(top, bottom + 0.3) };
    const pillars = pillarPositions(rings[0]!).map((center) => ({
      rings: [pillarRing(center)],
      bottom: 0,
      top: bottom,
    }));
    return [canopy, ...pillars];
  });
}

/** FNV-1a：由 OSM id 得出穩定嘅 0 至 1 隨機值 */
function seededRandom(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function createBuildings(
  collection: FeatureCollection,
  projection: Projection,
  baseColor: number,
): THREE.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color(baseColor);

  const addVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    color: THREE.Color,
  ): void => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(color.r, color.g, color.b);
  };

  for (const feature of collection.features) {
    const shade = 0.82 + seededRandom(String(feature.properties?.['id'])) * 0.36;
    const color = base.clone().multiplyScalar(shade);

    for (const { rings, bottom, top } of buildingBlocks(feature, projection)) {
      const roof = triangulate(rings);
      for (const point of roof) {
        addVertex(point.x, top, point.y, 0, 1, 0, color);
      }
      if (bottom > 0) {
        // 懸空嘅屋頂由下面都要睇到，所以底面反轉三角形次序
        for (let i = roof.length - 1; i >= 0; i -= 1) {
          addVertex(roof[i]!.x, bottom, roof[i]!.y, 0, -1, 0, color);
        }
      }

      for (const ring of rings) {
        ring.forEach((a, index) => {
          const b = ring[(index + 1) % ring.length]!;
          const length = a.distanceTo(b);
          if (length === 0) return;
          const nx = -(b.y - a.y) / length;
          const nz = (b.x - a.x) / length;
          addVertex(a.x, bottom, a.y, nx, 0, nz, color);
          addVertex(b.x, bottom, b.y, nx, 0, nz, color);
          addVertex(b.x, top, b.y, nx, 0, nz, color);
          addVertex(a.x, bottom, a.y, nx, 0, nz, color);
          addVertex(b.x, top, b.y, nx, 0, nz, color);
          addVertex(a.x, top, a.y, nx, 0, nz, color);
        });
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.renderOrder = 2;
  return mesh;
}
