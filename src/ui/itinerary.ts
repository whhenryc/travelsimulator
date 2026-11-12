import { element, formatDistance, formatMinutes, googleMapsUrl, type Places } from './places';

export interface ItineraryPanel {
  toggle(): void;
  close(): void;
}

/** 收藏咗嘅景點逐段計步行距離，匯出成純文字 */
export function itineraryText(places: Places): string {
  const ids = places.itinerary.ids;
  const lines = [`${places.city.name}行程（旅行模擬器）`, ''];
  let walk = 0;
  let walkMinutes = 0;
  let stay = 0;
  ids.forEach((id, index) => {
    const poi = places.poi(id);
    stay += poi.stayMinutes;
    lines.push(`${index + 1}. ${poi.name.zh}（${poi.name.ja}）｜停留約 ${formatMinutes(poi.stayMinutes)}`);
    lines.push(`   ${googleMapsUrl(poi)}`);
    const next = ids[index + 1];
    if (next) {
      const leg = places.leg(id, next);
      walk += leg.distance;
      walkMinutes += leg.minutes;
      lines.push(`   ↓ 步行 ${formatDistance(leg.distance)}，約 ${formatMinutes(leg.minutes)}`);
    }
  });
  lines.push(
    '',
    `合共：步行 ${formatDistance(walk)}（約 ${formatMinutes(walkMinutes)}），停留 ${formatMinutes(stay)}，大約 ${formatMinutes(walkMinutes + stay)}`,
  );
  return lines.join('\n');
}

async function exportText(text: string): Promise<string> {
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return '已開分享';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return '';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return '已複製去剪貼簿';
  } catch {
    return '複製唔到，請喺下面揀晒啲字自己複製';
  }
}

export function createItineraryPanel(places: Places): ItineraryPanel {
  const button = element('button', 'itinerary-button ui-pill');
  button.type = 'button';
  const panel = element('section', 'itinerary-panel ui-panel');
  panel.hidden = true;
  document.body.append(button, panel);
  let status = '';

  const renderButton = (): void => {
    button.textContent = `📋 行程 ${places.itinerary.ids.length}`;
  };

  const render = (): void => {
    renderButton();
    if (panel.hidden) return;
    const { itinerary } = places;
    const ids = itinerary.ids;
    panel.replaceChildren();

    const close = element('button', 'ui-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', '關閉');
    close.addEventListener('click', () => api.close());
    panel.append(close, element('h2', 'panel-title', '我的行程'));

    if (ids.length === 0) {
      panel.append(element('p', 'panel-hint', '未收藏任何景點。行近景點上面嘅浮動標記，或者喺下面撳 ☆ 加入。'));
    } else {
      const list = element('ol', 'itinerary-list');
      let walk = 0;
      let walkMinutes = 0;
      let stay = 0;
      ids.forEach((id, index) => {
        const poi = places.poi(id);
        stay += poi.stayMinutes;
        const item = element('li', 'itinerary-item');
        const name = element('button', 'itinerary-name', poi.name.zh);
        name.type = 'button';
        name.addEventListener('click', () => places.openCard(id));
        const stayText = element('span', 'itinerary-stay', `停留 ${formatMinutes(poi.stayMinutes)}`);
        const controls = element('span', 'itinerary-controls');
        const up = iconButton('↑', '向前移', index === 0, () => itinerary.move(id, -1));
        const down = iconButton('↓', '向後移', index === ids.length - 1, () => itinerary.move(id, 1));
        const remove = iconButton('✕', '移除', false, () => itinerary.toggle(id));
        controls.append(up, down, remove);
        item.append(name, stayText, controls);
        list.append(item);

        const next = ids[index + 1];
        if (next) {
          const leg = places.leg(id, next);
          walk += leg.distance;
          walkMinutes += leg.minutes;
          list.append(
            element('li', 'itinerary-leg', `🚶 ${formatDistance(leg.distance)}・約 ${formatMinutes(leg.minutes)}`),
          );
        }
      });
      panel.append(
        list,
        element(
          'p',
          'itinerary-total',
          `合共步行 ${formatDistance(walk)}（約 ${formatMinutes(walkMinutes)}），停留 ${formatMinutes(stay)}，大約 ${formatMinutes(walkMinutes + stay)}`,
        ),
      );

      const share = element('button', 'ui-button primary', '📤 匯出行程');
      share.type = 'button';
      const text = itineraryText(places);
      share.addEventListener('click', async () => {
        status = await exportText(text);
        render();
      });
      panel.append(share);
      if (status) panel.append(element('p', 'panel-hint', status));
      if (status.startsWith('複製唔到')) {
        const area = element('textarea', 'itinerary-text');
        area.readOnly = true;
        area.value = text;
        panel.append(area);
      }
    }

    const others = places.city.pois.filter((poi) => !itinerary.has(poi.id));
    if (others.length > 0) {
      panel.append(element('h3', 'panel-subtitle', '其他景點'));
      const player = places.player();
      const list = element('ul', 'poi-list');
      others
        .map((poi) => ({ poi, distance: player.distanceTo(places.local(poi.id)) }))
        .sort((a, b) => a.distance - b.distance)
        .forEach(({ poi, distance }) => {
          const item = element('li', 'poi-list-item');
          const name = element('button', 'itinerary-name', poi.name.zh);
          name.type = 'button';
          name.addEventListener('click', () => places.openCard(poi.id));
          const far = element('span', 'itinerary-stay', `直線 ${formatDistance(distance)}`);
          const add = iconButton('☆', `收藏${poi.name.zh}`, false, () => itinerary.toggle(poi.id));
          item.append(name, far, add);
          list.append(item);
        });
      panel.append(list);
    }
  };

  places.itinerary.subscribe(() => {
    status = '';
    render();
  });
  button.addEventListener('click', () => api.toggle());
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyI') api.toggle();
    if (event.code === 'Escape') api.close();
  });

  const api: ItineraryPanel = {
    toggle() {
      panel.hidden = !panel.hidden;
      status = '';
      render();
    },
    close() {
      panel.hidden = true;
    },
  };
  renderButton();
  return api;
}

function iconButton(label: string, title: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = element('button', 'icon-button', label);
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}
