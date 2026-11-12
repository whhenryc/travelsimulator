import * as THREE from 'three';
import type { CityPalette } from '../cities/types';
import type { CityData } from '../world/data';
import { roadWidth, waterwayWidth } from '../world/ground';
import { polygonsOf, projectRings } from '../world/polygon';
import type { Projection } from '../world/projection';
import { element, type Places } from './places';

/** 底圖解像度：每米幾多 pixel */
const BASE_SCALE = 1.5;
const BASE_MARGIN = 120;
/** 小地圖顯示半徑（米） */
const VIEW_RADIUS = 130;
const MINIMAP_SIZE = 132;
const REDRAW_SECONDS = 1 / 15;
const TAP_RADIUS = 24;

export interface Minimap {
  update(time: number, x: number, z: number, facing: number): void;
}

interface MapColors {
  background: string;
  building: string;
  road: string;
  water: string;
  green: string;
  route: string;
  poi: string;
  saved: string;
  player: string;
  outline: string;
}

function mapColors(palette: CityPalette): MapColors {
  const css = (color: THREE.Color): string => `#${color.getHexString()}`;
  const white = new THREE.Color(0xffffff);
  const mix = (a: number, b: THREE.Color | number, amount: number): string =>
    css(new THREE.Color(a).lerp(b instanceof THREE.Color ? b : new THREE.Color(b), amount));
  return {
    background: mix(palette.ground, white, 0.4),
    building: mix(palette.woodDark, palette.ground, 0.6),
    road: mix(palette.path, white, 0.65),
    water: mix(palette.water, white, 0.25),
    green: mix(palette.green, white, 0.25),
    route: css(new THREE.Color(palette.vermilion)),
    poi: '#e0a336',
    saved: css(new THREE.Color(palette.vermilion)),
    player: '#1f6fd1',
    outline: css(new THREE.Color(palette.outline)),
  };
}

function drawBase(data: CityData, projection: Projection, colors: MapColors) {
  const minX = -projection.halfExtent.x - BASE_MARGIN;
  const minZ = -projection.halfExtent.y - BASE_MARGIN;
  const width = (projection.halfExtent.x + BASE_MARGIN) * 2;
  const height = (projection.halfExtent.y + BASE_MARGIN) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * BASE_SCALE);
  canvas.height = Math.ceil(height * BASE_SCALE);
  const context = canvas.getContext('2d')!;
  context.fillStyle = colors.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(BASE_SCALE, 0, 0, BASE_SCALE, -minX * BASE_SCALE, -minZ * BASE_SCALE);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const fillPolygons = (features: CityData['buildings']['features'], color: string): void => {
    context.fillStyle = color;
    for (const feature of features) {
      for (const polygon of polygonsOf(feature)) {
        context.beginPath();
        for (const ring of projectRings(polygon, projection)) {
          ring.forEach((point, index) =>
            index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
          );
          context.closePath();
        }
        context.fill('evenodd');
      }
    }
  };
  const strokeLine = (coordinates: number[][], color: string, width: number): void => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    coordinates.forEach((position, index) => {
      const point = projection.toLocal(position);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();
  };

  fillPolygons(data.green.features, colors.green);
  fillPolygons(data.water.features, colors.water);
  for (const feature of data.water.features) {
    const width = waterwayWidth(feature.properties?.['waterway']);
    if (width && feature.geometry.type === 'LineString') {
      strokeLine(feature.geometry.coordinates, colors.water, width);
    }
  }
  fillPolygons(data.buildings.features, colors.building);
  for (const feature of data.roads.features) {
    const width = roadWidth(feature.properties?.['highway']);
    if (width && feature.geometry.type === 'LineString') {
      strokeLine(feature.geometry.coordinates, colors.road, Math.max(width, 2.5));
    }
  }
  return { canvas, minX, minZ, width, height };
}

export function createMinimap(
  places: Places,
  data: CityData,
  projection: Projection,
  palette: CityPalette,
): Minimap {
  const colors = mapColors(palette);
  const base = drawBase(data, projection, colors);
  const dpr = Math.min(window.devicePixelRatio, 2);

  const mini = element('canvas', 'minimap');
  mini.width = MINIMAP_SIZE * dpr;
  mini.height = MINIMAP_SIZE * dpr;
  mini.setAttribute('role', 'button');
  mini.setAttribute('aria-label', '打開地圖');
  const overlay = element('section', 'map-overlay');
  overlay.hidden = true;
  const sheet = element('div', 'map-sheet ui-panel');
  const close = element('button', 'ui-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', '關閉地圖');
  const big = element('canvas', 'map-canvas');
  const frame = element('div', 'map-frame');
  frame.append(big);
  sheet.append(close, element('h2', 'panel-title', `${places.city.name}地圖`), frame, element('p', 'panel-hint', '撳地圖上嘅景點睇介紹。紅線係你行程嘅步行路線。'));
  overlay.append(sheet);
  document.body.append(mini, overlay);

  let routes: THREE.Vector2[][] = [];
  const rebuildRoutes = (): void => {
    const ids = places.itinerary.ids;
    routes = ids.slice(1).map((id, index) => places.leg(ids[index]!, id).points);
  };
  places.itinerary.subscribe(() => {
    rebuildRoutes();
    if (!overlay.hidden) drawBig();
  });
  rebuildRoutes();

  let player = { x: 0, z: 0, facing: 0 };

  /** 世界米制座標 → canvas pixel 嘅變換 */
  const drawLayers = (
    context: CanvasRenderingContext2D,
    scale: number,
    offsetX: number,
    offsetY: number,
    pixelRatio: number,
    labels: boolean,
  ): void => {
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    context.drawImage(base.canvas, base.minX, base.minZ, base.width, base.height);

    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = colors.route;
    context.lineWidth = (labels ? 3 : 3.5) * pixelRatio / scale;
    context.setLineDash([6 * pixelRatio / scale, 5 * pixelRatio / scale]);
    for (const route of routes) {
      context.beginPath();
      route.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.stroke();
    }
    context.setLineDash([]);

    const unit = pixelRatio / scale;
    for (const poi of places.city.pois) {
      const point = places.local(poi.id);
      const saved = places.itinerary.has(poi.id);
      context.beginPath();
      context.arc(point.x, point.y, (labels ? 7 : 5) * unit, 0, Math.PI * 2);
      context.fillStyle = saved ? colors.saved : colors.poi;
      context.fill();
      context.lineWidth = 1.5 * unit;
      context.strokeStyle = '#fff';
      context.stroke();
      if (labels) {
        context.font = `600 ${13 * unit}px system-ui, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'bottom';
        context.lineWidth = 3 * unit;
        context.strokeStyle = 'rgb(255 255 255 / 85%)';
        context.strokeText(poi.name.zh, point.x, point.y - 9 * unit);
        context.fillStyle = colors.outline;
        context.fillText(poi.name.zh, point.x, point.y - 9 * unit);
      }
    }

    // 玩家：藍色箭咀指住行緊嘅方向
    const size = (labels ? 9 : 8) * unit;
    context.save();
    context.translate(player.x, player.z);
    context.rotate(-player.facing);
    context.beginPath();
    context.moveTo(0, -size);
    context.lineTo(size * 0.7, size * 0.7);
    context.lineTo(0, size * 0.3);
    context.lineTo(-size * 0.7, size * 0.7);
    context.closePath();
    context.fillStyle = colors.player;
    context.fill();
    context.lineWidth = 1.5 * unit;
    context.strokeStyle = '#fff';
    context.stroke();
    context.restore();
  };

  const drawMini = (): void => {
    const context = mini.getContext('2d')!;
    const size = mini.width;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, size, size);
    const scale = size / (VIEW_RADIUS * 2);
    drawLayers(context, scale, size / 2 - player.x * scale, size / 2 - player.z * scale, dpr, false);
  };

  // 大地圖只顯示 bbox 範圍，刻意唔包底圖邊位
  let bigTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  const drawBig = (): void => {
    const rect = frame.getBoundingClientRect();
    big.width = Math.round(rect.width * dpr);
    big.height = Math.round(rect.height * dpr);
    const context = big.getContext('2d')!;
    const { x: hx, y: hz } = projection.halfExtent;
    const scale = Math.min(big.width / (hx * 2), big.height / (hz * 2));
    bigTransform = { scale, offsetX: big.width / 2, offsetY: big.height / 2 };
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, big.width, big.height);
    drawLayers(context, scale, bigTransform.offsetX, bigTransform.offsetY, dpr, true);
  };

  const openBig = (): void => {
    const position = places.player();
    player = { ...player, x: position.x, z: position.y };
    overlay.hidden = false;
    drawBig();
  };
  const closeBig = (): void => {
    overlay.hidden = true;
  };

  mini.addEventListener('click', openBig);
  close.addEventListener('click', closeBig);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeBig();
  });
  big.addEventListener('click', (event) => {
    const rect = big.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * dpr - bigTransform.offsetX) / bigTransform.scale;
    const z = ((event.clientY - rect.top) * dpr - bigTransform.offsetY) / bigTransform.scale;
    const reach = (TAP_RADIUS * dpr) / bigTransform.scale;
    let best: string | null = null;
    let bestDistance = reach;
    for (const poi of places.city.pois) {
      const distance = places.local(poi.id).distanceTo(new THREE.Vector2(x, z));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = poi.id;
      }
    }
    if (best) {
      closeBig();
      places.openCard(best);
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      if (overlay.hidden) openBig();
      else closeBig();
    }
    if (event.code === 'Escape') closeBig();
  });
  window.addEventListener('resize', () => {
    if (!overlay.hidden) drawBig();
  });

  let lastDraw = -Infinity;
  return {
    update(time, x, z, facing) {
      player = { x, z, facing };
      if (time - lastDraw < REDRAW_SECONDS) return;
      lastDraw = time;
      drawMini();
    },
  };
}
