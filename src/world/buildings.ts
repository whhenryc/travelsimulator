import * as THREE from 'three';
import type { FeatureCollection, GeoJsonProperties } from 'geojson';
import { polygonsOf, projectRings, triangulate } from './polygon';
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

function buildingHeight(properties: GeoJsonProperties): number {
  const height = Number.parseFloat(String(properties?.['height']));
  if (height > 0) return height;

  const levels = Number.parseFloat(String(properties?.['levels']));
  if (levels > 0) return levels * LEVEL_HEIGHT;

  const type = String(properties?.['building']);
  if (RESIDENTIAL_TYPES.has(type)) return 6;
  if (COMMERCIAL_TYPES.has(type)) return 9;
  return 7;
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
    const height = buildingHeight(feature.properties);
    const shade = 0.82 + seededRandom(String(feature.properties?.['id'])) * 0.36;
    const color = base.clone().multiplyScalar(shade);

    for (const polygon of polygonsOf(feature)) {
      const rings = projectRings(polygon, projection);

      for (const point of triangulate(rings)) {
        addVertex(point.x, height, point.y, 0, 1, 0, color);
      }

      for (const ring of rings) {
        ring.forEach((a, index) => {
          const b = ring[(index + 1) % ring.length]!;
          const length = a.distanceTo(b);
          if (length === 0) return;
          const nx = -(b.y - a.y) / length;
          const nz = (b.x - a.x) / length;
          addVertex(a.x, 0, a.y, nx, 0, nz, color);
          addVertex(b.x, 0, b.y, nx, 0, nz, color);
          addVertex(b.x, height, b.y, nx, 0, nz, color);
          addVertex(a.x, 0, a.y, nx, 0, nz, color);
          addVertex(b.x, height, b.y, nx, 0, nz, color);
          addVertex(a.x, height, a.y, nx, 0, nz, color);
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
