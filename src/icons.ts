// =====================================================================
//  icons.ts — pixel icons for the interface (V1.4): inline SVG drawn 2×
//  from rectangles on a small grid, like the scene sprites.
//  No emoji and no font glyphs (Public Pixel has no ☰).
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

export const ICONS = {
  /** ☰ — menu (16×16, the 44 pt button shows it at 32 px). */
  menu: {
    w: 16, h: 16,
    rects: [[2, 3, 12, 2], [2, 7, 12, 2], [2, 11, 12, 2]],
  },
} as const satisfies Record<string, Icon>;

export type IconName = keyof typeof ICONS;

/** SVG markup for an icon. */
export function iconSvg(name: IconName): string {
  const icon: Icon = ICONS[name];
  const body = icon.rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
  return `<svg class="ico" viewBox="0 0 ${icon.w} ${icon.h}" width="${icon.w * ICON_SCALE}" height="${icon.h * ICON_SCALE}" `
    + `shape-rendering="crispEdges" aria-hidden="true" focusable="false">${body}</svg>`;
}
