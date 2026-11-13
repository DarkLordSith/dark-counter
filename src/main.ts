// =====================================================================
//  main.ts — entry point: restore the save, wire modules, start the loop.
//  Module map (imports flow left to right, no cycles):
//    types/data/util → appearance → state → economy → scene → ui → main
//    diag (debug overlay) depends only on dom/version and is wired here.
//  The service worker is registered by vite-plugin-pwa (see vite.config.ts).
// =====================================================================
import './style.css';
import { markIosPwa } from './dom';
import { actorAtCounter, loadGame, migrate, newGame, setState, state } from './state';
import { startScene } from './scene';
import { bindEvents, render, renderPane, renderSceneOverlay } from './ui';
import { bindDiagnostics } from './diag';

markIosPwa();
bindEvents();
bindDiagnostics();

const saved = migrate(loadGame());
if (saved) {
  setState(saved);
  if (state.cust) {
    actorAtCounter(state.cust.seed);
  }
} else {
  newGame();
}

render();
startScene(() => {
  renderSceneOverlay();
  renderPane();
});

// Google Fonts serves IBM Plex Mono in unicode subsets, fetched only when a glyph is
// first drawn. Ask for the Cyrillic of every weight in use (400 text, 500 speech
// bubble, 600 names and main buttons) right away, so the Workbox "google-fonts"
// cache has them all and offline text never drops to a fallback face.
if ('fonts' in document) {
  for (const weight of [400, 500, 600]) {
    void document.fonts.load(`${weight} 14px "IBM Plex Mono"`, 'Ёё Жж Яя').catch(() => {});
  }
}

// The hand-written service worker (before Vite) cached files as
// "dark-counter-vN"; Workbox uses its own caches, so drop the old ones.
if ('caches' in window) {
  void caches.keys().then(keys => Promise.all(
    keys.filter(key => /^dark-counter-v\d+$/.test(key)).map(key => caches.delete(key)),
  ));
}
