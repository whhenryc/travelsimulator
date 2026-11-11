import * as THREE from 'three';

const BOB_HEIGHT = 0.06;
const MAX_LEAN = 0.16;

export interface Avatar {
  object: THREE.Group;
  update(x: number, z: number, facing: number, walkPhase: number, speedRatio: number): void;
}

/** 低多邊形人仔，面向 -z，背囊喺背後用嚟睇得出方向 */
export function createAvatar(): Avatar {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.75, 3, 10),
    new THREE.MeshLambertMaterial({ color: 0x2f6f8f }),
  );
  body.position.y = 0.6;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xe6c7a8 }),
  );
  head.position.y = 1.36;

  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.42, 0.16),
    new THREE.MeshLambertMaterial({ color: 0xd9a441 }),
  );
  backpack.position.set(0, 0.82, 0.25);

  const figure = new THREE.Group();
  figure.add(body, head, backpack);

  const object = new THREE.Group();
  object.add(figure);

  return {
    object,
    update(x, z, facing, walkPhase, speedRatio) {
      object.position.set(x, 0, z);
      object.rotation.y = facing;
      figure.position.y = Math.abs(Math.sin(walkPhase)) * BOB_HEIGHT * Math.min(1, speedRatio * 3);
      figure.rotation.x = -MAX_LEAN * speedRatio;
    },
  };
}
