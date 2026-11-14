// =====================================================================
//  heatmeter.ts — the wanted-level meter on the left wall of the scene
//  (V1.4): a siren on top of a vertical column of 10 cells on a small
//  wall plate, filled from the bottom. Pure geometry and colors, no
//  canvas: scene.ts draws the rectangles, Vitest checks them.
// =====================================================================
import { COLOR, MEANING, SHADE, SHOP } from './palette';

/** [x, y, w, h, color] in scene pixels (the scene is 160×100). */
export type MeterRect = [number, number, number, number, string];

/** Geometry in scene pixels. The window and the shelves start at x = 7, right of the meter. */
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
  /** Siren: 6×5 above the plate (y 4–8), off below `blinkFrom`. */
  sirenY: 4,
  /** From this level the siren is lit and, with the highest filled cell, blinks. */
  blinkFrom: 8,
  /** One blink per second: on for half a second, off for half. */
  blinkPeriodMs: 1000,
} as const;

/** Siren sprite relative to (plateX, sirenY): a dome on a steel base. */
const SIREN_DOME: readonly [number, number, number, number][] = [[2, 0, 2, 1], [1, 1, 4, 3]];
const SIREN_BASE: [number, number, number, number] = [0, 4, 6, 1];
const SIREN_SHINE: [number, number, number, number] = [2, 1, 1, 1];

/** Height of the cell column: cells × (height + gap) − last gap. */
export const heatMeterHeight = (cells: number): number => cells * (HEAT_METER.cellH + HEAT_METER.gap) - HEAT_METER.gap;

/** Whether the blinking parts are lit at this moment. */
export const blinkLit = (now: number): boolean => Math.floor(now / (HEAT_METER.blinkPeriodMs / 2)) % 2 === 0;

/** Whether the siren is lit: high wanted level, in the "on" half-second. */
export const sirenLit = (heat: number, now: number): boolean => heat >= HEAT_METER.blinkFrom && blinkLit(now);

/** An empty cell: a 1 px outline in the wall-line color, the wall plate inside. */
function outlinedCell(x: number, y: number, w: number, h: number): MeterRect[] {
  return [[x, y, w, h, COLOR.line], [x + 1, y + 1, w - 2, h - 2, SHOP.wall]];
}

/**
 * The siren, the plate and the cells for a wanted level. Filled cells are
 * solid risk, empty ones are outlines; from `blinkFrom` on, the siren and the
 * highest filled cell blink (dark / outlined in the "off" half-second).
 */
export function heatMeterRects(heat: number, cells: number, now: number): MeterRect[] {
  const { plateX, plateW, cellX, cellW, cellH, gap, top, sirenY, blinkFrom } = HEAT_METER;
  const height = heatMeterHeight(cells);
  const filled = Math.max(0, Math.min(cells, Math.round(heat)));
  const lit = sirenLit(filled, now);
  const rects: MeterRect[] = [
    ...SIREN_DOME.map(([x, y, w, h]): MeterRect => [plateX + x, sirenY + y, w, h, lit ? MEANING.risk : SHOP.shelfLedRedOff]),
    [plateX + SIREN_BASE[0], sirenY + SIREN_BASE[1], SIREN_BASE[2], SIREN_BASE[3], COLOR.steel],
  ];
  if (lit) {
    rects.push([plateX + SIREN_SHINE[0], sirenY + SIREN_SHINE[1], SIREN_SHINE[2], SIREN_SHINE[3], SHADE.shine40]);
  }
  rects.push(
    [plateX, top - 1, plateW, height + 2, SHOP.wall],
    [plateX + 1, top - 1, plateW - 2, 1, SHOP.panelEdge],
  );
  for (let i = 0; i < cells; i++) {
    // i = 0 is the lowest cell
    const y = top + height - (i + 1) * cellH - i * gap;
    const isFilled = i < filled;
    const blinkingOff = isFilled && i === filled - 1 && filled >= blinkFrom && !blinkLit(now);
    if (isFilled && !blinkingOff) {
      rects.push([cellX, y, cellW, cellH, MEANING.risk]);
    } else {
      rects.push(...outlinedCell(cellX, y, cellW, cellH));
    }
  }
  return rects;
}

/** Just the cells (filled ones as one rect, empty ones as their outline rect), lowest first. For tests. */
export function heatMeterCells(heat: number, cells: number, now: number): MeterRect[] {
  return heatMeterRects(heat, cells, now)
    .filter(([x, , w, h]) => x === HEAT_METER.cellX && w === HEAT_METER.cellW && h === HEAT_METER.cellH)
    .sort((a, b) => b[1] - a[1]);
}
