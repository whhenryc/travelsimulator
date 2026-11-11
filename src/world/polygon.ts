import { ShapeUtils, type Vector2 } from 'three';
import type { Feature, Position } from 'geojson';
import type { Projection } from './projection';

export type Ring = Vector2[];

export function polygonsOf(feature: Feature): Position[][][] {
  const { geometry } = feature;
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/**
 * 投影成本地座標，去掉 GeoJSON 重複嘅收尾點，並統一方向：
 * 由上面睇，外環逆時針、內環順時針（喺 x/z 平面上即係外環面積為負）。
 */
export function projectRings(polygon: Position[][], projection: Projection): Ring[] {
  return polygon
    .map((ring) => ring.slice(0, -1).map(projection.toLocal))
    .filter((ring) => ring.length >= 3)
    .map((ring, index) => {
      const isOuter = index === 0;
      const hasNegativeArea = ShapeUtils.area(ring) < 0;
      return hasNegativeArea === isOuter ? ring : ring.reverse();
    });
}

/** 回傳三角形頂點（每三個一組），全部面向上方 */
export function triangulate(rings: Ring[]): Vector2[] {
  const [outer, ...holes] = rings;
  if (!outer) return [];

  const points = [...outer, ...holes.flat()];
  const triangles: Vector2[] = [];
  for (const face of ShapeUtils.triangulateShape(outer, holes)) {
    const a = points[face[0]!]!;
    const b = points[face[1]!]!;
    const c = points[face[2]!]!;
    const signedArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (signedArea < 0) triangles.push(a, b, c);
    else triangles.push(a, c, b);
  }
  return triangles;
}
