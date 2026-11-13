// =====================================================================
//  palette.ts — every color of the game, the only place with color
//  literals (checked by tests/unit/palette.test.ts).
//  Used by the canvas (scene, appearance), by the rules (floating
//  numbers) and by CSS: vite.config.ts injects CSS_TOKENS into
//  index.html as `:root { --bg: …; }`.
//  Base names describe where a color is used. What a color MEANS in the
//  interface (action, risk, wear…) is the MEANING layer on top (V1.2).
//  Equal or near-equal values in different roles are kept apart on
//  purpose: merging them changes the look and is decided in V1.7.
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
   Shared: interface (CSS) and scene accents
   ===================================================================== */

export const COLOR = {
  bg: '#0f1220',
  panel: '#171b2d',
  panel2: '#1f2440',
  line: '#2d3455',
  fg: '#dde1f3',
  dim: '#8b92b5',
  cyan: '#46d3c9',
  amber: '#f0a33e',
  red: '#ff6372',
  green: '#7fd98e',
  sceneBg: '#141829',
  /** Text on cyan / amber buttons. */
  onAccent: '#0b1620',
  tileEdge: '#2a3152',
  steel: '#5a6080',
  /** Near-black: screens, chest panels, sign box. */
  ink: '#0a0c18',
  gold: '#f0c040',
  /** Light violet in the hue of the planet in the shop window (263°); 5.8:1 on --panel. */
  violet: '#a885e0',
  black: '#000',
  white: '#ffffff',
};

/* =====================================================================
   Meaning: one color = one meaning in the interface (V1.2)
   ===================================================================== */

/**
 * What a color says to the player. UI code picks a meaning, never a base
 * color: `--m-risk` / `MEANING.risk`, not `--red`.
 */
export const MEANING = {
  /** Action, benefit: primary buttons, "clean", "have it", income. */
  action: COLOR.cyan,
  /** Risk: stolen goods, AI virus, wanted level, eviction. */
  risk: COLOR.red,
  /** Time and wear: defect, low condition, patience, broken find. */
  wear: COLOR.amber,
  /** Not checked yet; always paired with a "?" mark, not color alone. */
  unknown: COLOR.dim,
  /** Not available / inactive: the unknown grey, faded. Never red. */
  inactive: withAlpha(COLOR.dim, 0.4),
  /** The gut feeling (Чуйка). */
  hunch: COLOR.violet,
};

/* =====================================================================
   Translucent overlays (base color + alpha)
   ===================================================================== */

/** Shadows (black) and highlights (white) on sprites. */
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

/** Light from neon (cyan) and lamps (amber). Functions: alpha follows the flicker. */
export const GLOW = {
  doorway: withAlpha(COLOR.cyan, 0.25),
  scanLine: withAlpha(COLOR.cyan, 0.35),
  scrapScreen: withAlpha(COLOR.cyan, 0.5),
  sign: (brightness: number): string => withAlpha(COLOR.cyan, 0.10 * brightness),
  planetRing: withAlpha(COLOR.amber, 0.55),
  counterHazard: withAlpha(COLOR.amber, 0.35),
  shopLamp: withAlpha(COLOR.amber, 0.06),
  junkLamp: (brightness: number): string => withAlpha(COLOR.amber, 0.07 * brightness),
};

/* =====================================================================
   Scene: shop
   ===================================================================== */

export const SHOP = {
  wallSeam: '#1b2034',
  wallRivet: '#262c46',
  /** Window frame, doorway frame and door posts. */
  wall: '#232a45',
  space: '#05070f',
  starDim: '#5b6288',
  planetShadow: '#3a2a52',
  planet: '#4e3a6e',
  shelfBoxSlate: '#3c4466',
  shelfBoxBrown: '#5a3f2e',
  shelfBoxGreen: '#2f6a42',
  shelfBoxPurple: '#4a2f55',
  shelfLedGreenOff: '#244a2f',
  shelfLedRedOff: '#4a1f26',
  doorway: '#090b16',
  doorPanel: '#2a3152',
  /** Door edges, counter top edge, scrap plates in the junkyard. */
  panelEdge: '#3a4370',
  signOff: '#1f3b3c',
  signDim: '#2a7f79',
  counter: '#1f2440',
  counterHighlight: '#4f5d94',
  counterPanel: '#1a1e36',
  counterPanelEdge: '#262c4a',
  counterBase: '#171b2d',
  /** Terminal screen and the box robot's face. */
  screenDark: '#06201f',
  night: 'rgba(4, 5, 16, .5)',
};

/* =====================================================================
   Scene: junkyard
   ===================================================================== */

export const JUNKYARD = {
  sky: '#0a0c17',
  starDim: '#3a3f62',
  hills: '#121527',
  ground: '#15182a',
  groundEdge: '#1f2440',
  guardPost: '#1c2035',
  guardLedOff: '#4a1f26',
  lampDim: '#7a5320',
  pileDug: '#1c2035',
  pileLight: '#2a2f4a',
  pileDark: '#252a42',
  pileSpeck: '#5b6288',
  rust: '#4a2f2a',
  rustLight: '#8a5f55',
  glint: '#ffffff',
};

/* =====================================================================
   Characters
   ===================================================================== */

export const CHARACTER = {
  landlordSkin: '#d9a07a',
  landlordCoat: '#1d1a26',
  landlordCoatDark: '#0e0c14',
  landlordRed: '#8a1f2e',
  landlordShirt: '#c9ccd8',
  landlordLapel: '#2a2636',
  landlordMoustache: '#3a2a2a',
  landlordHat: '#0e0c14',
  eyeWhite: '#e8e8f0',
  pupil: '#14121c',
  mouth: 'rgba(110, 40, 50, .7)',
  botLedOff: '#1d4a47',
};

/**
 * Seeded customer looks. The order of every list is part of the look:
 * a seed picks by index, so reordering changes existing customers.
 * Colors shared with the rest of the game point at those tokens, so a new
 * palette (V1.7) recolors customers too.
 */
export const CUSTOMER_TONES = {
  skins: ['#f1c7a3', CHARACTER.landlordSkin, '#a8714f', '#6e4a35', '#e3b48f'],
  hairs: ['#2a2233', '#d94f8a', COLOR.cyan, COLOR.amber, CHARACTER.eyeWhite, '#5b3b2a', '#7a5cff'],
  eyes: [COLOR.cyan, COLOR.red, COLOR.amber, COLOR.green, COLOR.white],
  metals: [COLOR.dim, '#a8925a', '#6f7a8c', '#b5beca', JUNKYARD.rustLight],
  darkMetals: [COLOR.steel, '#4a5266', '#6e5a3a'],
  jacket: (hue: number): string => `hsl(${hue} 30% 34%)`,
  jacketDark: (hue: number): string => `hsl(${hue} 30% 22%)`,
  shirt: (hue: number): string => `hsl(${(hue + 40) % 360} 15% 70%)`,
  trim: (hue: number): string => `hsl(${(hue + 150) % 360} 65% 60%)`,
} as const;

/* =====================================================================
   Item icons
   ===================================================================== */

export const ITEM_COLORS = {
  /** Mid / light / dark metal of most items. */
  mid: COLOR.steel,
  light: COLOR.dim,
  dark: COLOR.line,
  commBody: '#2a2f4a',
  glassShine: '#a5f0ea',
  batteryBody: '#2f6a42',
  batteryTerminal: '#c9ccd8',
  cutterLedOff: '#ff9aa3',
  chipBoard: '#1f6b4f',
  chipDie: '#0d0f18',
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
  '--backdrop': 'rgba(5, 7, 14, .8)',
  '--shadow': withAlpha(COLOR.black, 0.5),
  '--shadow-soft': withAlpha(COLOR.black, 0.45),
  '--black': COLOR.black,
  '--neon-glow': withAlpha(COLOR.cyan, 0.45),
  '--m-action': MEANING.action,
  '--m-risk': MEANING.risk,
  '--m-wear': MEANING.wear,
  '--m-unknown': MEANING.unknown,
  '--m-inactive': MEANING.inactive,
  '--m-hunch': MEANING.hunch,
};

/** `:root { --bg: #0f1220; … }` for the <style> tag in index.html. */
export function cssRootRule(): string {
  const lines = Object.entries(CSS_TOKENS).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/** Browser chrome color (meta theme-color, PWA manifest). */
export const THEME_COLOR = COLOR.bg;
