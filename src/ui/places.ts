import type { Vector2 } from 'three';
import type { CityConfig, PoiConfig } from '../cities/types';
import type { Projection } from '../world/projection';
import type { WalkGraph, WalkRoute } from '../world/walk-graph';

/** 收藏清單，按收藏次序排，存喺 localStorage */
export class Itinerary {
  private readonly key: string;
  private list: string[];
  private readonly listeners = new Set<() => void>();

  constructor(cityId: string, validIds: string[]) {
    this.key = `travel-simulator:itinerary:${cityId}`;
    let stored: unknown = [];
    try {
      stored = JSON.parse(localStorage.getItem(this.key) ?? '[]');
    } catch {
      // 私密瀏覽或者壞咗嘅數據：由空清單開始
    }
    this.list = Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === 'string' && validIds.includes(id))
      : [];
  }

  get ids(): readonly string[] {
    return this.list;
  }

  has(id: string): boolean {
    return this.list.includes(id);
  }

  toggle(id: string): void {
    this.set(this.has(id) ? this.list.filter((item) => item !== id) : [...this.list, id]);
  }

  move(id: string, offset: number): void {
    const from = this.list.indexOf(id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= this.list.length) return;
    const next = [...this.list];
    next.splice(from, 1);
    next.splice(to, 0, id);
    this.set(next);
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  private set(next: string[]): void {
    this.list = next;
    try {
      localStorage.setItem(this.key, JSON.stringify(next));
    } catch {
      // 存唔到都照用，只係下次開唔會記得
    }
    for (const listener of this.listeners) listener();
  }
}

/** 景點 UI 共用嘅資料同動作 */
export interface Places {
  city: CityConfig;
  itinerary: Itinerary;
  poi(id: string): PoiConfig;
  local(id: string): Vector2;
  player(): Vector2;
  /** 兩個景點之間嘅步行路線（有快取） */
  leg(fromId: string, toId: string): WalkRoute;
  /** 由玩家而家位置行去景點 */
  fromPlayer(id: string): WalkRoute;
  openCard(id: string): void;
}

export function createPlaces(
  city: CityConfig,
  projection: Projection,
  graph: WalkGraph,
  player: () => Vector2,
): Places & { setOpenCard(open: (id: string) => void): void } {
  const byId = new Map(city.pois.map((poi) => [poi.id, poi]));
  const locals = new Map(city.pois.map((poi) => [poi.id, projection.toLocal(poi.position)]));
  const legs = new Map<string, WalkRoute>();
  let open: (id: string) => void = () => {};

  const poi = (id: string): PoiConfig => {
    const found = byId.get(id);
    if (!found) throw new Error(`冇呢個景點：${id}`);
    return found;
  };
  const local = (id: string): Vector2 => {
    poi(id);
    return locals.get(id)!;
  };

  return {
    city,
    itinerary: new Itinerary(city.id, [...byId.keys()]),
    poi,
    local,
    player,
    leg(fromId, toId) {
      const key = `${fromId}>${toId}`;
      let route = legs.get(key);
      if (!route) {
        route = graph.route(local(fromId), local(toId));
        legs.set(key, route);
      }
      return route;
    },
    fromPlayer: (id) => graph.route(player(), local(id)),
    openCard: (id) => open(id),
    setOpenCard(next) {
      open = next;
    },
  };
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} 米`;
  return `${(metres / 1000).toFixed(1)} 公里`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小時` : `${hours} 小時 ${rest} 分鐘`;
}

/** 一般用途嘅 DOM 小工具 */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function googleMapsUrl(poi: PoiConfig): string {
  const [lon, lat] = poi.position;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}
