import * as THREE from 'three';
import { createAmbience } from './audio/ambience';
import city from './cities/gion';
import { createAvatar } from './player/avatar';
import { ThirdPersonCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { createInput } from './player/input';
import { createLighting } from './style/lighting';
import { createSoundToggle } from './ui/sound-toggle';
import { createBuildings } from './world/buildings';
import { createCollisionWorld } from './world/collision';
import { loadCityData } from './world/data';
import { createGround } from './world/ground';
import { createProps } from './world/props';
import { createProjection } from './world/projection';

const MAX_FRAME_SECONDS = 0.05;
const HIDE_AVATAR_DISTANCE = 1.1;
// 手機用較細嘅陰影貼圖同較硬嘅陰影邊，保住 frame rate
const lowPower = window.matchMedia('(pointer: coarse)').matches;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const lighting = createLighting(scene, renderer, city, lowPower);

const projection = createProjection(city.bbox);
const data = await loadCityData(city);
scene.add(createGround(data, projection, city.palette));
scene.add(createBuildings(data.buildings, projection, city.palette));

const collision = createCollisionWorld(data, projection);
scene.add(createProps(data, projection, collision, city.palette));

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.15,
  lighting.far,
);

const startYaw = -THREE.MathUtils.degToRad(city.spawn.headingDegrees);
const player = new PlayerController(collision, projection.toLocal(city.spawn.position), startYaw);
const followCamera = new ThirdPersonCamera(camera, collision, startYaw);
const avatar = createAvatar();
scene.add(avatar.object);
const input = createInput(renderer.domElement);
const ambience = createAmbience(collision);
createSoundToggle(ambience);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Timer();
renderer.setAnimationLoop((timestamp) => {
  clock.update(timestamp);
  const deltaSeconds = Math.min(clock.getDelta(), MAX_FRAME_SECONDS);

  const state = input.read();
  followCamera.applyLook(state);
  player.update(deltaSeconds, state, followCamera.yaw);
  const { x, y: z } = player.position;
  avatar.update(x, z, player.facing, player.walkPhase, player.speedRatio);

  const distance = followCamera.update(deltaSeconds, x, z);
  avatar.object.visible = distance > HIDE_AVATAR_DISTANCE;
  lighting.update(x, z, camera.position);
  ambience.update(x, z, clock.getElapsed());
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) {
  Object.assign(window, { renderer, camera, collision, player, followCamera, data, projection, scene });
}
