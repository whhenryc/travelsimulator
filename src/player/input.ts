const JOYSTICK_RADIUS = 55;
const RUN_THRESHOLD = 0.9;
const MOVE_KEYS: Record<string, [x: number, y: number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export interface InputState {
  /** 向右為正，-1 至 1 */
  moveX: number;
  /** 向前為正，-1 至 1 */
  moveY: number;
  run: boolean;
  /** 上次讀取之後累積嘅拖動（像素） */
  lookX: number;
  lookY: number;
}

export interface PlayerInput {
  read(): InputState;
}

export function createInput(element: HTMLElement): PlayerInput {
  const pressed = new Set<string>();
  window.addEventListener('keydown', (event) => pressed.add(event.code));
  window.addEventListener('keyup', (event) => pressed.delete(event.code));
  window.addEventListener('blur', () => pressed.clear());

  const joystick = document.createElement('div');
  joystick.className = 'joystick';
  const knob = document.createElement('div');
  knob.className = 'joystick-knob';
  joystick.appendChild(knob);
  document.body.appendChild(joystick);

  let stickPointer: number | null = null;
  let stickOriginX = 0;
  let stickOriginY = 0;
  let stickX = 0;
  let stickY = 0;
  const lookPointers = new Map<number, { x: number; y: number }>();
  let lookX = 0;
  let lookY = 0;

  const moveStick = (clientX: number, clientY: number): void => {
    let dx = clientX - stickOriginX;
    let dy = clientY - stickOriginY;
    const distance = Math.hypot(dx, dy);
    if (distance > JOYSTICK_RADIUS) {
      dx = (dx / distance) * JOYSTICK_RADIUS;
      dy = (dy / distance) * JOYSTICK_RADIUS;
    }
    stickX = dx / JOYSTICK_RADIUS;
    stickY = -dy / JOYSTICK_RADIUS;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystick.classList.toggle('running', Math.hypot(stickX, stickY) >= RUN_THRESHOLD);
  };

  const releaseStick = (): void => {
    stickPointer = null;
    stickX = 0;
    stickY = 0;
    knob.style.transform = '';
    joystick.classList.remove('running');
    joystick.style.display = 'none';
  };

  element.addEventListener('pointerdown', (event) => {
    element.setPointerCapture(event.pointerId);
    const isLeftTouch = event.pointerType === 'touch' && event.clientX < window.innerWidth / 2;
    if (isLeftTouch && stickPointer === null) {
      stickPointer = event.pointerId;
      stickOriginX = event.clientX;
      stickOriginY = event.clientY;
      joystick.style.left = `${stickOriginX}px`;
      joystick.style.top = `${stickOriginY}px`;
      joystick.style.display = 'block';
    } else {
      lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
  });

  element.addEventListener('pointermove', (event) => {
    if (event.pointerId === stickPointer) {
      moveStick(event.clientX, event.clientY);
      return;
    }
    const last = lookPointers.get(event.pointerId);
    if (!last) return;
    lookX += event.clientX - last.x;
    lookY += event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
  });

  const endPointer = (event: PointerEvent): void => {
    if (event.pointerId === stickPointer) releaseStick();
    lookPointers.delete(event.pointerId);
  };
  element.addEventListener('pointerup', endPointer);
  element.addEventListener('pointercancel', endPointer);
  element.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    read() {
      let keyX = 0;
      let keyY = 0;
      for (const code of pressed) {
        const direction = MOVE_KEYS[code];
        if (direction) {
          keyX += direction[0];
          keyY += direction[1];
        }
      }
      let moveX = keyX + stickX;
      let moveY = keyY + stickY;
      const magnitude = Math.hypot(moveX, moveY);
      if (magnitude > 1) {
        moveX /= magnitude;
        moveY /= magnitude;
      }

      const state: InputState = {
        moveX,
        moveY,
        run:
          pressed.has('ShiftLeft') ||
          pressed.has('ShiftRight') ||
          Math.hypot(stickX, stickY) >= RUN_THRESHOLD,
        lookX,
        lookY,
      };
      lookX = 0;
      lookY = 0;
      return state;
    },
  };
}
