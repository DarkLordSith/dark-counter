// Fonts and the type scale (V1.3): Public Pixel for headings and numbers, IBM Plex Mono for text.
import { describe, expect, it } from 'vitest';
import styleCss from '../../src/style.css?raw';
import indexHtml from '../../index.html?raw';
import uiTs from '../../src/ui.ts?raw';
import viteConfig from '../../vite.config.ts?raw';

const css = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
const RULES: [string, string][] = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => [m[1].trim().replace(/\s+/g, ' '), m[2]]);
const ROOT_BODY = RULES.filter(([sel]) => sel === ':root').map(([, body]) => body).join('\n');
const token = (name: string): string => ROOT_BODY.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
const px = (name: string): number => parseFloat(token(name));

describe('type scale', () => {
  it('font sizes outside :root use tokens, never px literals', () => {
    const literal = RULES.filter(([sel, body]) => sel !== ':root' && /font(-size)?\s*:[^;]*\d+px/.test(body)).map(([sel]) => sel);
    expect(literal).toEqual([]);
    expect(uiTs).not.toMatch(/font-size\s*:/);
  });

  it('pixel sizes are multiples of 8px (the Public Pixel grid)', () => {
    for (const name of ['--fs-px-s', '--fs-px-m', '--fs-px-l']) {
      expect(px(name) % 8, name).toBe(0);
    }
  });

  it('panel text is at least 14px, the log is not bigger than it, small print is at least 11px', () => {
    expect(px('--fs-m')).toBeGreaterThanOrEqual(14);
    expect(px('--fs-s')).toBeGreaterThanOrEqual(11);
    expect(px('--fs-s')).toBeLessThanOrEqual(px('--fs-m'));
    expect(RULES.find(([sel]) => sel === '.ticker')?.[1]).toContain('var(--fs-s)');
    expect(RULES.some(([sel, body]) => sel === 'body' && body.includes('font-size: var(--fs-m)'))).toBe(true);
  });

  it('pixel-font elements use only pixel sizes', () => {
    const pixelRule = RULES.find(([, body]) => body.includes('font-family: var(--display)'));
    expect(pixelRule, 'the shared pixel-font rule').toBeTruthy();
    const pixelSelectors = pixelRule![0].split(',').map(sel => sel.trim());
    for (const sel of pixelSelectors) {
      const sizes = RULES.filter(([s]) => s === sel).map(([, body]) => body.match(/font-size:\s*([^;]+);/)?.[1]).filter(Boolean);
      for (const size of sizes) {
        expect(size, sel).toMatch(/var\(--fs-px-[sml]\)/);
      }
    }
  });
});

describe('font families', () => {
  it('Silkscreen and Courier New are gone everywhere', () => {
    for (const text of [styleCss, indexHtml, viteConfig]) {
      expect(text).not.toMatch(/Silkscreen|Courier/i);
    }
  });

  it('fallbacks are monospace, never serif', () => {
    expect(token('--display')).toBe("'Public Pixel', monospace");
    expect(token('--mono')).toBe("'IBM Plex Mono', ui-monospace, Menlo, monospace");
    expect(css).not.toMatch(/font-family:[^;]*\bserif\b/);
  });

  it('Public Pixel is a local file: woff2 first, ttf as a fallback', () => {
    expect(css).toMatch(/@font-face\s*\{[^}]*font-family: 'Public Pixel'/);
    expect(css).toContain("url('/fonts/PublicPixel.woff2') format('woff2'), url('/fonts/PublicPixel.ttf') format('truetype')");
  });

  it('the PWA precaches the font', () => {
    expect(viteConfig).toMatch(/globPatterns:\s*\['\*\*\/\*\.\{[^}]*woff2/);
  });
});
