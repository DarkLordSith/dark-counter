// =====================================================================
//  palette.ts — every color of the game, the only place with color
//  literals (checked by tests/unit/palette.test.ts).
//  Used by the canvas (scene, appearance), by the rules (floating
//  numbers) and by CSS: vite.config.ts injects CSS_TOKENS into
//  index.html as `:root { --bg: …; }`.
//  Base names describe where a color is used. What a color MEANS in the
//  interface (action, risk, wear…) is the MEANING layer on top (V1.2).
//  V1.7 "Сталь и ржавчина": exactly 16 base colors (BASE) — the only hex
//  literals here. Every role below points at a base color or at
//  withAlpha() of one; role names stay, so the drawing code is unchanged.
//  The same 16 colors are in dark-counter-palette-A.gpl (Piskel/Aseprite).
//  Pure data: no DOM, safe to import from Vitest and vite.config.ts.
// =====================================================================

/** '#rgb' or '#rrggbb' + alpha → 'rgba(r, g, b, alpha)'. Same pixels as the hand-written rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join('') : digits;
  const channel = (index: number): number => parseInt(full.slice(index * 2, index * 2 + 2), 16);
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${alpha})`;
}

/* =====================================================================
   The 16 base colors (V1.7 palette A "Сталь и ржавчина")
   ===================================================================== */

export const BASE = {
  /** Darkest: sky, doorways, text on action buttons. */
  ink: '#0b0d12',
  /** Page and scene background. */
  bg: '#12151c',
  /** Panels, cards, the counter, the speech bubble. */
  panel: '#1b1f28',
  /** Walls, seams, meter tracks. */
  wall: '#272c36',
  /** Borders, lines, tile edges, empty wanted cells. */
  line: '#3a404c',
  /** Secondary text, HUD labels, `unknown`; `inactive` is dim faded. */
  dim: '#7d8392',
  /** Main text, HUD numbers. */
  fg: '#cfcabd',
  /** Dark rust: box shadows, dark hair. */
  rustDark: '#3d2a21',
  /** Rust, wood, hair, dark skin. */
  rust: '#7a4a32',
  /** Light skin. */
  skin: '#c08a68',
  /** Teal: action, main button, the bubble frame, neon. */
  action: '#3fc1b0',
  /** Amber: time, wear, defect, patience, lamp light. */
  wear: '#e0943a',
  /** Stolen, AI, wanted, the siren. */
  risk: '#e0524a',
  /** Чуйка, the planet in the window. */
  hunch: '#8a6bd8',
  /** In stock, battery charge, indicator screens. */
  ok: '#74b86a',
  /** Glints, stars, lamp light. */
  lamp: '#ecd9a0',
} as const;

/* =====================================================================
   Shared: interface (CSS) and scene accents
   ===================================================================== */

export const COLOR = {
  bg: BASE.bg,
  panel: BASE.panel,
  panel2: BASE.wall,
  line: BASE.line,
  fg: BASE.fg,
  dim: BASE.dim,
  cyan: BASE.action,
  amber: BASE.wear,
  red: BASE.risk,
  green: BASE.ok,
  sceneBg: BASE.bg,
  /** Text on teal / amber buttons. */
  onAccent: BASE.ink,
  tileEdge: BASE.line,
  steel: BASE.line,
  /** Near-black: screens, chest panels, sign box. */
  ink: BASE.ink,
  gold: BASE.lamp,
  /** The gut feeling and the planet in the shop window. */
  violet: BASE.hunch,
  /** Shadows: the darkest base color, never pure black. */
  black: BASE.ink,
  /** Highlights: the lamp light, never pure white. */
  white: BASE.lamp,
};

/* =====================================================================
   Meaning: one color = one meaning in the interface (V1.2)
   ===================================================================== */

/**
 * What a color says to the player. UI code picks a meaning, never a base
 * color: `--m-risk` / `MEANING.risk`, not `--red`.
 */
export const MEANING = {
  /** Action, benefit: primary buttons, "clean", income. */
  action: BASE.action,
  /** In stock, ready: recipe parts the player has. */
  ok: BASE.ok,
  /** Risk: stolen goods, AI virus, wanted level, eviction. */
  risk: BASE.risk,
  /** Time and wear: defect, low condition, patience, broken find, past midnight. */
  wear: BASE.wear,
  /** Not checked yet; always paired with a "?" mark, not color alone. */
  unknown: BASE.dim,
  /** Not available / inactive: the unknown grey, faded. Never red. */
  inactive: withAlpha(BASE.dim, 0.4),
  /** The gut feeling (Чуйка). */
  hunch: BASE.hunch,
};

/* =====================================================================
   Translucent overlays (base color + alpha)
   ===================================================================== */

/** Shadows (ink) and highlights (lamp light) on sprites. */
export const SHADE = {
  shadow13: withAlpha(COLOR.black, 0.13),
  shadow15: withAlpha(COLOR.black, 0.15),
  shadow16: withAlpha(COLOR.black, 0.16),
  shadow18: withAlpha(COLOR.black, 0.18),
  shadow20: withAlpha(COLOR.black, 0.2),
  shadow22: withAlpha(COLOR.black, 0.22),
  shadow25: withAlpha(COLOR.black, 0.25),
  shadow30: withAlpha(COLOR.black, 0.3),
  closedEye: withAlpha(COLOR.black, 0.35),
  closedEyeAndroid: withAlpha(COLOR.black, 0.4),
  shine07: withAlpha(COLOR.white, 0.07),
  shine20: withAlpha(COLOR.white, 0.2),
  shine25: withAlpha(COLOR.white, 0.25),
  shine35: withAlpha(COLOR.white, 0.35),
  shine40: withAlpha(COLOR.white, 0.4),
};

/** Light from neon (teal) and lamps (amber). Functions: alpha follows the flicker. */
export const GLOW = {
  doorway: withAlpha(BASE.action, 0.25),
  scanLine: withAlpha(BASE.action, 0.35),
  scrapScreen: withAlpha(BASE.action, 0.5),
  sign: (brightness: number): string => withAlpha(BASE.action, 0.10 * brightness),
  planetRing: withAlpha(BASE.wear, 0.55),
  counterHazard: withAlpha(BASE.wear, 0.35),
  shopLamp: withAlpha(BASE.wear, 0.06),
  junkLamp: (brightness: number): string => withAlpha(BASE.wear, 0.07 * brightness),
  /** Guard drone searchlight over the junk heap (v2). */
  droneBeam: (brightness: number): string => withAlpha(BASE.risk, 0.12 * brightness),
};

/* =====================================================================
   Scene: shop
   ===================================================================== */

export const SHOP = {
  wallSeam: BASE.panel,
  wallRivet: BASE.wall,
  /** Window frame, doorway frame and door posts. */
  wall: BASE.wall,
  space: BASE.ink,
  starDim: BASE.dim,
  planetShadow: withAlpha(BASE.hunch, 0.3),
  planet: withAlpha(BASE.hunch, 0.55),
  shelfBoxSlate: BASE.line,
  shelfBoxBrown: BASE.rust,
  shelfBoxGreen: BASE.rustDark,
  shelfBoxPurple: BASE.wall,
  shelfLedGreenOff: withAlpha(BASE.ok, 0.3),
  shelfLedRedOff: withAlpha(BASE.risk, 0.3),
  doorway: BASE.ink,
  doorPanel: BASE.wall,
  /** Door edges, counter top edge, scrap plates in the junkyard. */
  panelEdge: BASE.line,
  signOff: withAlpha(BASE.action, 0.15),
  signDim: withAlpha(BASE.action, 0.5),
  counter: BASE.panel,
  counterHighlight: BASE.dim,
  counterPanel: BASE.bg,
  counterPanelEdge: BASE.wall,
  counterBase: BASE.ink,
  /** Terminal screen and the box robot's face. */
  screenDark: BASE.ink,
  night: withAlpha(BASE.ink, 0.5),
};

/* =====================================================================
   Scene: junkyard
   ===================================================================== */

export const JUNKYARD = {
  sky: BASE.bg,
  /** Past midnight (task 16): the sky goes darker, the stars show more. */
  skyNight: BASE.ink,
  starDim: BASE.line,
  hills: BASE.panel,
  ground: BASE.bg,
  groundEdge: BASE.wall,
  guardPost: BASE.wall,
  guardLedOff: withAlpha(BASE.risk, 0.3),
  lampDim: withAlpha(BASE.wear, 0.5),
  pileDug: BASE.panel,
  pileLight: BASE.line,
  pileDark: BASE.wall,
  pileSpeck: BASE.dim,
  rust: BASE.rustDark,
  rustLight: BASE.rust,
  glint: BASE.lamp,
};

/* =====================================================================
   Characters
   ===================================================================== */

export const CHARACTER = {
  landlordSkin: BASE.skin,
  landlordCoat: BASE.wall,
  landlordCoatDark: BASE.ink,
  landlordRed: BASE.risk,
  landlordShirt: BASE.fg,
  landlordLapel: BASE.line,
  landlordMoustache: BASE.rustDark,
  landlordHat: BASE.ink,
  eyeWhite: BASE.fg,
  pupil: BASE.ink,
  mouth: withAlpha(BASE.rustDark, 0.7),
  botLedOff: withAlpha(BASE.action, 0.25),
};

/**
 * Seeded customer looks. The order of every list is part of the look:
 * a seed picks by index, so reordering changes existing customers.
 * V1.7: clothes come from the base colors too (no generated hues). A seed picks
 * a jacket pair, a shirt and an accent trim, so customers stay different; the
 * jackets are lighter or warmer than the counter (panel) so they do not merge with it.
 */
export const CUSTOMER_TONES = {
  skins: [BASE.skin, CHARACTER.landlordSkin, BASE.rust, BASE.rust, BASE.skin],
  hairs: [BASE.rustDark, BASE.risk, BASE.action, BASE.wear, CHARACTER.eyeWhite, BASE.rust, BASE.hunch],
  eyes: [BASE.action, BASE.risk, BASE.wear, BASE.ok, BASE.lamp],
  metals: [BASE.dim, BASE.skin, BASE.dim, BASE.fg, BASE.rust],
  darkMetals: [BASE.line, BASE.wall, BASE.rustDark],
  /** Jacket and its shadow side, in pairs. */
  jackets: [[BASE.line, BASE.wall], [BASE.rust, BASE.rustDark], [BASE.dim, BASE.line], [BASE.rustDark, BASE.ink]],
  shirts: [BASE.fg, BASE.lamp, BASE.dim],
  trims: [BASE.action, BASE.wear, BASE.risk, BASE.hunch, BASE.ok, BASE.lamp],
} as const;

/* =====================================================================
   Item icons
   ===================================================================== */

export const ITEM_COLORS = {
  /** Mid / light / dark metal of most items. */
  mid: COLOR.steel,
  light: COLOR.dim,
  dark: BASE.wall,
  commBody: BASE.wall,
  glassShine: BASE.lamp,
  batteryBody: BASE.ok,
  batteryTerminal: BASE.fg,
  cutterLedOff: withAlpha(BASE.risk, 0.6),
  chipBoard: withAlpha(BASE.ok, 0.5),
  chipDie: BASE.ink,
};

/* =====================================================================
   CSS custom properties (injected into index.html by vite.config.ts)
   ===================================================================== */

/** `--name` → color. Components use these names; non-color tokens stay in style.css. */
export const CSS_TOKENS: Readonly<Record<string, string>> = {
  '--bg': COLOR.bg,
  '--panel': COLOR.panel,
  '--panel2': COLOR.panel2,
  '--line': COLOR.line,
  '--fg': COLOR.fg,
  '--dim': COLOR.dim,
  '--cyan': COLOR.cyan,
  '--amber': COLOR.amber,
  '--red': COLOR.red,
  '--green': COLOR.green,
  '--scene-bg': COLOR.sceneBg,
  '--on-accent': COLOR.onAccent,
  '--tile-edge': COLOR.tileEdge,
  '--chip-bg': withAlpha(COLOR.ink, 0.8),
  '--backdrop': withAlpha(BASE.ink, 0.8),
  '--shadow': withAlpha(COLOR.black, 0.5),
  '--shadow-soft': withAlpha(COLOR.black, 0.45),
  '--black': COLOR.black,
  '--neon-glow': withAlpha(COLOR.cyan, 0.45),
  /** Debug sheets over the game (font lab): see-through enough to watch the change. */
  '--sheet': withAlpha(COLOR.panel, 0.94),
  '--m-action': MEANING.action,
  '--m-ok': MEANING.ok,
  '--m-risk': MEANING.risk,
  '--m-wear': MEANING.wear,
  '--m-unknown': MEANING.unknown,
  '--m-inactive': MEANING.inactive,
  '--m-hunch': MEANING.hunch,
};

/** `:root { --bg: #12151c; … }` for the <style> tag in index.html. */
export function cssRootRule(): string {
  const lines = Object.entries(CSS_TOKENS).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/** Browser chrome color (meta theme-color, PWA manifest). */
export const THEME_COLOR = COLOR.bg;
