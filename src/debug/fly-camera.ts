import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
const MIN_HEIGHT = 1.7;

/**
 * 階段 1 檢查用嘅鏡頭，階段 2 由第三人稱鏡頭取代。
 * 滑鼠：左掣拖動平移、右掣拖動轉向、滾輪縮放；WASD 移動，Q/E 升降，Shift 加速。
 * Touch：單指平移、雙指縮放同旋轉。
 */
export function createFlyCamera(
  camera: THREE.PerspectiveCamera,
  element: HTMLElement,
): (deltaSeconds: number) => void {
  const controls = new MapControls(camera, element);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 4000;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  const pressed = new Set<string>();
  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code)) pressed.add(event.code);
  });
  window.addEventListener('keyup', (event) => pressed.delete(event.code));
  window.addEventListener('blur', () => pressed.clear());

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movement = new THREE.Vector3();

  return (deltaSeconds) => {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    movement.set(0, 0, 0);
    if (pressed.has('KeyW')) movement.add(forward);
    if (pressed.has('KeyS')) movement.sub(forward);
    if (pressed.has('KeyD')) movement.add(right);
    if (pressed.has('KeyA')) movement.sub(right);
    if (pressed.has('KeyE')) movement.y += 1;
    if (pressed.has('KeyQ')) movement.y -= 1;

    if (movement.lengthSq() > 0) {
      const boost = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 3 : 1;
      const speed = Math.max(15, camera.position.y * 0.6) * boost;
      movement.normalize().multiplyScalar(speed * deltaSeconds);
      movement.y = Math.max(movement.y, MIN_HEIGHT - camera.position.y);
      camera.position.add(movement);
      controls.target.add(movement);
    }
    controls.update();
  };
}
