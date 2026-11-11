import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';
import type { InputState } from './input';

const WALK_SPEED = 4;
const RUN_SPEED = 9;
const ACCELERATION = 12;
const TURN_RATE = 12;
const PLAYER_RADIUS = 0.3;
const MAX_SUBSTEP = 0.12;
const STRIDE_LENGTH = 1.7;
const STICK_DEAD_ZONE = 0.05;

function dampAngle(current: number, target: number, amount: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * amount;
}

export class PlayerController {
  readonly position: THREE.Vector2;
  facing: number;
  walkPhase = 0;
  /** 實際速度對跑步速度嘅比例，0 至 1 */
  speedRatio = 0;

  private readonly velocity = new THREE.Vector2();
  private readonly candidate = new THREE.Vector2();
  private readonly world: CollisionWorld;

  constructor(world: CollisionWorld, start: THREE.Vector2, facing: number) {
    this.world = world;
    this.position = start.clone();
    this.facing = facing;
  }

  update(deltaSeconds: number, input: InputState, cameraYaw: number): void {
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const targetSpeed = input.run ? RUN_SPEED : WALK_SPEED;
    const targetX = (input.moveX * cos - input.moveY * sin) * targetSpeed;
    const targetZ = (-input.moveX * sin - input.moveY * cos) * targetSpeed;

    const blend = 1 - Math.exp(-ACCELERATION * deltaSeconds);
    this.velocity.x += (targetX - this.velocity.x) * blend;
    this.velocity.y += (targetZ - this.velocity.y) * blend;

    const distance = this.velocity.length() * deltaSeconds;
    const substeps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
    const stepX = (this.velocity.x * deltaSeconds) / substeps;
    const stepZ = (this.velocity.y * deltaSeconds) / substeps;

    const startX = this.position.x;
    const startZ = this.position.y;
    for (let i = 0; i < substeps; i += 1) {
      if (!this.tryMove(stepX, stepZ) && !this.tryMove(stepX, 0)) this.tryMove(0, stepZ);
    }

    const moved = Math.hypot(this.position.x - startX, this.position.y - startZ);
    this.walkPhase += (moved / STRIDE_LENGTH) * Math.PI;
    this.speedRatio = deltaSeconds > 0 ? Math.min(1, moved / deltaSeconds / RUN_SPEED) : 0;

    if (Math.hypot(input.moveX, input.moveY) > STICK_DEAD_ZONE) {
      const heading = Math.atan2(-targetX, -targetZ);
      this.facing = dampAngle(this.facing, heading, 1 - Math.exp(-TURN_RATE * deltaSeconds));
    }
  }

  private tryMove(stepX: number, stepZ: number): boolean {
    if (stepX === 0 && stepZ === 0) return false;

    const { halfExtent } = this.world;
    this.candidate.set(
      THREE.MathUtils.clamp(this.position.x + stepX, -halfExtent.x, halfExtent.x),
      THREE.MathUtils.clamp(this.position.y + stepZ, -halfExtent.y, halfExtent.y),
    );
    if (!this.world.resolveBuildings(this.candidate, PLAYER_RADIUS)) return false;
    if (this.world.isWater(this.candidate.x, this.candidate.y)) return false;

    this.position.copy(this.candidate);
    return true;
  }
}
