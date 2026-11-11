import * as THREE from 'three';
import type { Feature, Position } from 'geojson';
import type { CityPalette } from '../cities/types';
import { createToonGradient } from '../style/palette';
import type { CollisionWorld } from './collision';
import type { CityData } from './data';
import { roadWidth } from './ground';
import type { Projection } from './projection';
import { seededRandom } from './random';

const TRUNK_HALF_WIDTH = 0.2;
const TRUNK_HEIGHT = 2.4;
const LAMP_SPACING = 16;
const LAMP_MIN_GAP = 7;
const LAMP_EDGE_INSET = 0.8;
const LAMP_CLEARANCE_RADIUS = 0.5;
const LAMP_POLE_HALF_WIDTH = 0.08;
const LAMP_HEIGHT = 2.9;
const LAMP_POOL_RADIUS = 3.6;
const LAMP_ROAD_TYPES = new Set([
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'pedestrian',
]);

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function createTrees(
  features: Feature[],
  projection: Projection,
  palette: CityPalette,
  gradientMap: THREE.Texture,
): { group: THREE.Group; trunks: THREE.Vector2[] } {
  const trunks: THREE.Vector2[] = [];
  const trunkMatrices: THREE.Matrix4[] = [];
  const crownMatrices: THREE.Matrix4[] = [];
  const crownColors: THREE.Color[] = [];

  for (const feature of features) {
    if (feature.geometry.type !== 'Point') continue;
    const id = String(feature.properties?.['id']);
    const point = projection.toLocal(feature.geometry.coordinates);
    const scale = 0.75 + seededRandom(id, 'size') * 0.6;
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      seededRandom(id, 'turn') * Math.PI * 2,
    );
    trunks.push(point);
    trunkMatrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(point.x, 0, point.y),
        rotation,
        new THREE.Vector3(1, scale, 1),
      ),
    );
    crownMatrices.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(point.x, TRUNK_HEIGHT * scale, point.y),
        rotation,
        new THREE.Vector3(scale, scale * 0.9, scale),
      ),
    );
    const leaves = palette.treeLeaves;
    crownColors.push(
      new THREE.Color(leaves[Math.floor(seededRandom(id, 'leaf') * leaves.length) % leaves.length]!),
    );
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.2, TRUNK_HEIGHT, 6).translate(
    0,
    TRUNK_HEIGHT / 2,
    0,
  );
  const crownGeometry = new THREE.IcosahedronGeometry(1.8, 0).translate(0, 1.2, 0);
  // 冇 index 嘅幾何重新計法線，就會變成每面平面著色嘅低多邊形樹冠
  crownGeometry.computeVertexNormals();

  const trunkMesh = instanced(
    trunkGeometry,
    new THREE.MeshToonMaterial({ color: palette.treeTrunk, gradientMap }),
    trunkMatrices,
  );
  const crownMesh = instanced(
    crownGeometry,
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap }),
    crownMatrices,
  );
  crownColors.forEach((color, index) => crownMesh.setColorAt(index, color));
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;

  for (const mesh of [trunkMesh, crownMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
  }

  const group = new THREE.Group();
  group.add(trunkMesh, crownMesh);
  return { group, trunks };
}

/** 主要街道每隔一段距離，左右兩邊輪流放燈籠形路燈 */
function lampPositions(
  features: Feature[],
  projection: Projection,
  collision: CollisionWorld,
): THREE.Vector2[] {
  const lamps: THREE.Vector2[] = [];
  const probe = new THREE.Vector2();
  const isClear = (point: THREE.Vector2): boolean => {
    probe.copy(point);
    const settled = collision.resolveBuildings(probe, LAMP_CLEARANCE_RADIUS);
    return (
      settled &&
      probe.distanceTo(point) < 1e-6 &&
      !collision.isWater(point.x, point.y) &&
      Math.abs(point.x) <= collision.halfExtent.x &&
      Math.abs(point.y) <= collision.halfExtent.y &&
      lamps.every((lamp) => lamp.distanceTo(point) >= LAMP_MIN_GAP)
    );
  };

  for (const feature of features) {
    const highway = String(feature.properties?.['highway']);
    if (!LAMP_ROAD_TYPES.has(highway) || feature.geometry.type !== 'LineString') continue;
    const width = roadWidth(highway) ?? 4;
    const offset = Math.max(0.5, width / 2 - LAMP_EDGE_INSET);
    const points = (feature.geometry.coordinates as Position[]).map(projection.toLocal);

    let travelled = LAMP_SPACING / 2;
    let side = 1;
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const length = a.distanceTo(b);
      if (length === 0) continue;
      const direction = new THREE.Vector2().subVectors(b, a).divideScalar(length);
      const normal = new THREE.Vector2(-direction.y, direction.x);

      while (travelled <= length) {
        const along = a.clone().addScaledVector(direction, travelled);
        const preferred = along.clone().addScaledVector(normal, offset * side);
        const fallback = along.clone().addScaledVector(normal, -offset * side);
        if (isClear(preferred)) lamps.push(preferred);
        else if (isClear(fallback)) lamps.push(fallback);
        side = -side;
        travelled += LAMP_SPACING;
      }
      travelled -= length;
    }
  }
  return lamps;
}

function createPoolTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createLamps(
  lamps: THREE.Vector2[],
  palette: CityPalette,
  gradientMap: THREE.Texture,
): THREE.Group {
  const at = (point: THREE.Vector2, y = 0) =>
    new THREE.Matrix4().makeTranslation(point.x, y, point.y);

  const pole = instanced(
    new THREE.BoxGeometry(0.14, LAMP_HEIGHT, 0.14).translate(0, LAMP_HEIGHT / 2, 0),
    new THREE.MeshToonMaterial({ color: palette.woodDark, gradientMap }),
    lamps.map((point) => at(point)),
  );
  pole.castShadow = true;
  pole.renderOrder = 2;

  const lantern = instanced(
    new THREE.CylinderGeometry(0.24, 0.24, 0.55, 8),
    new THREE.MeshBasicMaterial({ color: palette.lantern }),
    lamps.map((point) => at(point, LAMP_HEIGHT + 0.1)),
  );
  lantern.renderOrder = 2;

  const pool = instanced(
    new THREE.CircleGeometry(LAMP_POOL_RADIUS, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: palette.lampPool,
      map: createPoolTexture(),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
    lamps.map((point) => at(point, 0.02)),
  );
  // 喺地面之後、建築之前畫
  pool.renderOrder = 1.5;

  const group = new THREE.Group();
  group.add(pole, lantern, pool);
  return group;
}

/** 樹同路燈，並將樹幹同燈柱加入碰撞 */
export function createProps(
  data: CityData,
  projection: Projection,
  collision: CollisionWorld,
  palette: CityPalette,
): THREE.Group {
  const gradientMap = createToonGradient();
  const trees = createTrees(data.trees.features, projection, palette, gradientMap);
  collision.addPillars(trees.trunks, TRUNK_HALF_WIDTH, TRUNK_HEIGHT);

  const lamps = lampPositions(data.roads.features, projection, collision);
  collision.addPillars(lamps, LAMP_POLE_HALF_WIDTH, LAMP_HEIGHT);

  const group = new THREE.Group();
  group.add(trees.group, createLamps(lamps, palette, gradientMap));
  return group;
}
