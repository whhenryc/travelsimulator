import type { Ambience } from '../audio/ambience';

export function createSoundToggle(ambience: Ambience): void {
  const button = document.createElement('button');
  button.id = 'sound-toggle';
  button.type = 'button';
  const render = (): void => {
    button.textContent = ambience.enabled ? '🔊 聲音：開' : '🔇 聲音：關';
    button.setAttribute('aria-pressed', String(ambience.enabled));
  };
  button.addEventListener('click', () => {
    ambience.toggle();
    render();
  });
  // 唔好等撳掣嗰下觸發「第一次撳畫面就開聲」
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  render();
  document.body.appendChild(button);
}
