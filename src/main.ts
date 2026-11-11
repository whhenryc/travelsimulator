import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x4a8fd0) },
      horizonColor: { value: new THREE.Color(0xdcebf5) },
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
scene.add(sky);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(400, 64),
  new THREE.MeshLambertMaterial({ color: 0x8a9a7b }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshLambertMaterial({ color: 0xc8452f }),
);
cube.position.y = 1;
scene.add(cube);

scene.add(new THREE.HemisphereLight(0xdcebf5, 0x6b6250, 1.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(30, 50, 20);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1200,
);
camera.position.set(6, 4, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(cube.position);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 60;
// 鏡頭唔可以轉到地面以下
controls.maxPolarAngle = Math.PI / 2 - 0.05;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
