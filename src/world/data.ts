import type { FeatureCollection } from 'geojson';
import type { CityConfig } from '../cities/types';

export interface CityData {
  buildings: FeatureCollection;
  roads: FeatureCollection;
  water: FeatureCollection;
  green: FeatureCollection;
}

async function loadLayer(city: CityConfig, name: string): Promise<FeatureCollection> {
  const url = `${import.meta.env.BASE_URL}data/${city.id}/${name}.geojson`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`載入 ${url} 失敗：${response.status}`);
  return (await response.json()) as FeatureCollection;
}

export async function loadCityData(city: CityConfig): Promise<CityData> {
  const [buildings, roads, water, green] = await Promise.all(
    ['buildings', 'roads', 'water', 'green'].map((name) => loadLayer(city, name)),
  );
  return { buildings: buildings!, roads: roads!, water: water!, green: green! };
}
