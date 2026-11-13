// One source of colors: src/palette.ts. Fails on a color literal anywhere else.
import { describe, expect, it } from 'vitest';
import { COLOR, CSS_TOKENS, cssRootRule, THEME_COLOR, withAlpha } from '../../src/palette';

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
    expect('#app #hud #diag #callBtn'.match(COLOR_LITERAL)).toBeNull();
  });
});

describe('CSS tokens', () => {
  const styleCss = read('src/style.css');
  const definedInCss = [...styleCss.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]);
  const defined = new Set([...Object.keys(CSS_TOKENS), ...definedInCss]);

  it('every var(--x) used by the game is defined (palette or style.css)', () => {
    const used = sourceFiles()
      .flatMap(file => [...read(file).matchAll(/var\((--[\w-]+)/g)].map(match => `${file}: ${match[1]}`))
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
    expect(rule).toContain('--neon-glow: rgba(70, 211, 201, 0.45);');
  });

  it('theme color is the page background', () => {
    expect(THEME_COLOR).toBe(CSS_TOKENS['--bg']);
  });
});

describe('withAlpha', () => {
  it('turns a hex color into rgba with the same channels', () => {
    expect(withAlpha('#46d3c9', 0.35)).toBe('rgba(70, 211, 201, 0.35)');
    expect(withAlpha('#000', 0.13)).toBe('rgba(0, 0, 0, 0.13)');
    expect(withAlpha(COLOR.ink, 0.8)).toBe('rgba(10, 12, 24, 0.8)');
  });

  it('keeps the alpha as computed (flicker multiplies it)', () => {
    expect(withAlpha('#f0a33e', 0.07 * 0.3)).toBe(`rgba(240, 163, 62, ${0.07 * 0.3})`);
  });
});
