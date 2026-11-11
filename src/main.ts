import * as THREE from 'three';
import city from './cities/gion';
import { createAvatar } from './player/avatar';
import { ThirdPersonCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { createInput } from './player/input';
import { createBuildings } from './world/buildings';
import { createCollisionWorld } from './world/collision';
import { loadCityData } from './world/data';
import { createGround } from './world/ground';
import { createProjection } from './world/projection';

const SKY_RADIUS = 3000;
const MAX_FRAME_SECONDS = 0.05;
const HIDE_AVATAR_DISTANCE = 1.1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(city.palette.sky) },
      horizonColor: { value: new THREE.Color(city.palette.horizon) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDirection;
      void main() {
        float t = clamp(normalize(vDirection).y, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, sqrt(t)), 1.0);
        #include <colorspace_fragment>
      }
    `,
  }),
);
sky.renderOrder = -1;
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xdcebf5, 0x6b6250, 1.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(30, 50, 20);
scene.add(sun);

const projection = createProjection(city.bbox);
const data = await loadCityData(city);
scene.add(createGround(data, projection, city.palette));
scene.add(createBuildings(data.buildings, projection, city.palette.building));

const collision = createCollisionWorld(data, projection);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.15,
  SKY_RADIUS * 2.5,
);

const startYaw = -THREE.MathUtils.degToRad(city.spawn.headingDegrees);
const player = new PlayerController(collision, projection.toLocal(city.spawn.position), startYaw);
const followCamera = new ThirdPersonCamera(camera, collision, startYaw);
const avatar = createAvatar();
scene.add(avatar.object);
const input = createInput(renderer.domElement);

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
  avatar.update(
    player.position.x,
    player.position.y,
    player.facing,
    player.walkPhase,
    player.speedRatio,
  );

  const distance = followCamera.update(deltaSeconds, player.position.x, player.position.y);
  avatar.object.visible = distance > HIDE_AVATAR_DISTANCE;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) {
  Object.assign(window, { renderer, camera, collision, player, followCamera, data, projection });
}
