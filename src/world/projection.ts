import { Vector2 } from 'three';
import type { Position } from 'geojson';
import type { BBox } from '../cities/types';

const METRES_PER_DEGREE = (6378137 * Math.PI) / 180;

export interface Projection {
  /** 回傳本地米制座標：x 向東，y 代表世界 z 軸（向南） */
  toLocal(position: Position): Vector2;
  /** bbox 東西、南北一半嘅長度（米） */
  halfExtent: Vector2;
}

export function createProjection(bbox: BBox): Projection {
  const centerLat = (bbox.south + bbox.north) / 2;
  const centerLon = (bbox.west + bbox.east) / 2;
  const metresPerLon = METRES_PER_DEGREE * Math.cos((centerLat * Math.PI) / 180);

  return {
    toLocal: (position) =>
      new Vector2(
        (position[0]! - centerLon) * metresPerLon,
        (centerLat - position[1]!) * METRES_PER_DEGREE,
      ),
    halfExtent: new Vector2(
      ((bbox.east - bbox.west) / 2) * metresPerLon,
      ((bbox.north - bbox.south) / 2) * METRES_PER_DEGREE,
    ),
  };
}
