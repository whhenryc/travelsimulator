export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface CityPalette {
  skyZenith: number;
  skyHorizon: number;
  sunGlow: number;
  fog: number;
  ground: number;
  road: number;
  path: number;
  water: number;
  green: number;
  /** 町家木格子、寺院木柱 */
  woodDark: number;
  /** 灰泥白牆 */
  plaster: number;
  /** 現代建築外牆，按 OSM id 揀其中一隻 */
  concrete: number[];
  /** 瓦頂 */
  tile: number;
  /** 神社朱紅 */
  vermilion: number;
  windowGlass: number;
  windowLight: number;
  outline: number;
  treeTrunk: number;
  /** 樹葉，按 OSM id 揀其中一隻（可以混入紅葉） */
  treeLeaves: number[];
  lantern: number;
  lampPool: number;
}

export interface CityLighting {
  sunColor: number;
  sunIntensity: number;
  /** 太陽離地平線嘅角度 */
  sunElevationDegrees: number;
  /** 太陽方位，0 為北，90 為東 */
  sunAzimuthDegrees: number;
  skyLight: number;
  groundLight: number;
  ambientIntensity: number;
  fogNear: number;
  fogFar: number;
}

export interface LandmarkConfig {
  id: string;
  name: string;
  /** public/models/<city>/ 入面嘅 glb 檔名 */
  model: string;
  /** 對位用嘅 OSM 要素：建築會被模型取代；路（例如橋）只用嚟定位 */
  osmId: string;
  /** 正門面向嘅方位，0 為北，90 為東 */
  frontDegrees: number;
}

export interface CityConfig {
  id: string;
  name: string;
  bbox: BBox;
  spawn: { position: [lon: number, lat: number]; headingDegrees: number };
  palette: CityPalette;
  lighting: CityLighting;
  landmarks: LandmarkConfig[];
}
