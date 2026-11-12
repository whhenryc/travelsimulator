import { element, formatDistance, formatMinutes, googleMapsUrl, type Places } from './places';

export interface PoiCard {
  open(id: string): void;
  close(): void;
  readonly openId: string | null;
}

export function createPoiCard(places: Places): PoiCard {
  const card = element('section', 'poi-card ui-panel');
  card.setAttribute('role', 'dialog');
  card.hidden = true;
  document.body.appendChild(card);
  let openId: string | null = null;

  const render = (): void => {
    if (!openId) return;
    const poi = places.poi(openId);
    const saved = places.itinerary.has(poi.id);
    card.replaceChildren();

    const close = element('button', 'ui-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '關閉');
    close.addEventListener('click', () => api.close());

    const title = element('h2', 'poi-title', poi.name.zh);
    const subtitle = element(
      'p',
      'poi-subtitle',
      poi.name.ja === poi.name.zh ? poi.name.en : `${poi.name.ja}　${poi.name.en}`,
    );
    const route = places.fromPlayer(poi.id);
    const facts = element('ul', 'poi-facts');
    facts.append(
      element('li', undefined, `⏱ 建議停留 ${formatMinutes(poi.stayMinutes)}`),
      element(
        'li',
        undefined,
        places.player().distanceTo(places.local(poi.id)) < poi.radius
          ? '📍 你就喺呢度'
          : `🚶 由你而家位置行過去 ${formatDistance(route.distance)}，約 ${formatMinutes(route.minutes)}`,
      ),
    );
    const summary = element('p', 'poi-summary', poi.summary);
    const children: HTMLElement[] = [close, title, subtitle, facts, summary];
    if (poi.tip) children.push(element('p', 'poi-tip', `💡 ${poi.tip}`));

    const actions = element('div', 'poi-actions');
    const save = element('button', saved ? 'ui-button saved' : 'ui-button primary', saved ? '★ 已收藏' : '☆ 收藏');
    save.type = 'button';
    save.addEventListener('click', () => places.itinerary.toggle(poi.id));
    const photos = element('a', 'ui-button', '📷 真實相片');
    photos.href = poi.photoUrl;
    const map = element('a', 'ui-button', '🗺 Google 地圖');
    map.href = googleMapsUrl(poi);
    for (const link of [photos, map]) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
    actions.append(save, photos, map);
    children.push(actions);
    card.append(...children);
  };

  places.itinerary.subscribe(render);

  const api: PoiCard = {
    open(id) {
      openId = id;
      card.hidden = false;
      render();
    },
    close() {
      openId = null;
      card.hidden = true;
    },
    get openId() {
      return openId;
    },
  };
  return api;
}

export interface PoiPrompt {
  /** 每 frame 叫，搵最近而且喺範圍入面嘅景點 */
  update(): string | null;
}

/** 行近景點時喺畫面下面提示，撳一下（或者撳 E）開資料卡 */
export function createPoiPrompt(places: Places, card: PoiCard): PoiPrompt {
  const prompt = element('button', 'poi-prompt');
  prompt.type = 'button';
  prompt.hidden = true;
  document.body.appendChild(prompt);
  const touch = window.matchMedia('(pointer: coarse)').matches;
  let nearbyId: string | null = null;

  prompt.addEventListener('click', () => {
    if (nearbyId) card.open(nearbyId);
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && nearbyId && card.openId !== nearbyId) card.open(nearbyId);
    if (event.code === 'Escape') card.close();
  });

  return {
    update() {
      const player = places.player();
      let best: string | null = null;
      let bestRatio = 1;
      for (const poi of places.city.pois) {
        const ratio = player.distanceTo(places.local(poi.id)) / poi.radius;
        if (ratio < bestRatio) {
          bestRatio = ratio;
          best = poi.id;
        }
      }
      if (best !== nearbyId) {
        nearbyId = best;
        if (best) {
          prompt.textContent = `📍 ${places.poi(best).name.zh}　${touch ? '撳呢度睇介紹' : '撳 E 睇介紹'}`;
        }
      }
      prompt.hidden = !nearbyId || card.openId !== null;
      return nearbyId;
    },
  };
}
