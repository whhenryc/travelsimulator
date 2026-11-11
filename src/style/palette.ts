import * as THREE from 'three';
import type { GeoJsonProperties } from 'geojson';
import type { CityPalette } from '../cities/types';

/** 牆身花紋，喺 shader 入面按呢個值畫窗、格子、柱 */
export const Facade = {
  None: 0,
  Machiya: 1,
  Modern: 2,
  Shrine: 3,
  Temple: 4,
} as const;
export type FacadeStyle = (typeof Facade)[keyof typeof Facade];

const SHRINE_TYPES = new Set(['shrine']);
const TEMPLE_TYPES = new Set(['temple', 'pagoda', 'religious', 'gatehouse', 'church']);
const MACHIYA_MAX_HEIGHT = 8.5;
const MACHIYA_MAX_AREA = 600;
const MACHIYA_SHARE = 0.85;

export function chooseFacade(
  properties: GeoJsonProperties,
  height: number,
  area: number,
  random: number,
): FacadeStyle {
  const type = String(properties?.['building']);
  const name = String(properties?.['name'] ?? '');
  if (SHRINE_TYPES.has(type) || /神社|社$|楼門|舞殿|鳥居/.test(name)) return Facade.Shrine;
  if (TEMPLE_TYPES.has(type) || /寺|堂|門|楼|殿|院/.test(name)) return Facade.Temple;
  if (height <= MACHIYA_MAX_HEIGHT && area < MACHIYA_MAX_AREA && random < MACHIYA_SHARE) {
    return Facade.Machiya;
  }
  return Facade.Modern;
}

export function wallColor(style: FacadeStyle, palette: CityPalette, random: number): THREE.Color {
  const shade = 0.88 + random * 0.24;
  switch (style) {
    case Facade.Shrine:
      return new THREE.Color(palette.vermilion);
    case Facade.Temple:
    case Facade.Machiya:
      return new THREE.Color(palette.woodDark).multiplyScalar(shade);
    default: {
      const choices = palette.concrete;
      const pick = choices[Math.floor(random * choices.length) % choices.length]!;
      return new THREE.Color(pick).multiplyScalar(shade);
    }
  }
}

export function tileColor(palette: CityPalette, random: number): THREE.Color {
  return new THREE.Color(palette.tile).multiplyScalar(0.85 + random * 0.3);
}

/** 卡通著色用嘅三級光暗 */
export function createToonGradient(): THREE.DataTexture {
  const tones = new Uint8Array([150, 205, 255]);
  const texture = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
