import * as THREE from 'three';
import city from './cities/gion';
import { createFlyCamera } from './debug/fly-camera';
import { createBuildings } from './world/buildings';
import { loadCityData } from './world/data';
import { createGround } from './world/ground';
import { createProjection } from './world/projection';

const SKY_RADIUS = 5000;

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

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  1,
  SKY_RADIUS * 2.5,
);

// 起始鏡頭：由高空睇落去，北方向上，成個 bbox 入鏡
const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const overviewHeight =
  Math.max(projection.halfExtent.y, projection.halfExtent.x / camera.aspect) / halfFovTangent;
camera.position.set(0, overviewHeight * 1.05, overviewHeight * 0.15);

const updateCamera = createFlyCamera(camera, renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Timer();
renderer.setAnimationLoop((timestamp) => {
  clock.update(timestamp);
  updateCamera(clock.getDelta());
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) Object.assign(window, { renderer, camera, scene });
