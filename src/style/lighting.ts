import * as THREE from 'three';
import type { CityConfig } from '../cities/types';

const SKY_RADIUS = 600;
const SHADOW_HALF_SIZE = 70;
const SHADOW_DISTANCE = 200;
const SHADOW_SNAP = 0.5;

export interface Lighting {
  /** 天空、太陽陰影範圍跟住玩家同鏡頭 */
  update(playerX: number, playerZ: number, cameraPosition: THREE.Vector3): void;
  far: number;
}

function sunDirection(elevationDegrees: number, azimuthDegrees: number): THREE.Vector3 {
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  );
}

export function createLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  city: CityConfig,
  lowPower: boolean,
): Lighting {
  const { palette, lighting } = city;
  const toSun = sunDirection(lighting.sunElevationDegrees, lighting.sunAzimuthDegrees);

  scene.fog = new THREE.Fog(palette.fog, lighting.fogNear, lighting.fogFar);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenithColor: { value: new THREE.Color(palette.skyZenith) },
        horizonColor: { value: new THREE.Color(palette.skyHorizon) },
        fogColor: { value: new THREE.Color(palette.fog) },
        glowColor: { value: new THREE.Color(palette.sunGlow) },
        toSun: { value: toSun },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenithColor;
        uniform vec3 horizonColor;
        uniform vec3 fogColor;
        uniform vec3 glowColor;
        uniform vec3 toSun;
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float height = clamp(direction.y, 0.0, 1.0);
          vec3 color = mix(horizonColor, zenithColor, pow(height, 0.55));
          // 地平線附近溶入霧色，遠處建築同天空接得順
          color = mix(color, fogColor, smoothstep(0.12, 0.0, direction.y));
          float facing = max(dot(direction, toSun), 0.0);
          color += glowColor * (pow(facing, 10.0) * 0.55 + pow(facing, 600.0) * 1.5);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  scene.add(
    new THREE.HemisphereLight(lighting.skyLight, lighting.groundLight, lighting.ambientIntensity),
  );

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const sun = new THREE.DirectionalLight(lighting.sunColor, lighting.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(lowPower ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -SHADOW_HALF_SIZE;
  shadowCamera.right = SHADOW_HALF_SIZE;
  shadowCamera.top = SHADOW_HALF_SIZE;
  shadowCamera.bottom = -SHADOW_HALF_SIZE;
  shadowCamera.near = 1;
  shadowCamera.far = SHADOW_DISTANCE * 2;
  scene.add(sun, sun.target);

  return {
    far: SKY_RADIUS * 2,
    update(playerX, playerZ, cameraPosition) {
      sky.position.copy(cameraPosition);
      // 陰影範圍跟住玩家；對齊格仔減少陰影邊緣閃爍
      const x = Math.round(playerX / SHADOW_SNAP) * SHADOW_SNAP;
      const z = Math.round(playerZ / SHADOW_SNAP) * SHADOW_SNAP;
      sun.target.position.set(x, 0, z);
      sun.position.set(x, 0, z).addScaledVector(toSun, SHADOW_DISTANCE);
    },
  };
}
