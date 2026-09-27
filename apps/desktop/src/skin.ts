/**
 * Which skin the renderer wears (prototype). `gamenight` is the illustrated
 * reskin being tried on this branch; `?skin=classic` in the URL brings back the
 * shipped look for comparison. Read once at startup and stamped on <html> as
 * `data-skin`, where `styles/gamenight.css` and the modules' skin rules key off
 * it, the same way `data-lighting` carries day and night.
 */
export type Skin = 'classic' | 'gamenight';

function readSkin(): Skin {
  // The unit suites pin the shipped look; the skin is judged in a browser.
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return 'classic';
  const asked = new URLSearchParams(window.location.search).get('skin');
  return asked === 'classic' ? 'classic' : 'gamenight';
}

export const skin: Skin = readSkin();
export const isGameNight = skin === 'gamenight';

export function applySkin(root: HTMLElement = document.documentElement): void {
  root.dataset.skin = skin;
}
