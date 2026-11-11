import type { CityConfig } from './types';

const gion: CityConfig = {
  id: 'gion',
  name: '京都祇園',
  bbox: { south: 34.9985, west: 135.7705, north: 35.0075, east: 135.78 },
  // 四條大橋中間，面向東邊嘅八坂神社
  spawn: { position: [135.7715, 35.00382], headingDegrees: 90 },
  // 木色深啡、瓦灰、朱紅點綴、黃昏暖光；樹葉混入秋天紅葉
  palette: {
    skyZenith: 0x3d4f86,
    skyHorizon: 0xf0b98a,
    sunGlow: 0xffd29a,
    fog: 0xd9a98a,
    ground: 0x9c8a74,
    road: 0x968b7c,
    path: 0xb3a892,
    water: 0x3e6b78,
    green: 0x5f7d48,
    woodDark: 0x4a3022,
    plaster: 0xe6dcc8,
    concrete: [0xc9bfae, 0xb5ab9c, 0xd8cfbf, 0x9e978c, 0x8c7b6b],
    tile: 0x4b4e57,
    vermilion: 0xc8462e,
    windowGlass: 0x2e3440,
    windowLight: 0xffc477,
    outline: 0x231a14,
    treeTrunk: 0x4d3626,
    treeLeaves: [0x4f6b35, 0x5d7a3c, 0x6b7f3a, 0xb5552f, 0xc9822e],
    lantern: 0xffe0b0,
    lampPool: 0xffb560,
  },
  lighting: {
    sunColor: 0xffb27a,
    sunIntensity: 2.4,
    sunElevationDegrees: 20,
    sunAzimuthDegrees: 245,
    skyLight: 0xc4bccb,
    groundLight: 0x6e5544,
    ambientIntensity: 2.1,
    fogNear: 60,
    fogFar: 420,
  },
};

export default gion;
