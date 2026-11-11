import type { CityConfig } from './types';

const gion: CityConfig = {
  id: 'gion',
  name: '京都祇園',
  bbox: { south: 34.9985, west: 135.7705, north: 35.0075, east: 135.78 },
  palette: {
    sky: 0x4a8fd0,
    horizon: 0xdcebf5,
    ground: 0xa39a86,
    building: 0x6e5a48,
    road: 0xd8d2c4,
    path: 0xc2baa8,
    water: 0x4f86a8,
    green: 0x6f8f5a,
  },
};

export default gion;
