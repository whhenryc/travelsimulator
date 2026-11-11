import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import osmtogeojson from 'osmtogeojson';
import type { BBox, CityConfig } from '../src/cities/types';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// 河同長路會伸出 bbox 好遠，只保留 bbox 外約 100 米以內嘅部分
const CLIP_MARGIN_DEGREES = 0.001;

type Tags = Record<string, string | undefined>;
type Properties = Record<string, string>;

function buildQuery({ south, west, north, east }: BBox): string {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:120];
(
  way["building"](${bbox});
  relation["building"](${bbox});
  way["highway"](${bbox});
  way["waterway"](${bbox});
  way["natural"="water"](${bbox});
  relation["natural"="water"](${bbox});
  way["leisure"="park"](${bbox});
  relation["leisure"="park"](${bbox});
  node["natural"="tree"](${bbox});
);
out body;
>;
out skel qt;`;
}

async function fetchOverpass(query: string): Promise<unknown> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'travel-simulator-osm-fetch/0.1',
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) throw new Error(`${endpoint} 回應 ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn(`Overpass 失敗：${String(error)}`);
      lastError = error;
    }
  }
  throw lastError;
}

function clipRing(ring: Position[], box: BBox): Position[] {
  const edges: Array<[(p: Position) => number, 0 | 1, number]> = [
    [(p) => p[0]! - box.west, 0, box.west],
    [(p) => box.east - p[0]!, 0, box.east],
    [(p) => p[1]! - box.south, 1, box.south],
    [(p) => box.north - p[1]!, 1, box.north],
  ];
  let output = ring.slice(0, -1);
  for (const [inside, axis, value] of edges) {
    const input = output;
    output = [];
    input.forEach((current, index) => {
      const previous = input[(index + input.length - 1) % input.length]!;
      const currentDistance = inside(current);
      const previousDistance = inside(previous);
      if (currentDistance >= 0 !== previousDistance >= 0) {
        const t = previousDistance / (previousDistance - currentDistance);
        const crossing: Position = [
          previous[0]! + (current[0]! - previous[0]!) * t,
          previous[1]! + (current[1]! - previous[1]!) * t,
        ];
        crossing[axis] = value;
        output.push(crossing);
      }
      if (currentDistance >= 0) output.push(current);
    });
    if (output.length === 0) return [];
  }
  return output.length >= 3 ? [...output, output[0]!] : [];
}

function clipPolygon(rings: Position[][], box: BBox): Position[][] | null {
  const outer = clipRing(rings[0] ?? [], box);
  if (outer.length === 0) return null;
  const holes = rings.slice(1).map((ring) => clipRing(ring, box));
  return [outer, ...holes.filter((ring) => ring.length > 0)];
}

function polygonsOf(geometry: Geometry): Position[][][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function linesOf(geometry: Geometry): Position[][] {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function clipLine(line: Position[], box: BBox): Position[][] {
  const runs: Position[][] = [];
  let run: Position[] = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const touches =
      Math.max(a[0]!, b[0]!) >= box.west &&
      Math.min(a[0]!, b[0]!) <= box.east &&
      Math.max(a[1]!, b[1]!) >= box.south &&
      Math.min(a[1]!, b[1]!) <= box.north;
    if (touches) {
      if (run.length === 0) run.push(a);
      run.push(b);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function clippedPolygonFeatures(
  feature: Feature,
  box: BBox,
  properties: Properties,
): Feature[] {
  return polygonsOf(feature.geometry).flatMap((rings) => {
    const coordinates = clipPolygon(rings, box);
    return coordinates
      ? [{ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates } } as Feature]
      : [];
  });
}

function clippedLineFeatures(
  feature: Feature,
  box: BBox,
  properties: Properties,
): Feature[] {
  return linesOf(feature.geometry).flatMap((line) =>
    clipLine(line, box).map(
      (coordinates) =>
        ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }) as Feature,
    ),
  );
}

function roundCoordinates(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 1e6) / 1e6;
  return Array.isArray(value) ? value.map(roundCoordinates) : value;
}

function compact(properties: Record<string, string | undefined>): Properties {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function isHidden(tags: Tags): boolean {
  const tunnel = tags['tunnel'];
  return (tunnel !== undefined && tunnel !== 'no') || tags['location'] === 'underground';
}

function collection(features: Feature[]): string {
  const rounded = features.map((feature) => ({
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: roundCoordinates((feature.geometry as { coordinates: unknown }).coordinates),
    },
  }));
  return JSON.stringify({ type: 'FeatureCollection', features: rounded });
}

function classify(geojson: FeatureCollection, bbox: BBox): Record<string, Feature[]> {
  const clipBox: BBox = {
    south: bbox.south - CLIP_MARGIN_DEGREES,
    west: bbox.west - CLIP_MARGIN_DEGREES,
    north: bbox.north + CLIP_MARGIN_DEGREES,
    east: bbox.east + CLIP_MARGIN_DEGREES,
  };
  const layers: Record<string, Feature[]> = {
    buildings: [],
    roads: [],
    water: [],
    green: [],
    trees: [],
  };

  for (const feature of geojson.features) {
    const tags = ((feature.properties?.['tags'] ?? {}) as Tags);
    const id = String(feature.id ?? feature.properties?.['id']);
    const isArea = polygonsOf(feature.geometry).length > 0;

    if (feature.geometry.type === 'Point') {
      if (tags['natural'] === 'tree') layers['trees']!.push({ ...feature, properties: { id } });
      continue;
    }
    if (tags['building'] && tags['building'] !== 'no' && isArea && !isHidden(tags)) {
      layers['buildings']!.push({
        ...feature,
        properties: compact({
          id,
          building: tags['building'],
          height: tags['height'],
          levels: tags['building:levels'],
          name: tags['name'],
        }),
      });
    }
    if (tags['highway'] && !isArea && !isHidden(tags)) {
      layers['roads']!.push(
        ...clippedLineFeatures(
          feature,
          clipBox,
          compact({ id, highway: tags['highway'], name: tags['name'] }),
        ),
      );
    }
    if (isArea && (tags['natural'] === 'water' || tags['waterway'] === 'riverbank')) {
      layers['water']!.push(
        ...clippedPolygonFeatures(feature, clipBox, compact({ id, name: tags['name'] })),
      );
    }
    if (tags['waterway'] && !isArea && !isHidden(tags)) {
      layers['water']!.push(
        ...clippedLineFeatures(
          feature,
          clipBox,
          compact({ id, waterway: tags['waterway'], name: tags['name'] }),
        ),
      );
    }
    if (tags['leisure'] === 'park' && isArea) {
      layers['green']!.push(
        ...clippedPolygonFeatures(feature, clipBox, compact({ id, name: tags['name'] })),
      );
    }
  }
  return layers;
}

async function main(): Promise<void> {
  const cityId = process.argv[2];
  if (!cityId) throw new Error('用法：npm run fetch:osm -- <city>');

  const module = (await import(`../src/cities/${cityId}.ts`)) as { default: CityConfig };
  const city = module.default;

  console.log(`抓取 ${city.name} …`);
  const osm = await fetchOverpass(buildQuery(city.bbox));
  const layers = classify(osmtogeojson(osm, { flatProperties: false }) as FeatureCollection, city.bbox);

  const directory = path.join('public', 'data', city.id);
  await mkdir(directory, { recursive: true });
  for (const [name, features] of Object.entries(layers)) {
    const content = collection(features);
    await writeFile(path.join(directory, `${name}.geojson`), content);
    console.log(`${name}: ${features.length} 個，${Math.round(content.length / 1024)} KB`);
  }
}

await main();
