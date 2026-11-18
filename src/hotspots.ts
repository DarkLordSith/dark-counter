// =====================================================================
//  hotspots.ts — scene hotspots (V2.1): which object of the shop is
//  under a point and whether it is live now, plus the bell sprite.
//  Pure rules, no DOM: scene.ts draws the hints and the bell, ui.ts
//  runs the hotspot's action like a button (same data-a / data-v).
// =====================================================================
import { canCallNext } from './actionbar';
import type { SceneFigure } from './actionbar';
import { HOTSPOTS } from './data';
import { SHOP } from './palette';
import type { GameState, Hotspot, PointerKind } from './types';

/** Is the hotspot live in this game moment, for this pointer? */
export function isLive(spot: Hotspot, state: GameState, figure: SceneFigure, pointer: PointerKind): boolean {
  if (state.over || state.where === 'junk') {
    return false; // the junkyard has its own heap zone; after the end the scene is a picture
  }
  switch (spot.when) {
    case 'shop':
      return true;
    case 'customer':
      return state.phase === 'shop' && state.cust !== null && figure.phase === 'idle';
    case 'bell':
      return canCallNext(state, figure);
    case 'mouse':
      return pointer === 'mouse';
  }
}

const contains = (spot: Hotspot, x: number, y: number): boolean =>
  x >= spot.x && x < spot.x + spot.w && y >= spot.y && y < spot.y + spot.h;

/** The live hotspot under scene point (x, y), or null (a miss, decor, or an inactive object). */
export function hitTest(x: number, y: number, state: GameState, figure: SceneFigure, pointer: PointerKind = 'touch'): Hotspot | null {
  return HOTSPOTS.find(spot => contains(spot, x, y) && isLive(spot, state, figure, pointer)) ?? null;
}

/** Zones that pulse on the first day until the first tap (the bell and the meter do not). */
export const HINTED: readonly Hotspot['id'][] = ['shelves', 'terminal', 'client'];

/* ---------- the bell, 8×5, drawn with fillRects (no PNG) ---------- */

type BellRect = [number, number, number, number, string];

/** Rest: a cap on top, the light from the top left, a rust base on the counter. */
const BELL_UP: readonly BellRect[] = [
  [3, 0, 2, 1, SHOP.bellCap],
  [2, 1, 1, 1, SHOP.bellShine],
  [3, 1, 3, 1, SHOP.bellBody],
  [1, 2, 1, 1, SHOP.bellShine],
  [2, 2, 4, 1, SHOP.bellBody],
  [6, 2, 1, 1, SHOP.bellShade],
  [0, 3, 6, 1, SHOP.bellBody],
  [6, 3, 2, 1, SHOP.bellShade],
  [0, 4, 6, 1, SHOP.bellBase],
  [6, 4, 2, 1, SHOP.bellBaseShade],
];

/** Pressed (~150 ms): the cap is down 1 px, inside the dome (owner's frame 2 in pixelarts/bell-8x5). */
const BELL_DOWN: readonly BellRect[] = [
  [2, 1, 1, 1, SHOP.bellShine],
  [3, 1, 2, 1, SHOP.bellCap],
  [5, 1, 1, 1, SHOP.bellBody],
  ...BELL_UP.slice(3),
];

export const bellSprite = (pressed: boolean): readonly BellRect[] => pressed ? BELL_DOWN : BELL_UP;

/** Opacity of the bell when there is no one to call (evening, empty queue, a customer at the counter). */
export const BELL_IDLE_ALPHA = 0.43;
/** How long a tap flashes the object and holds the bell down. */
export const PRESS_MS = 150;
