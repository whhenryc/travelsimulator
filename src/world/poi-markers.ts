import * as THREE from 'three';
import type { CityPalette, PoiConfig } from '../cities/types';
import type { Projection } from './projection';

const MARKER_HEIGHT = 11;
const BOB_AMPLITUDE = 0.6;
const SPIN_RATE = 0.9;
/** 遠處標記放大，等佢唔會細到睇唔到 */
const SCALE_DISTANCE = 70;
const MAX_SCALE = 10;

export interface PoiMarkers {
  object: THREE.InstancedMesh;
  update(time: number, camera: THREE.Vector3, savedIds: ReadonlySet<string>, activeId: string | null): void;
}

/** 所有景點標記用一個 InstancedMesh，只佔一個 draw call */
export function createPoiMarkers(
  pois: PoiConfig[],
  projection: Projection,
  palette: CityPalette,
): PoiMarkers {
  const geometry = new THREE.OctahedronGeometry(1, 0);
  geometry.scale(1, 1.7, 1);
  // 隔住建築都睇到，當係路標，幫玩家認方向
  const material = new THREE.MeshBasicMaterial({
    fog: false,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, pois.length);
  mesh.name = '景點標記';
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;

  const positions = pois.map((poi) => projection.toLocal(poi.position));
  const normal = new THREE.Color(0xffb84d);
  const saved = new THREE.Color(palette.vermilion).multiplyScalar(1.25);
  const active = new THREE.Color(0xffffff);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return {
    object: mesh,
    update(time, camera, savedIds, activeId) {
      pois.forEach((poi, index) => {
        const ground = positions[index]!;
        const phase = time * SPIN_RATE + index;
        position.set(ground.x, MARKER_HEIGHT + Math.sin(phase * 1.7) * BOB_AMPLITUDE, ground.y);
        const distance = position.distanceTo(camera);
        const size = THREE.MathUtils.clamp(distance / SCALE_DISTANCE, 1, MAX_SCALE) * (poi.id === activeId ? 1.3 : 1);
        rotation.setFromAxisAngle(up, phase);
        scale.setScalar(size);
        mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
        mesh.setColorAt(index, poi.id === activeId ? active : savedIds.has(poi.id) ? saved : normal);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
