import * as THREE from 'three';
import type { Feature, Position } from 'geojson';
import type { CityPalette } from '../cities/types';
import type { CityData } from './data';
import { polygonsOf, projectRings, triangulate } from './polygon';
import type { Projection } from './projection';

const MAJOR_ROAD_WIDTHS: Record<string, number> = {
  primary: 18,
  primary_link: 8,
  secondary: 12,
  secondary_link: 6,
  tertiary: 8,
  tertiary_link: 5,
  unclassified: 5,
  residential: 5,
  living_street: 4,
};
const MINOR_ROAD_WIDTHS: Record<string, number> = {
  pedestrian: 4,
  service: 3.5,
  cycleway: 2.5,
  footway: 2,
  path: 2,
  steps: 2,
};
const WATERWAY_WIDTHS: Record<string, number> = {
  river: 12,
  canal: 6,
  stream: 4,
  ditch: 2,
  drain: 2,
};
const JOIN_DISC_MIN_WIDTH = 4;
const JOIN_DISC_SEGMENTS = 10;

class GroundBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  private vertex(x: number, z: number, color: THREE.Color): void {
    this.positions.push(x, 0, z);
    this.colors.push(color.r, color.g, color.b);
  }

  addPolygon(polygon: Position[][], projection: Projection, color: THREE.Color): void {
    for (const point of triangulate(projectRings(polygon, projection))) {
      this.vertex(point.x, point.y, color);
    }
  }

  addRibbon(line: Position[], width: number, projection: Projection, color: THREE.Color): void {
    const points = line.map(projection.toLocal);
    const halfWidth = width / 2;

    points.slice(0, -1).forEach((a, index) => {
      const b = points[index + 1]!;
      const length = a.distanceTo(b);
      if (length === 0) return;
      const offsetX = (-(b.y - a.y) / length) * halfWidth;
      const offsetZ = ((b.x - a.x) / length) * halfWidth;
      // 兩個三角形都要由上面睇逆時針
      this.vertex(a.x + offsetX, a.y + offsetZ, color);
      this.vertex(b.x + offsetX, b.y + offsetZ, color);
      this.vertex(b.x - offsetX, b.y - offsetZ, color);
      this.vertex(a.x + offsetX, a.y + offsetZ, color);
      this.vertex(b.x - offsetX, b.y - offsetZ, color);
      this.vertex(a.x - offsetX, a.y - offsetZ, color);
    });

    if (width >= JOIN_DISC_MIN_WIDTH) {
      for (const point of points) this.addDisc(point, halfWidth, color);
    }
  }

  private addDisc(center: THREE.Vector2, radius: number, color: THREE.Color): void {
    for (let i = 0; i < JOIN_DISC_SEGMENTS; i += 1) {
      const start = (i / JOIN_DISC_SEGMENTS) * Math.PI * 2;
      const end = ((i + 1) / JOIN_DISC_SEGMENTS) * Math.PI * 2;
      this.vertex(center.x, center.y, color);
      this.vertex(center.x + Math.cos(end) * radius, center.y + Math.sin(end) * radius, color);
      this.vertex(center.x + Math.cos(start) * radius, center.y + Math.sin(start) * radius, color);
    }
  }
}

function linesOf(feature: Feature): Position[] | null {
  return feature.geometry.type === 'LineString' ? feature.geometry.coordinates : null;
}

interface WidthRule {
  table: Record<string, number>;
  key: string;
  color: THREE.Color;
}

function addLines(
  builder: GroundBuilder,
  features: Feature[],
  projection: Projection,
  rules: WidthRule[],
): void {
  // 深度唔寫入，所以三角形次序就係疊放次序：窄路先畫，闊路蓋喺上面
  const ribbons = features
    .flatMap((feature) => {
      const line = linesOf(feature);
      if (!line) return [];
      return rules.flatMap((rule) => {
        const width = rule.table[String(feature.properties?.[rule.key])];
        return width ? [{ line, width, color: rule.color }] : [];
      });
    })
    .sort((a, b) => a.width - b.width);

  for (const { line, width, color } of ribbons) {
    builder.addRibbon(line, width, projection, color);
  }
}

export function createGround(
  data: CityData,
  projection: Projection,
  palette: CityPalette,
): THREE.Group {
  const builder = new GroundBuilder();
  const green = new THREE.Color(palette.green);
  const water = new THREE.Color(palette.water);

  for (const feature of data.green.features) {
    for (const polygon of polygonsOf(feature)) builder.addPolygon(polygon, projection, green);
  }
  for (const feature of data.water.features) {
    for (const polygon of polygonsOf(feature)) builder.addPolygon(polygon, projection, water);
  }
  addLines(builder, data.water.features, projection, [
    { table: WATERWAY_WIDTHS, key: 'waterway', color: water },
  ]);
  addLines(builder, data.roads.features, projection, [
    { table: MINOR_ROAD_WIDTHS, key: 'highway', color: new THREE.Color(palette.path) },
    { table: MAJOR_ROAD_WIDTHS, key: 'highway', color: new THREE.Color(palette.road) },
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(builder.colors, 3));

  const layers = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }),
  );
  layers.renderOrder = 1;

  const base = new THREE.Mesh(
    new THREE.CircleGeometry(8000, 64),
    new THREE.MeshBasicMaterial({ color: palette.ground, depthWrite: false }),
  );
  base.rotation.x = -Math.PI / 2;
  base.renderOrder = 0;

  const group = new THREE.Group();
  group.add(base, layers);
  return group;
}
