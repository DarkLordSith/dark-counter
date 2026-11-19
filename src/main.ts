// =====================================================================
//  main.ts — entry point: restore the save, wire modules, start the loop.
//  Module map (imports flow left to right, no cycles):
//    types/data/util → appearance → profile → state → economy → scene → ui → main
//    diag (debug overlay) depends only on dom/version and is wired here.
//  The service worker is registered here through vite-plugin-pwa (registerSW).
// =====================================================================
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { markIosPwa } from './dom';
import { startScene } from './scene';
import { bindEvents, renderPane, renderSceneOverlay, startGame } from './ui';
import { bindDiagnostics } from './diag';
import { applyStoredFontLab } from './fontlab';
import { plainSave } from './i18n';

markIosPwa();
applyStoredFontLab();
bindEvents();
bindDiagnostics();

// tests/parity compares saves with the log as plain Russian text (task 34: the log is stored as keys)
Object.assign(window, { __dcPlainSave: plainSave });

// continues the last played mode; the very first launch opens the mode screen
startGame();
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

// Service worker. registerType 'autoUpdate': a new build activates right away and
// registerSW reloads the page onto it. Without the reload the open page kept the old
// code: an iOS PWA lives in memory for hours, so a "new game" started on the old
// balance (debt 25 000, task 25). The game is saved on every render, a reload loses
// nothing but the open window. An installed PWA resumed from the background does not
// navigate, so it also checks for an update every time it comes back to the screen.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) {
      return;
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void registration.update().catch(() => {});
      }
    });
  },
});
