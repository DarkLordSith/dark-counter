// One source of colors: src/palette.ts. Fails on a color literal anywhere else.
import { describe, expect, it } from 'vitest';
import { BASE, COLOR, CSS_TOKENS, cssRootRule, CUSTOMER_TONES, THEME_COLOR, withAlpha } from '../../src/palette';
import gpl from '../../src/dark-counter-palette-A.gpl?raw';

/** Game sources as text, keyed like 'src/scene.ts'. Picked up automatically, new files included. */
const SOURCES: Record<string, string> = Object.fromEntries(Object.entries({
  ...import.meta.glob<string>('../../src/**/*.{ts,css}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('../../{index.html,vite.config.ts}', { query: '?raw', import: 'default', eager: true }),
}).map(([path, text]) => [path.replace('../../', ''), text]));

/** Files allowed to contain color literals. Keep this list short and explicit. */
const ALLOWED = ['src/palette.ts'];

/** #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(). */
const COLOR_LITERAL = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?)\(/gi;

const sourceFiles = (): string[] => Object.keys(SOURCES);
const read = (file: string): string => SOURCES[file];

describe('color literals', () => {
  it('scans the game sources', () => {
    expect(sourceFiles()).toEqual(expect.arrayContaining(['src/scene.ts', 'src/style.css', 'src/palette.ts', 'index.html']));
  });

  it('appear only in src/palette.ts', () => {
    const offenders = sourceFiles()
      .filter(file => !ALLOWED.includes(file))
      .flatMap(file => read(file).split('\n').flatMap((line, index) =>
        [...line.matchAll(COLOR_LITERAL)].map(match => `${file}:${index + 1}: ${match[0]}  ←  ${line.trim()}`)));
    expect(offenders, 'move these colors to src/palette.ts').toEqual([]);
  });

  it('the check itself catches every literal form', () => {
    const samples = ["'#fff'", "'#0f1220'", "'#0f1220cc'", 'rgba(0,0,0,.5)', 'rgb(1 2 3)', 'hsl(10 20% 30%)'];
    expect(samples.every(sample => sample.match(COLOR_LITERAL))).toBe(true);
    expect('#app #hud #diag #actionbar'.match(COLOR_LITERAL)).toBeNull();
  });
});

describe('CSS tokens', () => {
  const styleCss = read('src/style.css');
  const definedInCss = [...styleCss.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]);
  const defined = new Set([...Object.keys(CSS_TOKENS), ...definedInCss]);

  // var(--x, fallback) may be set at runtime (font lab: --fl-*-weight); var(--x) without one must exist.
  it('every var(--x) used by the game is defined (palette or style.css)', () => {
    const used = sourceFiles()
      .flatMap(file => [...read(file).matchAll(/var\((--[\w-]+)\s*\)/g)].map(match => `${file}: ${match[1]}`))
      .filter(entry => !defined.has(entry.split(': ')[1]));
    expect(used).toEqual([]);
  });

  it('style.css does not redefine palette colors', () => {
    expect(definedInCss.filter(name => name in CSS_TOKENS)).toEqual([]);
  });

  it('renders as a :root rule', () => {
    const rule = cssRootRule();
    expect(rule.startsWith(':root {')).toBe(true);
    expect(rule).toContain(`--bg: ${COLOR.bg};`);
    expect(rule).toContain('--neon-glow: rgba(63, 193, 176, 0.45);');
  });

  it('theme color is the page background', () => {
    expect(THEME_COLOR).toBe(CSS_TOKENS['--bg']);
  });
});

describe('withAlpha', () => {
  it('turns a hex color into rgba with the same channels', () => {
    expect(withAlpha('#46d3c9', 0.35)).toBe('rgba(70, 211, 201, 0.35)');
    expect(withAlpha('#000', 0.13)).toBe('rgba(0, 0, 0, 0.13)');
    expect(withAlpha(COLOR.ink, 0.8)).toBe('rgba(11, 13, 18, 0.8)');
  });

  it('keeps the alpha as computed (flicker multiplies it)', () => {
    expect(withAlpha('#f0a33e', 0.07 * 0.3)).toBe(`rgba(240, 163, 62, ${0.07 * 0.3})`);
  });
});

// V1.7 palette A "Сталь и ржавчина": the owner's 16 colors, nothing else.
describe('V1.7 palette A', () => {
  const APPROVED = {
    ink: '#0b0d12', bg: '#12151c', panel: '#1b1f28', wall: '#272c36', line: '#3a404c', dim: '#848a99', fg: '#cfcabd', rustDark: '#3d2a21',
    rust: '#7a4a32', skin: '#c08a68', action: '#3fc1b0', wear: '#e0943a', risk: '#e0524a', hunch: '#8a6bd8', ok: '#74b86a', lamp: '#ecd9a0',
  };

  it('has exactly the 16 approved base colors', () => {
    expect(BASE).toEqual(APPROVED);
    expect(new Set(Object.values(BASE)).size).toBe(16);
  });

  it('src/palette.ts holds no other hex and no hsl(): every role is a base color or withAlpha() of one', () => {
    const palette = read('src/palette.ts').split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/**'));
    const hexes = new Set(palette.flatMap(line => [...line.matchAll(/'(#[0-9a-f]{3,8})'/gi)].map(match => match[1].toLowerCase())));
    expect([...hexes].sort()).toEqual(Object.values(APPROVED).sort());
    expect(palette.join('\n')).not.toMatch(/hsla?\(/);
    expect(palette.join('\n')).not.toMatch(/'rgba?\(/);
  });

  it('every CSS token is a base color or a translucent base color', () => {
    const allowed = new Set<string>(Object.values(BASE));
    const rgbOf = (hex: string): string => withAlpha(hex, 1).replace(/, 1\)$/, '');
    const bases = Object.values(BASE).map(rgbOf);
    for (const [name, value] of Object.entries(CSS_TOKENS)) {
      const ok = allowed.has(value) || bases.some(prefix => value.startsWith(prefix + ', '));
      expect(ok, `${name}: ${value}`).toBe(true);
    }
  });

  it('the .gpl file for Piskel / Aseprite has the same 16 colors', () => {
    const rows = gpl.split('\n').filter(line => /^\s*\d+\s+\d+\s+\d+/.test(line));
    const hex = rows.map(row => '#' + row.trim().split(/\s+/).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join(''));
    expect(gpl.startsWith('GIMP Palette')).toBe(true);
    expect(hex).toEqual(Object.values(APPROVED));
  });
});

/** A jacket must stand out from the wall behind and the counter in front (task 19). */
const JACKET_MIN_CONTRAST = 1.6;

describe('contrast (WCAG)', () => {
  const luminance = (hex: string): number => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (a: string, b: string): number => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };

  it('main text and the action button read well', () => {
    expect(contrast(BASE.fg, BASE.panel)).toBeGreaterThanOrEqual(7);
    expect(contrast(BASE.ink, BASE.action)).toBeGreaterThanOrEqual(7);
    expect(contrast(BASE.dim, BASE.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('dim (#848a99, task 19) reads as body text on bg, panel and wall', () => {
    expect(contrast(BASE.dim, BASE.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BASE.dim, BASE.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BASE.dim, BASE.wall)).toBeGreaterThanOrEqual(4);
  });

  it('no customer jacket merges with the shop wall or the counter', () => {
    expect(CUSTOMER_TONES.jackets.length).toBeGreaterThanOrEqual(4);
    for (const [jacket] of CUSTOMER_TONES.jackets) {
      expect(contrast(jacket, BASE.wall), `${jacket} on wall`).toBeGreaterThanOrEqual(JACKET_MIN_CONTRAST);
      expect(contrast(jacket, BASE.panel), `${jacket} on panel`).toBeGreaterThanOrEqual(JACKET_MIN_CONTRAST);
    }
    expect(new Set(CUSTOMER_TONES.jackets.map(([jacket]) => jacket)).size).toBe(CUSTOMER_TONES.jackets.length);
  });

  it('the hunch verdict (16 px pixel font) passes the large-text 3:1 on panel', () => {
    expect(contrast(BASE.hunch, BASE.panel)).toBeGreaterThanOrEqual(3);
  });
});
