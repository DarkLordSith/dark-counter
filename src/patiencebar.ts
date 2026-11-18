// =====================================================================
//  patiencebar.ts — the customer's patience over their head on the
//  scene (V2.5): a short wear-colored bar that shrinks with patience and
//  blinks on the last step. Pure geometry and colors, no canvas:
//  scene.ts draws the rectangles, Vitest checks them.
// =====================================================================
import { COLOR, MEANING } from './palette';
import type { MeterRect } from './heatmeter';

/** Geometry in scene pixels, relative to the customer's center x. */
export const PATIENCE_BAR = {
  /** Full bar: about the width of a head (heads are 10–14 px). */
  width: 12,
  height: 2,
  /** Top of the dark frame: right under the "ЛАВКА 7Б" sign (SHOP_SIGN y 3–13). */
  frameY: 14,
  /** Low patience: the last ~25% of it, at least the last point. */
  lowShare: 0.25,
  /** Two blinks per second: lit for a quarter second, dark for a quarter. */
  blinkPeriodMs: 500,
} as const;

/** Filled width in scene pixels: proportional to patience, at least 1 px while any is left. */
export function patienceFill(pat: number, max: number): number {
  if (max <= 0 || pat <= 0) {
    return 0;
  }
  const share = Math.min(1, pat / max);
  return Math.max(1, Math.round(PATIENCE_BAR.width * share));
}

/** Patience is running out: the last quarter of it, or the last point when a quarter is less than one. */
export function patienceLow(pat: number, max: number): boolean {
  if (max <= 0 || pat <= 0) {
    return false;
  }
  return pat <= Math.max(1, Math.floor(max * PATIENCE_BAR.lowShare));
}

/** Whether the low bar is lit at this moment (blinks twice a second). */
export const patienceBlinkLit = (now: number): boolean =>
  Math.floor(now / (PATIENCE_BAR.blinkPeriodMs / 2)) % 2 === 0;

/**
 * The bar for a customer at `centerX`: a 1 px dark frame, the empty track in
 * the wall-line color and the filled part in wear. No patience (Grobov) — no bar.
 * Low patience blinks; with reduced motion it does not blink, the frame turns wear instead.
 */
export function patienceBarRects(pat: number, max: number, centerX: number, now: number, reducedMotion: boolean): MeterRect[] {
  if (max <= 0) {
    return [];
  }
  const { width, height, frameY } = PATIENCE_BAR;
  const left = centerX - width / 2;
  const low = patienceLow(pat, max);
  const frame = low && reducedMotion ? MEANING.wear : COLOR.ink;
  const rects: MeterRect[] = [
    [left - 1, frameY, width + 2, height + 2, frame],
    [left, frameY + 1, width, height, COLOR.line],
  ];
  const filled = patienceFill(pat, max);
  const lit = !low || reducedMotion || patienceBlinkLit(now);
  if (filled > 0 && lit) {
    rects.push([left, frameY + 1, filled, height, MEANING.wear]);
  }
  return rects;
}
