import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { InputState } from './input';

const LOOK_SENSITIVITY = 0.005;
const HEAD_HEIGHT = 1.4;
const MAX_DISTANCE = 5;
const MIN_DISTANCE = 0.2;
const WALL_MARGIN = 0.35;
const MIN_CAMERA_HEIGHT = 0.35;
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.15;
const EASE_OUT_RATE = 4;

export class ThirdPersonCamera {
  /** 0 代表鏡頭喺玩家南面望向北，同 Object3D.rotation.y 方向一致 */
  yaw: number;
  private pitch = 0.3;
  private distance = MAX_DISTANCE;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: CollisionWorld;
  private readonly target = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, world: CollisionWorld, yaw: number) {
    this.camera = camera;
    this.world = world;
    this.yaw = yaw;
  }

  applyLook(input: InputState): void {
    this.yaw -= input.lookX * LOOK_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + input.lookY * LOOK_SENSITIVITY,
      MIN_PITCH,
      MAX_PITCH,
    );
  }

  /** 回傳鏡頭同玩家嘅距離 */
  update(deltaSeconds: number, playerX: number, playerZ: number): number {
    this.target.set(playerX, HEAD_HEIGHT, playerZ);

    const horizontal = Math.cos(this.pitch);
    const offsetX = Math.sin(this.yaw) * horizontal;
    const offsetY = Math.sin(this.pitch);
    const offsetZ = Math.cos(this.yaw) * horizontal;

    const reach = MAX_DISTANCE + WALL_MARGIN;
    const hit = this.world.raycast(
      playerX,
      HEAD_HEIGHT,
      playerZ,
      playerX + offsetX * reach,
      HEAD_HEIGHT + offsetY * reach,
      playerZ + offsetZ * reach,
    );
    const allowed = THREE.MathUtils.clamp(hit * reach - WALL_MARGIN, MIN_DISTANCE, MAX_DISTANCE);

    this.distance =
      allowed < this.distance
        ? allowed
        : THREE.MathUtils.damp(this.distance, allowed, EASE_OUT_RATE, deltaSeconds);

    this.camera.position.set(
      playerX + offsetX * this.distance,
      Math.max(MIN_CAMERA_HEIGHT, HEAD_HEIGHT + offsetY * this.distance),
      playerZ + offsetZ * this.distance,
    );
    this.camera.lookAt(this.target);
    return this.distance;
  }
}
