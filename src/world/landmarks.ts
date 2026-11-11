import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Feature } from 'geojson';
import type { CityConfig, LandmarkConfig } from '../cities/types';
import { createToonGradient } from '../style/palette';
import type { CityData } from './data';
import { polygonsOf, projectRings } from './polygon';
import type { Projection } from './projection';

const OUTLINE_ANGLE_DEGREES = 35;
const INSIDE_MARGIN = 0.5;

interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface LoadedLandmarks {
  group: THREE.Group;
  /** 由模型取代、唔使再畫嘅 OSM 建築 */
  hiddenBuildingIds: Set<string>;
  /** 碰撞改由模型提供嘅 OSM 建築 */
  replacedCollisionIds: Set<string>;
  colliders: { ring: THREE.Vector2[]; height: number }[];
}

interface Placement {
  center: THREE.Vector2;
  /** 模型正面（本地 -z）喺世界 x/z 嘅方向 */
  forward: THREE.Vector2;
  /** 對齊 OSM 輪廓嘅闊同深；路冇呢個值，模型唔縮放 */
  size?: { width: number; depth: number };
}

function frontVector(degrees: number): THREE.Vector2 {
  const radians = THREE.MathUtils.degToRad(degrees);
  return new THREE.Vector2(Math.sin(radians), -Math.cos(radians));
}

/** 最細面積外接長方形，用嚟搵建築嘅方向同闊深 */
function placeOnFootprint(ring: THREE.Vector2[], front: THREE.Vector2): Placement {
  type Candidate = { area: number; u: THREE.Vector2; v: THREE.Vector2; uRange: number[]; vRange: number[] };
  let best: Candidate | null = null;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    const u = new THREE.Vector2().subVectors(b, a).normalize();
    if (u.lengthSq() === 0) continue;
    const v = new THREE.Vector2(-u.y, u.x);
    const us = ring.map((p) => p.dot(u));
    const vs = ring.map((p) => p.dot(v));
    const uRange = [Math.min(...us), Math.max(...us)];
    const vRange = [Math.min(...vs), Math.max(...vs)];
    const area = (uRange[1]! - uRange[0]!) * (vRange[1]! - vRange[0]!);
    if (!best || area < best.area) best = { area, u, v, uRange, vRange };
  }
  if (!best) throw new Error('地標輪廓無效');
  const { u, v, uRange, vRange } = best;

  const center = u
    .clone()
    .multiplyScalar((uRange[0]! + uRange[1]!) / 2)
    .addScaledVector(v, (vRange[0]! + vRange[1]!) / 2);
  const uLength = uRange[1]! - uRange[0]!;
  const vLength = vRange[1]! - vRange[0]!;
  const uFacesFront = Math.abs(u.dot(front)) >= Math.abs(v.dot(front));
  const axis = (uFacesFront ? u : v).clone();
  if (axis.dot(front) < 0) axis.negate();
  return {
    center,
    forward: axis,
    size: uFacesFront ? { width: vLength, depth: uLength } : { width: uLength, depth: vLength },
  };
}

function placeOnLine(feature: Feature, projection: Projection, front: THREE.Vector2): Placement {
  if (feature.geometry.type !== 'LineString') throw new Error('地標要對齊建築或者路');
  const points = feature.geometry.coordinates.map(projection.toLocal);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const forward = new THREE.Vector2().subVectors(last, first).normalize();
  if (forward.dot(front) < 0) forward.negate();
  return { center: first.clone().add(last).multiplyScalar(0.5), forward };
}

function findFeature(data: CityData, osmId: string): { feature: Feature; isBuilding: boolean } {
  const building = data.buildings.features.find((f) => f.properties?.['id'] === osmId);
  if (building) return { feature: building, isBuilding: true };
  const road = data.roads.features.find((f) => f.properties?.['id'] === osmId);
  if (road) return { feature: road, isBuilding: false };
  throw new Error(`搵唔到地標對應嘅 OSM 要素 ${osmId}`);
}

/**
 * 模型按外接長方形擺，會蓋過 OSM 輪廓凹位入面嘅其他建築；
 * 中心點落喺範圍入面嘅建築一齊隱藏，免得穿插。
 */
function buildingsInside(data: CityData, projection: Projection, placement: Placement): string[] {
  const { center, forward, size } = placement;
  if (!size) return [];
  const across = new THREE.Vector2(-forward.y, forward.x);
  const ids: string[] = [];
  for (const feature of data.buildings.features) {
    const polygon = polygonsOf(feature)[0];
    if (!polygon) continue;
    const ring = projectRings(polygon, projection)[0];
    if (!ring) continue;
    const centroid = ring
      .reduce((sum, point) => sum.add(point), new THREE.Vector2())
      .divideScalar(ring.length)
      .sub(center);
    if (
      Math.abs(centroid.dot(forward)) < size.depth / 2 - INSIDE_MARGIN &&
      Math.abs(centroid.dot(across)) < size.width / 2 - INSIDE_MARGIN
    ) {
      ids.push(String(feature.properties?.['id']));
    }
  }
  return ids;
}

function colliderRing(collider: Collider, matrix: THREE.Matrix4): THREE.Vector2[] {
  const { x, z, w, d } = collider;
  return [
    [x - w / 2, z - d / 2],
    [x - w / 2, z + d / 2],
    [x + w / 2, z + d / 2],
    [x + w / 2, z - d / 2],
  ].map(([cx, cz]) => {
    const world = new THREE.Vector3(cx, 0, cz).applyMatrix4(matrix);
    return new THREE.Vector2(world.x, world.z);
  });
}

async function loadLandmark(
  loader: GLTFLoader,
  url: string,
  config: LandmarkConfig,
  placement: Placement,
  materials: { toon: THREE.MeshToonMaterial; outline: THREE.LineBasicMaterial },
): Promise<{ object: THREE.Object3D; colliders: Collider[] }> {
  const gltf = await loader.loadAsync(url);
  const object = new THREE.Group();
  object.name = config.name;
  let colliders: Collider[] = [];
  let footprint: { w: number; d: number } | undefined;

  gltf.scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    colliders = (child.userData['colliders'] as Collider[] | undefined) ?? colliders;
    footprint = (child.userData['footprint'] as { w: number; d: number } | undefined) ?? footprint;
    const mesh = new THREE.Mesh(child.geometry as THREE.BufferGeometry, materials.toon);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, OUTLINE_ANGLE_DEGREES),
      materials.outline,
    );
    edges.renderOrder = 3;
    object.add(mesh, edges);
  });

  const { center, forward, size } = placement;
  object.position.set(center.x, 0, center.y);
  object.rotation.y = Math.atan2(-forward.x, -forward.y);
  if (size && footprint) object.scale.set(size.width / footprint.w, 1, size.depth / footprint.d);
  object.updateMatrixWorld(true);
  return { object, colliders };
}

export async function loadLandmarks(
  city: CityConfig,
  data: CityData,
  projection: Projection,
): Promise<LoadedLandmarks> {
  const loader = new GLTFLoader();
  const materials = {
    toon: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonGradient() }),
    outline: new THREE.LineBasicMaterial({
      color: city.palette.outline,
      transparent: true,
      opacity: 0.6,
    }),
  };
  const result: LoadedLandmarks = {
    group: new THREE.Group(),
    hiddenBuildingIds: new Set(),
    replacedCollisionIds: new Set(),
    colliders: [],
  };

  await Promise.all(
    city.landmarks.map(async (config) => {
      const { feature, isBuilding } = findFeature(data, config.osmId);
      const front = frontVector(config.frontDegrees);
      const placement = isBuilding
        ? placeOnFootprint(projectRings(polygonsOf(feature)[0]!, projection)[0]!, front)
        : placeOnLine(feature, projection, front);
      const url = `${import.meta.env.BASE_URL}models/${city.id}/${config.model}`;
      const { object, colliders } = await loadLandmark(loader, url, config, placement, materials);

      result.group.add(object);
      const covered = isBuilding ? [config.osmId, ...buildingsInside(data, projection, placement)] : [];
      for (const id of covered) {
        result.hiddenBuildingIds.add(id);
        if (colliders.length > 0) result.replacedCollisionIds.add(id);
      }
      for (const collider of colliders) {
        result.colliders.push({ ring: colliderRing(collider, object.matrixWorld), height: collider.h });
      }
    }),
  );
  return result;
}
