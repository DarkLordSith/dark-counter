// =====================================================================
//  icons.ts — pixel icons for the interface (V1.4): inline SVG drawn 2×
//  from rectangles on a small grid, like the scene sprites.
//  No emoji and no font glyphs (Public Pixel has no ♪ ☰ ⟲).
//  Colors are not here: the SVG fills with currentColor, CSS picks it
//  from the palette tokens. Pure strings, no DOM.
// =====================================================================

/** [x, y, w, h] on the icon's grid. */
export type IconRect = readonly [number, number, number, number];

interface Icon {
  /** Grid size in icon pixels; drawn 2× in CSS pixels. */
  readonly w: number;
  readonly h: number;
  readonly rects: readonly IconRect[];
}

/** One icon pixel = 2 CSS pixels: sharp at DPR 1, 2 and 3. */
export const ICON_SCALE = 2;

/** Two-cell thick "\" from the top-left corner to the bottom-right one. */
const strikeRects = (): IconRect[] => Array.from({ length: 14 }, (_, i): IconRect => [1 + i, 1 + i, 2, 1]);

export const ICONS = {
  /** ♪ — eighth note (16×16, the 44 pt button shows it at 32 px). */
  note: {
    w: 16, h: 16,
    rects: [
      [9, 1, 2, 10], // stem
      [11, 1, 2, 2], [13, 3, 1, 3], [12, 6, 1, 1], // flag
      [5, 10, 5, 1], [4, 11, 7, 2], [5, 13, 5, 1], // head
    ],
  },
  /** Strike over the note: music is off. */
  strike: { w: 16, h: 16, rects: strikeRects() },
  /** ☰ — menu. */
  menu: {
    w: 16, h: 16,
    rects: [[2, 3, 12, 2], [2, 7, 12, 2], [2, 11, 12, 2]],
  },
  /** Eye — the wanted level label in the HUD (8×6: as tall as the 12 px labels). */
  eye: {
    w: 8, h: 6,
    rects: [[2, 0, 4, 1], [1, 1, 1, 1], [6, 1, 1, 1], [0, 2, 1, 2], [7, 2, 1, 2], [3, 2, 2, 2], [1, 4, 1, 1], [6, 4, 1, 1], [2, 5, 4, 1]],
  },
} as const satisfies Record<string, Icon>;

export type IconName = keyof typeof ICONS;

const rects = (list: readonly IconRect[], cssClass = ''): string =>
  list.map(([x, y, w, h]) => `<rect${cssClass ? ` class="${cssClass}"` : ''} x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');

/**
 * SVG markup for an icon, optionally with an overlay (the strike). A one-cell
 * gap under the overlay (class ico-cut, filled with the button background in
 * CSS) keeps the strike readable where it crosses the note.
 */
export function iconSvg(name: IconName, overlay?: IconName): string {
  const icon: Icon = ICONS[name];
  const cut = overlay ? rects(ICONS[overlay].rects.map(([x, y, w, h]): IconRect => [x - 1, y, w + 1, h + 1]), 'ico-cut') : '';
  const top = overlay ? rects(ICONS[overlay].rects) : '';
  return `<svg class="ico" viewBox="0 0 ${icon.w} ${icon.h}" width="${icon.w * ICON_SCALE}" height="${icon.h * ICON_SCALE}" `
    + `shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects(icon.rects)}${cut}${top}</svg>`;
}
