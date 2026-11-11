/**
 * 用程式砌祇園三個地標嘅低多邊形模型，匯出成 glb 去 public/models/gion/。
 * 模型座標：x 闊、z 深、y 高，正面向 -z，原點喺地面中心，單位係米。
 * 每個模型合併成一個 mesh（用頂點顏色），碰撞方塊放喺 userData.colliders。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// GLTFExporter 輸出 glb 時要用 FileReader，Node 冇，補一個最簡單嘅
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}
Object.assign(globalThis, { FileReader: NodeFileReader });

const COLORS = {
  vermilion: 0xc8462e,
  vermilionDark: 0x8e2a1c,
  plaster: 0xeee6d6,
  stone: 0x9a958c,
  granite: 0xcfc8bb,
  bark: 0x3e3a38,
  tile: 0x4b4e57,
  woodDark: 0x3a2a20,
  wood: 0x6b4a33,
  gold: 0xd8a842,
  white: 0xf4f1ea,
  lanternRed: 0xd43a2a,
  glass: 0x2e3440,
};

interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

class ModelBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  readonly colliders: Collider[] = [];

  add(geometry: THREE.BufferGeometry, color: number, matrix?: THREE.Matrix4): void {
    let part = geometry.index ? geometry.toNonIndexed() : geometry;
    part.deleteAttribute('uv');
    if (matrix) part.applyMatrix4(matrix);
    const tint = new THREE.Color(color);
    const count = part.getAttribute('position').count;
    part.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        Array.from({ length: count }, () => [tint.r, tint.g, tint.b]).flat(),
        3,
      ),
    );
    if (!part.getAttribute('normal')) part.computeVertexNormals();
    this.parts.push(part);
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rotationY = 0): void {
    const matrix = new THREE.Matrix4()
      .makeRotationY(rotationY)
      .setPosition(x, y + h / 2, z);
    this.add(new THREE.BoxGeometry(w, h, d), color, matrix);
  }

  cylinder(radius: number, h: number, x: number, y: number, z: number, color: number, segments = 8): void {
    this.add(
      new THREE.CylinderGeometry(radius, radius, h, segments),
      color,
      new THREE.Matrix4().makeTranslation(x, y + h / 2, z),
    );
  }

  collider(x: number, z: number, w: number, d: number, h: number): void {
    this.colliders.push({ x, z, w, d, h });
  }

  /**
   * 入母屋頂（廡殿頂加兩頭細三角山牆），四角向上翹。
   * w、d 係屋簷外圍，baseY 係屋簷高度。
   */
  irimoyaRoof(w: number, d: number, baseY: number, rise: number, kick: number, color: number, cx = 0, cz = 0): void {
    const hw = w / 2;
    const hd = d / 2;
    const ridgeHalf = Math.max(0.3, hw - hd * 0.75);
    const top = baseY + rise;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x + cx, y, z + cz);
    const corner = (sx: number, sz: number) => v(sx * hw, baseY + kick, sz * hd);
    const mid = (sx: number, sz: number, t: number) =>
      v(sx * hw * t, baseY + kick * t * t * 0.3, sz * hd);
    const r1 = v(-ridgeHalf, top, 0);
    const r2 = v(ridgeHalf, top, 0);

    const triangles: THREE.Vector3[][] = [];
    // 前後兩面：中間低、兩邊翹，分三段做出弧度
    for (const sz of [-1, 1]) {
      const a = corner(-1, sz);
      const b = mid(-1, sz, 0.5);
      const c = mid(1, sz, 0.5);
      const e = corner(1, sz);
      const quad = sz < 0 ? [a, b, c, e] : [e, c, b, a];
      const [p0, p1, p2, p3] = quad as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
      const [ra, rb] = sz < 0 ? [r1, r2] : [r2, r1];
      triangles.push([p0, p1, ra], [p1, p2, ra], [p2, rb, ra], [p2, p3, rb]);
    }
    // 兩頭斜面
    triangles.push([corner(-1, 1), corner(-1, -1), r1]);
    triangles.push([corner(1, -1), corner(1, 1), r2]);
    // 屋簷底
    triangles.push([corner(-1, -1), corner(1, 1), corner(1, -1)]);
    triangles.push([corner(-1, -1), corner(-1, 1), corner(1, 1)]);

    const positions = triangles.flat().flatMap((p) => [p.x, p.y, p.z]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    this.add(geometry, color);

    // 屋脊
    this.box(ridgeHalf * 2 + 0.6, 0.35, 0.45, cx, top - 0.1, cz, COLORS.woodDark);
    // 山牆（入母屋上半嘅三角）
    for (const sx of [-1, 1]) {
      const gable = new THREE.BufferGeometry();
      const x = cx + sx * ridgeHalf;
      const low = baseY + rise * 0.45;
      const pts = [
        new THREE.Vector3(x, low, cz - hd * 0.45),
        new THREE.Vector3(x, low, cz + hd * 0.45),
        new THREE.Vector3(x, top, cz),
      ];
      const ordered = sx < 0 ? pts : [pts[1]!, pts[0]!, pts[2]!];
      gable.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(ordered.flatMap((p) => [p.x, p.y, p.z]), 3),
      );
      gable.computeVertexNormals();
      this.add(gable, COLORS.white);
    }
  }

  /** footprint 係牆身範圍（唔計屋簷），用嚟對 OSM 輪廓縮放 */
  build(footprint: { w: number; d: number }): THREE.Mesh {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('合併幾何失敗');
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    );
    mesh.userData['colliders'] = this.colliders;
    mesh.userData['footprint'] = footprint;
    return mesh;
  }
}

/** 八坂神社西樓門：兩層朱紅樓門，中間通道，兩邊放隨身像嘅格子間 */
function nishiromon(): THREE.Mesh {
  const m = new ModelBuilder();
  const W = 11.8;
  const D = 9.1;
  const pillarXs = [-W / 2 + 0.5, -1.9, 1.9, W / 2 - 0.5];
  const pillarZs = [-D / 2 + 0.6, 0, D / 2 - 0.6];

  m.box(W + 0.6, 0.45, D + 0.6, 0, 0, 0, COLORS.stone);
  for (const x of pillarXs) {
    for (const z of pillarZs) {
      m.cylinder(0.32, 4.6, x, 0.45, z, COLORS.vermilion, 10);
      m.collider(x, z, 0.7, 0.7, 5);
    }
  }
  // 兩邊格子間（隨身像嘅位置）
  for (const sx of [-1, 1]) {
    const x = sx * (W / 4 + 0.95);
    const width = W / 2 - 1.9 - 0.5;
    m.box(width, 3.2, D - 1.6, x, 0.45, 0, COLORS.vermilionDark);
    m.box(width + 0.05, 0.9, D - 1.55, x, 3.65, 0, COLORS.white);
    for (let i = 0; i < 7; i += 1) {
      const lx = x - width / 2 + (i + 0.5) * (width / 7);
      m.box(0.08, 3.0, 0.1, lx, 0.55, -D / 2 + 0.75, COLORS.vermilion);
    }
    m.collider(x, 0, width, D - 1.6, 5);
  }
  // 橫樑
  for (const z of [-D / 2 + 0.6, D / 2 - 0.6]) m.box(W, 0.45, 0.5, 0, 4.6, z, COLORS.vermilion);
  for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) m.box(0.5, 0.45, D, x, 4.6, 0, COLORS.vermilion);
  // 斗栱帶同一樓屋簷
  m.box(W + 1.4, 0.5, D + 1.4, 0, 5.05, 0, COLORS.woodDark);
  m.irimoyaRoof(W + 2.6, D + 2.6, 5.4, 0.9, 0.35, COLORS.bark);
  // 二樓：白牆、朱紅柱、欄杆
  m.box(W - 2.2, 3.0, D - 2.6, 0, 6.2, 0, COLORS.white);
  for (const x of [-(W - 2.2) / 2, -1.6, 1.6, (W - 2.2) / 2]) {
    for (const z of [-(D - 2.6) / 2, (D - 2.6) / 2]) m.cylinder(0.24, 3.0, x, 6.2, z, COLORS.vermilion);
  }
  m.box(W - 1.2, 0.12, 0.12, 0, 6.9, -(D - 1.6) / 2, COLORS.vermilion);
  m.box(W - 1.2, 0.12, 0.12, 0, 6.9, (D - 1.6) / 2, COLORS.vermilion);
  // 牌額
  m.box(1.6, 1.0, 0.15, 0, 7.3, -(D - 2.6) / 2 - 0.1, COLORS.woodDark);
  m.box(1.3, 0.75, 0.05, 0, 7.42, -(D - 2.6) / 2 - 0.2, COLORS.gold);
  m.box(W, 0.55, D - 1.6, 0, 9.2, 0, COLORS.woodDark);
  m.irimoyaRoof(W + 3.2, D + 2.4, 9.7, 3.4, 0.7, COLORS.bark);
  return m.build({ w: W, d: D });
}

/** 南座：白牆歌舞伎劇場，正面唐破風、頂上櫓（yagura），門口一排紅燈籠 */
function minamiza(): THREE.Mesh {
  const m = new ModelBuilder();
  const W = 35;
  const D = 45;
  const H = 15;
  const front = -D / 2;

  m.box(W, 1, D, 0, 0, 0, COLORS.stone);
  m.box(W - 0.2, H - 1, D - 0.2, 0, 1, 0, COLORS.plaster);
  m.collider(0, 0, W, D, H);
  // 正面嘅木柱同橫樑
  for (let i = 0; i <= 7; i += 1) {
    m.box(0.5, H - 1, 0.4, -W / 2 + (i * W) / 7, 1, front - 0.05, COLORS.wood);
  }
  for (const y of [5.2, 10.2]) m.box(W, 0.5, 0.5, 0, y, front - 0.1, COLORS.wood);
  // 入口
  m.box(14, 4, 0.3, 0, 1, front - 0.1, COLORS.glass);
  // 入口上面嘅庇
  m.box(W + 1, 0.35, 3.2, 0, 5.6, front - 1.6, COLORS.tile);
  // 庇邊一排紅燈籠
  for (let i = 0; i < 12; i += 1) {
    m.cylinder(0.32, 0.7, -W / 2 + 1.6 + i * ((W - 3.2) / 11), 4.6, front - 2.9, COLORS.lanternRed, 8);
  }
  // 二樓一排招牌（まねき）
  for (let i = 0; i < 9; i += 1) {
    m.box(3.2, 1.6, 0.2, -W / 2 + 2.2 + i * ((W - 4.4) / 8), 7.4, front - 0.35, COLORS.woodDark);
    m.box(2.8, 1.25, 0.05, -W / 2 + 2.2 + i * ((W - 4.4) / 8), 7.55, front - 0.48, COLORS.white);
  }
  // 唐破風：中間隆起、兩邊反翹嘅曲線山牆
  const shape = new THREE.Shape();
  const half = 7;
  shape.moveTo(-half, 0);
  shape.bezierCurveTo(-half * 0.7, 0.2, -half * 0.45, 2.6, 0, 2.8);
  shape.bezierCurveTo(half * 0.45, 2.6, half * 0.7, 0.2, half, 0);
  shape.lineTo(half, -0.6);
  shape.bezierCurveTo(half * 0.65, -0.3, half * 0.4, 1.9, 0, 2.1);
  shape.bezierCurveTo(-half * 0.4, 1.9, -half * 0.65, -0.3, -half, -0.6);
  shape.closePath();
  const karahafu = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false, curveSegments: 10 });
  m.add(karahafu, COLORS.tile, new THREE.Matrix4().makeTranslation(0, 11, front - 2));
  m.box(half * 1.7, 2.4, 0.3, 0, 10.6, front - 0.4, COLORS.white);
  m.box(2.6, 1.2, 0.15, 0, 11.4, front - 0.6, COLORS.gold);
  // 主屋頂
  m.irimoyaRoof(W + 3, D + 3, H, 7, 1.0, COLORS.tile);
  // 櫓：屋頂前方中間嘅小塔，圍白幕，頂上五支竹（梵天）
  const yz = front + 5;
  m.box(6, 3, 3.4, 0, H + 1.5, yz, COLORS.woodDark);
  m.box(6.1, 1.4, 3.5, 0, H + 2.4, yz, COLORS.white);
  m.box(7, 0.3, 4.2, 0, H + 4.5, yz, COLORS.tile);
  for (let i = 0; i < 5; i += 1) {
    const x = -2.4 + i * 1.2;
    m.cylinder(0.07, 3.6, x, H + 4.8, yz, COLORS.wood, 5);
    m.box(0.35, 0.7, 0.35, x, H + 8.2, yz, COLORS.white);
  }
  return m.build({ w: W, d: D });
}

/** 白川巽橋：平面行人石橋，橋底拱形，兩邊花崗石欄杆 */
function tatsumiBashi(): THREE.Mesh {
  const m = new ModelBuilder();
  const L = 8;
  const W = 3;
  // 橋面同拱形橋底（側面睇）
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2 - 0.4, 0.12);
  shape.lineTo(L / 2 + 0.4, 0.12);
  shape.lineTo(L / 2 + 0.4, -0.6);
  shape.quadraticCurveTo(0, 0.1, -L / 2 - 0.4, -0.6);
  shape.closePath();
  const deck = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 12 });
  // shape 喺 XY 平面沿 z 拉出；轉 90 度令橋長沿 z
  m.add(
    deck,
    COLORS.granite,
    new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-W / 2, 0, 0),
  );
  // 欄杆：柱同橫欄
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.15);
    for (let i = 0; i <= 5; i += 1) {
      m.box(0.24, 0.75, 0.24, x, 0.12, -L / 2 + (i * L) / 5, COLORS.granite);
    }
    m.box(0.16, 0.14, L, x, 0.62, 0, COLORS.granite);
    m.box(0.12, 0.1, L, x, 0.32, 0, COLORS.granite);
  }
  return m.build({ w: W, d: L });
}

async function exportModel(mesh: THREE.Mesh, file: string): Promise<void> {
  const scene = new THREE.Scene();
  scene.add(mesh);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  const buffer = Buffer.from(result as ArrayBuffer);
  await writeFile(file, buffer);
  const triangles = mesh.geometry.getAttribute('position').count / 3;
  console.log(`${path.basename(file)}：${triangles} 個三角形，${Math.round(buffer.length / 1024)} KB`);
}

const directory = path.join('public', 'models', 'gion');
await mkdir(directory, { recursive: true });
await exportModel(nishiromon(), path.join(directory, 'nishiromon.glb'));
await exportModel(minamiza(), path.join(directory, 'minamiza.glb'));
await exportModel(tatsumiBashi(), path.join(directory, 'tatsumi-bashi.glb'));
