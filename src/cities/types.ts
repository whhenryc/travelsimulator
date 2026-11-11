export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface CityPalette {
  sky: number;
  horizon: number;
  ground: number;
  building: number;
  road: number;
  path: number;
  water: number;
  green: number;
}

export interface CityConfig {
  id: string;
  name: string;
  bbox: BBox;
  spawn: { position: [lon: number, lat: number]; headingDegrees: number };
  palette: CityPalette;
}
