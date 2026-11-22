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
  /** ✕ — closes a window (8×8, drawn at 16 px inside a 44 pt button). */
  close: {
    w: 8, h: 8,
    rects: [[0, 0, 2, 1], [6, 0, 2, 1], [1, 1, 2, 1], [5, 1, 2, 1], [2, 2, 4, 1], [3, 3, 2, 2], [2, 5, 4, 1], [1, 6, 2, 1], [5, 6, 2, 1], [0, 7, 2, 1], [6, 7, 2, 1]],
  },
  /** ✕ 5×5 — broken: a known defect (the item tile's status mark, task 35), drawn 2× = 10×10 like the ★. */
  broken: {
    w: 5, h: 5,
    rects: [[0, 0, 1, 1], [4, 0, 1, 1], [1, 1, 1, 1], [3, 1, 1, 1], [2, 2, 1, 1], [1, 3, 1, 1], [3, 3, 1, 1], [0, 4, 1, 1], [4, 4, 1, 1]],
  },
  /** ◉ 5×5 — AI found inside (task 35, the item tile's status mark): a ring with a core. */
  ai: {
    w: 5, h: 5,
    rects: [[1, 0, 3, 1], [0, 1, 1, 3], [4, 1, 1, 3], [2, 2, 1, 1], [1, 4, 3, 1]],
  },
  /** ▲ 5×5 — a filed serial, known stolen (task 35, the item tile's status mark). */
  stolen: {
    w: 5, h: 5,
    rects: [[2, 0, 1, 2], [1, 2, 3, 2], [0, 4, 5, 1]],
  },
  /** ★ 5×5 — a star of the shop's fame (task 42): filled ones in fg, the rest m-inactive; not the gold ★ "rare". */
  fame: {
    w: 5, h: 5,
    rects: [[2, 0, 1, 1], [0, 1, 5, 1], [1, 2, 3, 1], [1, 3, 1, 1], [3, 3, 1, 1], [0, 4, 1, 1], [4, 4, 1, 1]],
  },
  /** Lock — a mode that opens later (16×16: shackle on a body with a keyhole). */
  lock: {
    w: 16, h: 16,
    rects: [[5, 1, 6, 2], [3, 3, 2, 4], [11, 3, 2, 4], [2, 7, 12, 3], [2, 10, 5, 5], [9, 10, 5, 5], [7, 12, 2, 3]],
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
