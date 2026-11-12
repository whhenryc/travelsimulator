import { Vector2 } from 'three';
import type { FeatureCollection, Position } from 'geojson';
import type { Projection } from './projection';

/** 日本地產廣告用嘅標準步速：每分鐘 80 米 */
export const WALK_METRES_PER_MINUTE = 80;
const NOT_WALKABLE = new Set(['corridor']);
/** 掘頭路同其他路相距少過呢個距離（米）就當行得通 */
const DEAD_END_LINK = 12;

export interface WalkRoute {
  /** 米 */
  distance: number;
  minutes: number;
  points: Vector2[];
}

export interface WalkGraph {
  route(from: Vector2, to: Vector2): WalkRoute;
}

class MinHeap {
  private readonly items: [cost: number, node: number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(cost: number, node: number): void {
    const items = this.items;
    items.push([cost, node]);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent]![0] <= cost) break;
      [items[parent], items[index]] = [items[index]!, items[parent]!];
      index = parent;
    }
  }

  pop(): [number, number] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left]![0] < items[smallest]![0]) smallest = left;
        if (right < items.length && items[right]![0] < items[smallest]![0]) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index]!, items[smallest]!];
        index = smallest;
      }
    }
    return top;
  }
}

/**
 * 用 OSM 道路（包括行人路、樓梯）砌步行網絡，計兩點之間嘅最短路線。
 * OSM 嘅路口係共用 node，所以座標完全相同嘅點當同一個路口。
 */
export function createWalkGraph(roads: FeatureCollection, projection: Projection): WalkGraph {
  const nodeIndex = new Map<string, number>();
  const points: Vector2[] = [];
  const edges: { to: number; cost: number }[][] = [];

  const nodeOf = (position: Position): number => {
    const key = `${position[0]},${position[1]}`;
    let index = nodeIndex.get(key);
    if (index === undefined) {
      index = points.length;
      nodeIndex.set(key, index);
      points.push(projection.toLocal(position));
      edges.push([]);
    }
    return index;
  };

  for (const feature of roads.features) {
    if (NOT_WALKABLE.has(String(feature.properties?.['highway']))) continue;
    const { geometry } = feature;
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    for (const line of lines) {
      for (let i = 1; i < line.length; i += 1) {
        const a = nodeOf(line[i - 1]!);
        const b = nodeOf(line[i]!);
        if (a === b) continue;
        const cost = points[a]!.distanceTo(points[b]!);
        edges[a]!.push({ to: b, cost });
        edges[b]!.push({ to: a, cost });
      }
    }
  }

  // OSM 有時路尾同隔籬條路差幾米冇駁埋（例如寺院門口），掘頭路就近駁去其他路
  const cellOf = (point: Vector2): string =>
    `${Math.floor(point.x / DEAD_END_LINK)},${Math.floor(point.y / DEAD_END_LINK)}`;
  const grid = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = cellOf(point);
    const cell = grid.get(key);
    if (cell) cell.push(index);
    else grid.set(key, [index]);
  });
  const deadEnds = points.map((_, index) => index).filter((index) => edges[index]!.length === 1);
  for (const node of deadEnds) {
    const point = points[node]!;
    const neighbour = edges[node]![0]!.to;
    const cx = Math.floor(point.x / DEAD_END_LINK);
    const cy = Math.floor(point.y / DEAD_END_LINK);
    let best = -1;
    let bestDistance = DEAD_END_LINK;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (other === node || other === neighbour) continue;
          const distance = point.distanceTo(points[other]!);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = other;
          }
        }
      }
    }
    if (best >= 0 && !edges[node]!.some((edge) => edge.to === best)) {
      edges[node]!.push({ to: best, cost: bestDistance });
      edges[best]!.push({ to: node, cost: bestDistance });
    }
  }

  // 只用最大嘅連通網絡，免得起點落咗喺一段孤立嘅小路
  const component = new Int32Array(points.length).fill(-1);
  let largest = -1;
  let largestSize = 0;
  for (let start = 0, id = 0; start < points.length; start += 1) {
    if (component[start] !== -1) continue;
    const stack = [start];
    component[start] = id;
    let size = 0;
    while (stack.length > 0) {
      const node = stack.pop()!;
      size += 1;
      for (const { to } of edges[node]!) {
        if (component[to] === -1) {
          component[to] = id;
          stack.push(to);
        }
      }
    }
    if (size > largestSize) {
      largestSize = size;
      largest = id;
    }
    id += 1;
  }
  // 起點同終點投影去最近一段路（唔係最近路口），免得兜去另一邊再行返嚟
  const segments: [number, number][] = [];
  edges.forEach((list, a) => {
    if (component[a] !== largest) return;
    for (const { to } of list) if (a < to) segments.push([a, to]);
  });

  interface Snap {
    point: Vector2;
    a: number;
    b: number;
    /** 投影點去 a、b 嘅距離 */
    toA: number;
    toB: number;
  }
  const snap = (point: Vector2): Snap => {
    let best: Snap | null = null;
    let bestDistance = Infinity;
    const along = new Vector2();
    for (const [a, b] of segments) {
      const pa = points[a]!;
      const pb = points[b]!;
      along.subVectors(pb, pa);
      const lengthSq = along.lengthSq();
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, (point.clone().sub(pa).dot(along)) / lengthSq));
      const projected = pa.clone().addScaledVector(along, t);
      const distance = projected.distanceToSquared(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        const length = Math.sqrt(lengthSq);
        best = { point: projected, a, b, toA: t * length, toB: (1 - t) * length };
      }
    }
    if (!best) throw new Error('冇步行網絡');
    return best;
  };

  const result = (distance: number, path: Vector2[]): WalkRoute => ({
    distance,
    minutes: Math.max(1, Math.round(distance / WALK_METRES_PER_MINUTE)),
    points: path,
  });

  const route = (from: Vector2, to: Vector2): WalkRoute => {
    const start = snap(from);
    const goal = snap(to);
    const direct = from.distanceTo(to);
    const access = from.distanceTo(start.point) + to.distanceTo(goal.point);
    // 兩點好近（例如已經喺景點附近）：直接行過去
    if (direct <= access) return result(direct, [from.clone(), to.clone()]);
    const sameSegment =
      (start.a === goal.a && start.b === goal.b) || (start.a === goal.b && start.b === goal.a);
    if (sameSegment) {
      const distance = access + start.point.distanceTo(goal.point);
      return result(distance, [from.clone(), start.point, goal.point, to.clone()]);
    }

    const cost = new Float64Array(points.length).fill(Infinity);
    const previous = new Int32Array(points.length).fill(-1);
    const heap = new MinHeap();
    cost[start.a] = start.toA;
    cost[start.b] = start.toB;
    heap.push(start.toA, start.a);
    heap.push(start.toB, start.b);
    let settled = 0;
    while (heap.size > 0) {
      const [current, node] = heap.pop();
      if (current > cost[node]!) continue;
      if (node === goal.a || node === goal.b) settled += 1;
      if (settled === 2) break;
      for (const edge of edges[node]!) {
        const next = current + edge.cost;
        if (next < cost[edge.to]!) {
          cost[edge.to] = next;
          previous[edge.to] = node;
          heap.push(next, edge.to);
        }
      }
    }

    const viaA = cost[goal.a]! + goal.toA;
    const viaB = cost[goal.b]! + goal.toB;
    const last = viaA <= viaB ? goal.a : goal.b;
    const path: Vector2[] = [];
    for (let node = last; node !== -1; node = previous[node]!) path.push(points[node]!);
    path.reverse();
    return result(access + Math.min(viaA, viaB), [
      from.clone(),
      start.point,
      ...path,
      goal.point,
      to.clone(),
    ]);
  };

  return { route };
}
