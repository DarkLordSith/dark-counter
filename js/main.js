// =====================================================================
//  main.js — entry point: restore the save, wire modules, start the loop.
//  Module map:
//    data.js     goods, recipes, names, lines, balance numbers
//    state.js    game state, save / load / migrate, DC1 codes
//    economy.js  haggling, rent, junkyard, night, workbench, crafting
//    scene.js    canvas, sprites, animation loop
//    ui.js       panels rendering and event handlers
//    audio.js    generative lofi
//    util.js     random and DOM helpers
// =====================================================================
import { actorAtCounter, loadGame, migrate, newGame, setState, state } from './state.js';
import { startScene } from './scene.js';
import { bindEvents, render, renderPane, renderSceneOverlay } from './ui.js';

bindEvents();

setState(migrate(loadGame()));
if (!state) {
  newGame();
} else if (state.cust) {
  actorAtCounter(state.cust.seed);
}

render();
startScene(() => {
  renderSceneOverlay();
  renderPane();
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
