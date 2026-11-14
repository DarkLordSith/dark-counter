// =====================================================================
//  heatmeter.ts — the wanted-level meter on the left wall of the scene
//  (V1.4 fix): a vertical column of 10 cells on a small wall plate,
//  filled from the bottom. Pure geometry and colors, no canvas:
//  scene.ts draws the rectangles, Vitest checks them.
// =====================================================================
import { COLOR, MEANING, SHOP } from './palette';

/** [x, y, w, h, color] in scene pixels (the scene is 160×100). */
export type MeterRect = [number, number, number, number, string];

/** Geometry in scene pixels. The window and the shelves start at x = 7, right of the plate. */
export const HEAT_METER = {
  /** Plate: x 0–5. */
  plateX: 0,
  plateW: 6,
  /** Cells: 4 px wide, 4 px tall, 1 px apart, the lowest one at the bottom. */
  cellX: 1,
  cellW: 4,
  cellH: 4,
  gap: 1,
  /** Top of the highest cell. */
  top: 11,
  /** The highest filled cell blinks from this level on. */
  blinkFrom: 7,
  /** One blink per second: on for half a second, off for half. */
  blinkPeriodMs: 1000,
} as const;

/** Bottom edge of the meter: cells × (height + gap) − last gap. */
export const heatMeterHeight = (cells: number): number => cells * (HEAT_METER.cellH + HEAT_METER.gap) - HEAT_METER.gap;

/** Whether the blinking cell is lit at this moment. */
export const blinkLit = (now: number): boolean => Math.floor(now / (HEAT_METER.blinkPeriodMs / 2)) % 2 === 0;

/**
 * The plate and the cells for a wanted level. Empty cells are the wall-line
 * color, filled ones are the risk color; from `blinkFrom` on, the highest
 * filled cell blinks (drawn empty in the "off" half-second).
 */
export function heatMeterRects(heat: number, cells: number, now: number): MeterRect[] {
  const { plateX, plateW, cellX, cellW, cellH, gap, top, blinkFrom } = HEAT_METER;
  const height = heatMeterHeight(cells);
  const filled = Math.max(0, Math.min(cells, Math.round(heat)));
  const rects: MeterRect[] = [
    [plateX, top - 1, plateW, height + 2, SHOP.wall],
    [plateX + 1, top - 1, plateW - 2, 1, SHOP.panelEdge],
  ];
  for (let i = 0; i < cells; i++) {
    // i = 0 is the lowest cell
    const y = top + height - (i + 1) * cellH - i * gap;
    const isFilled = i < filled;
    const blinkingOff = isFilled && i === filled - 1 && filled >= blinkFrom && !blinkLit(now);
    rects.push([cellX, y, cellW, cellH, isFilled && !blinkingOff ? MEANING.risk : COLOR.line]);
  }
  return rects;
}
