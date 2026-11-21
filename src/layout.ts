// =====================================================================
//  layout.ts — the Mac layout (V2.4), pure geometry: the scene takes the
//  whole browser window at the largest whole scale, the action bar and
//  the HUD lie over its bottom edge, and the mini windows stay inside
//  the scene: clear of the "ЛАВКА 7Б" sign and, when there is room, of
//  the customer at the counter. No DOM: ui.ts and window.ts apply it,
//  Vitest checks it on browser window sizes.
// =====================================================================
import { CUSTOMER_ZONE, SHOP_SIGN } from './data';

/** The Mac layout: a mouse and a window at least as wide as the desktop type profile (DESKTOP_QUERY). */
export const DESK_QUERY = '(pointer: fine) and (min-width: 900px)';

/** Scene size in logical pixels. */
export const SCENE_W = 160;
export const SCENE_H = 100;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The scene on the screen: a whole scale (×9 on 1440×900), centered, the rest of the window is `bg`. */
export function stageFit(viewport: { width: number; height: number }): Box & { scale: number } {
  const scale = Math.max(1, Math.floor(Math.min(viewport.width / SCENE_W, viewport.height / SCENE_H)));
  const width = SCENE_W * scale;
  const height = SCENE_H * scale;
  return {
    scale,
    width,
    height,
    left: Math.floor((viewport.width - width) / 2),
    top: Math.floor((viewport.height - height) / 2),
  };
}

/** Mini window width on the Mac scene, and the narrowest one worth putting at a side of the customer. */
export const DESK_WINDOW_WIDTH = 360;
export const DESK_WINDOW_MIN = 260;
/** The stock and its bench (task 41): wider, so the 8 filter chips take 1–2 rows, not 3; still clear of the customer. */
export const DESK_WINDOW_WIDE = 520;
export const DESK_MARGIN = 12;
/** The wanted-level meter on the left wall (scene x 0–5): a window on the left stays right of it. */
const WANTED_RIGHT = 6;

export interface WindowPlace extends Box {
  /** At the right or the left edge of the scene (the customer is clear), or 'over' him when neither side has room. */
  side: 'right' | 'left' | 'over';
}

/**
 * Where a mini window goes on the Mac scene. Always inside the scene, below the "ЛАВКА 7Б" sign,
 * above `floor` (the top of the action bar and the HUD lying over the scene).
 * At the right edge of the scene, past the customer (the speech bubble is on the left), else at the
 * left edge, else over the customer at the right edge. The height is a cap: a longer window scrolls inside.
 */
export function deskWindowPlacement(stage: Box, floor: number, width = DESK_WINDOW_WIDTH, margin = DESK_MARGIN): WindowPlace {
  const scale = stage.width / SCENE_W;
  const right = stage.left + stage.width - margin;
  const top = Math.round(stage.top + (SHOP_SIGN.y + SHOP_SIGN.h) * scale + margin);
  const bottom = Math.min(floor, stage.top + stage.height) - margin;
  const height = Math.max(0, Math.round(bottom - top));
  const rightRoom = right - (stage.left + CUSTOMER_ZONE.right * scale + margin);
  if (rightRoom >= DESK_WINDOW_MIN) {
    const w = Math.floor(Math.min(width, rightRoom));
    return { left: Math.round(right - w), top, width: w, height, side: 'right' };
  }
  const leftEdge = stage.left + WANTED_RIGHT * scale + margin;
  const leftRoom = stage.left + CUSTOMER_ZONE.left * scale - margin - leftEdge;
  if (leftRoom >= DESK_WINDOW_MIN) {
    return { left: Math.round(leftEdge), top, width: Math.floor(Math.min(width, leftRoom)), height, side: 'left' };
  }
  const w = Math.floor(Math.max(0, Math.min(width, stage.width - 2 * margin)));
  return { left: Math.round(right - w), top, width: w, height, side: 'over' };
}
