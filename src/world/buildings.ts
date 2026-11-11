import * as THREE from 'three';
import type { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';
import type { CityPalette } from '../cities/types';
import {
  Facade,
  chooseFacade,
  createToonGradient,
  tileColor,
  wallColor,
  type FacadeStyle,
} from '../style/palette';
import { polygonsOf, projectRings, triangulate, type Ring } from './polygon';
import type { Projection } from './projection';
import { seededRandom } from './random';

const LEVEL_HEIGHT = 3;
const DEFAULT_HEIGHT_JITTER = 0.15;
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

const ROOF_EAVE = 0.5;
const ROOF_PITCH = 0.6;
const ROOF_MAX_RISE = 3.5;
const FLAT_EAVE = 0.4;
const FLAT_EAVE_THICKNESS = 0.25;
const AWNING_OUTSET = 0.7;
const AWNING_BOTTOM = 2.75;
const AWNING_TOP = 2.95;
const AWNING_MIN_BUILDING_HEIGHT = 4.5;
const CHUNK_SIZE = 200;
const OUTLINE_CORNER_COS = Math.cos(THREE.MathUtils.degToRad(25));

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
  const base = RESIDENTIAL_TYPES.has(type) ? 6 : COMMERCIAL_TYPES.has(type) ? 9 : 7;
  // 預設高度按 OSM id 輕微上下浮動，令同一條街唔會一樣高
  const jitter = seededRandom(String(properties?.['id']), 'height') * 2 - 1;
  return base * (1 + jitter * DEFAULT_HEIGHT_JITTER);
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

/** 將一棟建築拆成實心方塊；有頂冇牆嘅構造變成一塊屋頂加柱。碰撞同畫圖共用。 */
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

function outwardNormal(a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2 {
  const length = a.distanceTo(b) || 1;
  return new THREE.Vector2(-(b.y - a.y) / length, (b.x - a.x) / length);
}

/** 外環向外推 distance 米（斜接），用嚟做屋簷 */
function outsetRing(ring: Ring, distance: number): Ring {
  return ring.map((point, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length]!;
    const next = ring[(index + 1) % ring.length]!;
    const n1 = outwardNormal(previous, point);
    const n2 = outwardNormal(point, next);
    const scale = distance / Math.max(0.35, 1 + n1.dot(n2));
    return point.clone().addScaledVector(n1.add(n2), scale);
  });
}

function isConvexQuad(ring: Ring): boolean {
  if (ring.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % 4]!;
    const c = ring[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) return false;
    if (sign !== 0 && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

class BuildingGeometry {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly facades: number[] = [];
  readonly lines: number[] = [];

  vertex(
    x: number,
    y: number,
    z: number,
    normal: THREE.Vector3,
    color: THREE.Color,
    facade: readonly [number, number, number, number] = [0, 0, 0, 0],
  ): void {
    this.positions.push(x, y, z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.colors.push(color.r, color.g, color.b);
    this.facades.push(...facade);
  }

  /** 平面三角形，法線由頂點次序計 */
  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-8) return;
    normal.normalize();
    for (const point of [a, b, c]) this.vertex(point.x, point.y, point.z, normal, color);
  }

  line(a: THREE.Vector3, b: THREE.Vector3): void {
    this.lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  /** 平面（屋頂或者底面），face 為 up 時向上 */
  cap(rings: Ring[], y: number, color: THREE.Color, up: boolean): void {
    const points = triangulate(rings);
    const normal = new THREE.Vector3(0, up ? 1 : -1, 0);
    for (let i = 0; i < points.length; i += 3) {
      const order = up ? [0, 1, 2] : [0, 2, 1];
      for (const offset of order) {
        const point = points[i + offset]!;
        this.vertex(point.x, y, point.y, normal, color);
      }
    }
  }

  walls(
    rings: Ring[],
    bottom: number,
    top: number,
    color: THREE.Color,
    style: FacadeStyle,
    seed: number,
    outline: boolean,
  ): void {
    for (const ring of rings) {
      let u = 0;
      ring.forEach((a, index) => {
        const b = ring[(index + 1) % ring.length]!;
        const length = a.distanceTo(b);
        if (length === 0) return;
        const n = outwardNormal(a, b);
        const normal = new THREE.Vector3(n.x, 0, n.y);
        const f = (along: number, height: number) => [along, height, style, seed] as const;
        this.vertex(a.x, bottom, a.y, normal, color, f(u, bottom));
        this.vertex(b.x, bottom, b.y, normal, color, f(u + length, bottom));
        this.vertex(b.x, top, b.y, normal, color, f(u + length, top));
        this.vertex(a.x, bottom, a.y, normal, color, f(u, bottom));
        this.vertex(b.x, top, b.y, normal, color, f(u + length, top));
        this.vertex(a.x, top, a.y, normal, color, f(u, top));
        u += length;

        if (!outline) return;
        this.line(new THREE.Vector3(a.x, top, a.y), new THREE.Vector3(b.x, top, b.y));
        const previous = ring[(index + ring.length - 1) % ring.length]!;
        const incoming = new THREE.Vector2().subVectors(a, previous).normalize();
        const outgoing = new THREE.Vector2().subVectors(b, a).normalize();
        if (incoming.dot(outgoing) < OUTLINE_CORNER_COS) {
          this.line(new THREE.Vector3(a.x, bottom, a.y), new THREE.Vector3(a.x, top, a.y));
        }
      });
    }
  }

  /** 實心板（屋簷、頂篷）：頂、底、四邊 */
  slab(rings: Ring[], bottom: number, top: number, color: THREE.Color, outline: boolean): void {
    this.cap(rings, top, color, true);
    this.cap(rings, bottom, color, false);
    this.walls(rings, bottom, top, color, Facade.None, 0, false);
    if (outline) {
      for (const ring of rings) {
        ring.forEach((a, index) => {
          const b = ring[(index + 1) % ring.length]!;
          this.line(new THREE.Vector3(a.x, top, a.y), new THREE.Vector3(b.x, top, b.y));
        });
      }
    }
  }

  /** 四邊形建築嘅廡殿頂（hip roof），連屋簷 */
  hipRoof(quad: Ring, baseY: number, color: THREE.Color): void {
    let q = outsetRing(quad, ROOF_EAVE);
    if (q[0]!.distanceTo(q[1]!) < q[1]!.distanceTo(q[2]!)) q = [q[1]!, q[2]!, q[3]!, q[0]!];
    const [q0, q1, q2, q3] = q as [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2];

    const center = q0.clone().add(q1).add(q2).add(q3).multiplyScalar(0.25);
    const halfShort = Math.min(q1.distanceTo(q2), q3.distanceTo(q0)) / 2;
    const ridgeEnd = (m: THREE.Vector2): THREE.Vector2 => {
      const toCenter = center.clone().sub(m);
      const distance = toCenter.length();
      return distance === 0 ? m.clone() : m.clone().addScaledVector(toCenter, Math.min(halfShort, distance) / distance);
    };
    const r1 = ridgeEnd(q1.clone().add(q2).multiplyScalar(0.5));
    const r2 = ridgeEnd(q3.clone().add(q0).multiplyScalar(0.5));
    const ridgeY = baseY + Math.min(halfShort * ROOF_PITCH, ROOF_MAX_RISE);

    const at = (p: THREE.Vector2, y: number) => new THREE.Vector3(p.x, y, p.y);
    const [Q0, Q1, Q2, Q3] = [q0, q1, q2, q3].map((p) => at(p, baseY)) as [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
    ];
    const R1 = at(r1, ridgeY);
    const R2 = at(r2, ridgeY);

    this.triangle(Q0, Q1, R1, color);
    this.triangle(Q0, R1, R2, color);
    this.triangle(Q1, Q2, R1, color);
    this.triangle(Q2, Q3, R2, color);
    this.triangle(Q2, R2, R1, color);
    this.triangle(Q3, Q0, R2, color);
    // 屋簷底
    const underside = color.clone().multiplyScalar(0.6);
    this.triangle(Q0, Q2, Q1, underside);
    this.triangle(Q0, Q3, Q2, underside);

    this.line(Q0, Q1);
    this.line(Q1, Q2);
    this.line(Q2, Q3);
    this.line(Q3, Q0);
    this.line(R1, R2);
    this.line(Q0, R2);
    this.line(Q3, R2);
    this.line(Q1, R1);
    this.line(Q2, R1);
  }
}

function injectFacadeShader(material: THREE.MeshToonMaterial, palette: CityPalette): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uPlaster'] = { value: new THREE.Color(palette.plaster) };
    shader.uniforms['uGlass'] = { value: new THREE.Color(palette.windowGlass) };
    shader.uniforms['uWindowLight'] = { value: new THREE.Color(palette.windowLight) };
    shader.uniforms['uVermilion'] = { value: new THREE.Color(palette.vermilion) };
    shader.uniforms['uWoodDark'] = { value: new THREE.Color(palette.woodDark) };

    shader.vertexShader = `attribute vec4 facade;\nvarying vec4 vFacade;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vFacade = facade;',
    );

    shader.fragmentShader = /* glsl */ `
      uniform vec3 uPlaster;
      uniform vec3 uGlass;
      uniform vec3 uWindowLight;
      uniform vec3 uVermilion;
      uniform vec3 uWoodDark;
      varying vec4 vFacade;
      float facadeHash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
    ${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float facadeGlow = 0.0;
        if (vFacade.z > 0.5) {
          float u = vFacade.x;
          float h = vFacade.y;
          float style = vFacade.z;
          float seed = vFacade.w;
          vec3 wall = diffuseColor.rgb;
          if (style < 1.5) {
            // 町家：一樓木格子（後面有燈），二樓蟲籠窗
            if (h < 2.6) {
              float slat = step(0.42, fract(u * 5.0));
              float lit = step(0.4, facadeHash(vec2(floor(u / 3.6), seed * 97.0)));
              float inside = step(0.3, h) * step(h, 2.3);
              diffuseColor.rgb = mix(wall * 0.55, wall * 1.15, slat);
              facadeGlow = inside * (1.0 - slat) * lit * 0.85;
            } else if (h > 3.4) {
              float column = fract(u / 2.8);
              float pane = step(0.22, column) * step(column, 0.78) * step(3.8, h) * step(h, 4.9);
              float bar = step(0.5, fract(u * 9.0));
              float lit = step(0.55, facadeHash(vec2(floor(u / 2.8), seed * 41.0 + 3.0)));
              vec3 plaster = uPlaster * 0.9;
              diffuseColor.rgb = mix(wall, mix(plaster * 0.55, plaster, bar), pane);
              facadeGlow = pane * (1.0 - bar) * lit * 0.6;
            }
          } else if (style < 2.5) {
            // 現代：每層一排窗，地面層係舖頭大玻璃
            float level = floor(h / 3.2);
            float fy = fract(h / 3.2);
            float column = fract(u / 2.6);
            float pane = level < 0.5
              ? step(0.1, column) * step(column, 0.9) * step(0.12, fy) * step(fy, 0.7)
              : step(0.28, column) * step(column, 0.72) * step(0.35, fy) * step(fy, 0.78);
            // 地面層玻璃再分細格，唔會成片發光
            float mullion = level < 0.5 ? step(0.12, fract(u / 1.3)) : 1.0;
            pane *= mullion;
            float threshold = level < 0.5 ? 0.5 : 0.72;
            float lit = step(threshold, facadeHash(vec2(floor(u / 2.6), level + seed * 53.0)));
            diffuseColor.rgb = mix(wall, uGlass, pane);
            facadeGlow = pane * lit * (level < 0.5 ? 0.5 : 0.55);
          } else {
            // 神社（朱紅柱）同寺院（深木柱），柱之間係白牆
            float post = step(fract(u / 2.0), 0.14);
            float panel = (1.0 - post) * step(0.9, h) * step(h, 3.6);
            vec3 trim = style < 3.5 ? uVermilion : uWoodDark;
            diffuseColor.rgb = mix(mix(wall, uPlaster, panel), trim, post);
          }
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uWindowLight * facadeGlow;',
      );
  };
}

function polygonArea(ring: Ring): number {
  return Math.abs(THREE.ShapeUtils.area(ring));
}

export function createBuildings(
  collection: FeatureCollection,
  projection: Projection,
  palette: CityPalette,
): THREE.Group {
  // 按位置分塊，等鏡頭同陰影可以跳過睇唔到嘅部分
  const chunks = new Map<string, BuildingGeometry>();
  const chunkFor = (point: THREE.Vector2): BuildingGeometry => {
    const key = `${Math.floor(point.x / CHUNK_SIZE)},${Math.floor(point.y / CHUNK_SIZE)}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new BuildingGeometry();
      chunks.set(key, chunk);
    }
    return chunk;
  };
  const wood = new THREE.Color(palette.woodDark);

  for (const feature of collection.features) {
    const blocks = buildingBlocks(feature, projection);
    const anchor = blocks[0]?.rings[0]?.[0];
    if (!anchor) continue;
    const geometry = chunkFor(anchor);
    const id = String(feature.properties?.['id']);
    const random = seededRandom(id, 'style');
    const tile = tileColor(palette, seededRandom(id, 'tile'));

    if (isOpenStructure(feature.properties)) {
      for (const block of blocks) {
        if (block.bottom > 0) geometry.slab(block.rings, block.bottom, block.top, tile, true);
        else geometry.walls(block.rings, 0, block.top, wood, Facade.None, 0, false);
      }
      continue;
    }

    for (const { rings, top } of blocks) {
      const outer = rings[0]!;
      const style = chooseFacade(feature.properties, top, polygonArea(outer), random);
      const color = wallColor(style, palette, seededRandom(id, 'shade'));
      geometry.walls(rings, 0, top, color, style, seededRandom(id, 'windows'), true);

      const traditional = style !== Facade.Modern;
      if (traditional && rings.length === 1 && isConvexQuad(outer)) {
        geometry.hipRoof(outer, top, tile);
      } else if (traditional) {
        geometry.cap(rings, top, color.clone().multiplyScalar(0.7), true);
        geometry.slab(
          [outsetRing(outer, FLAT_EAVE), ...rings.slice(1)],
          top - 0.05,
          top + FLAT_EAVE_THICKNESS,
          tile,
          true,
        );
      } else {
        geometry.cap(rings, top, color.clone().multiplyScalar(0.75), true);
      }

      // 町家一樓嘅屋簷（庇）
      if (style === Facade.Machiya && top >= AWNING_MIN_BUILDING_HEIGHT) {
        geometry.slab(
          [outsetRing(outer, AWNING_OUTSET), ...rings.slice(1)],
          AWNING_BOTTOM,
          AWNING_TOP,
          tile,
          true,
        );
      }
    }
  }

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonGradient(),
    // 牆面稍為推後，等描邊線唔會同牆面打架
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  injectFacadeShader(material, palette);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: palette.outline,
    transparent: true,
    opacity: 0.6,
  });

  const group = new THREE.Group();
  for (const geometry of chunks.values()) {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(geometry.positions, 3));
    buffer.setAttribute('normal', new THREE.Float32BufferAttribute(geometry.normals, 3));
    buffer.setAttribute('color', new THREE.Float32BufferAttribute(geometry.colors, 3));
    buffer.setAttribute('facade', new THREE.Float32BufferAttribute(geometry.facades, 4));
    const mesh = new THREE.Mesh(buffer, material);
    mesh.renderOrder = 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(geometry.lines, 3));
    const outlines = new THREE.LineSegments(lineGeometry, lineMaterial);
    outlines.renderOrder = 3;
    group.add(mesh, outlines);
  }
  return group;
}
