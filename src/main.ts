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

// The hand-written service worker (before Vite) cached files as
// "dark-counter-vN"; Workbox uses its own caches, so drop the old ones.
if ('caches' in window) {
  void caches.keys().then(keys => Promise.all(
    keys.filter(key => /^dark-counter-v\d+$/.test(key)).map(key => caches.delete(key)),
  ));
}
