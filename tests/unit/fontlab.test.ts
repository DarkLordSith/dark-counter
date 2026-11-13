// Font lab (debug sheet): defaults, allowed sizes, storage key, the copied result.
import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from '../../src/data';
import {
  DEFAULT_SIZES, defaultSettings, FONTLAB_KEY, FONTLAB_TEXT, formatSettings, GROUPS, isDefault, isPixelToken, PIXEL_SIZES,
  sanitize, SIZE_TOKENS, stepSize,
} from '../../src/fontlab';
import styleCss from '../../src/style.css?raw';

const rootTokens = (): Record<string, number> => {
  const root = [...styleCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|\})\s*:root\s*\{([^}]*)\}/g)].map(m => m[2]).join('\n');
  return Object.fromEntries([...root.matchAll(/(--fs-[\w-]+):\s*(\d+)px/g)].map(m => [m[1], Number(m[2])]));
};

describe('defaults', () => {
  it('are the current type scale tokens in style.css', () => {
    expect(rootTokens()).toEqual(DEFAULT_SIZES);
  });

  it('leave every group in the pixel font, regular, as written', () => {
    const settings = defaultSettings();
    expect(isDefault(settings)).toBe(true);
    for (const id of GROUPS) {
      expect(settings.groups[id]).toEqual({ font: 'pixel', weight: 400, upper: false });
    }
  });
});

describe('sizes', () => {
  it('pixel sizes are only multiples of 8', () => {
    expect(PIXEL_SIZES.every(size => size % 8 === 0)).toBe(true);
    for (const token of SIZE_TOKENS.filter(isPixelToken)) {
      let size = DEFAULT_SIZES[token];
      for (const direction of [1, 1, 1, 1, -1, -1, -1, -1, -1] as const) {
        size = stepSize(token, size, direction);
        expect(size % 8).toBe(0);
      }
      expect(size).toBe(8);
    }
  });

  it('mono sizes move by 1px within 10–20', () => {
    expect(stepSize('--fs-m', 14, 1)).toBe(15);
    expect(stepSize('--fs-m', 14, -1)).toBe(13);
    expect(stepSize('--fs-s', 10, -1)).toBe(10);
    expect(stepSize('--fs-l', 20, 1)).toBe(20);
  });
});

describe('stored settings', () => {
  it('use their own localStorage key, apart from the save', () => {
    expect(FONTLAB_KEY).not.toBe(SAVE_KEY);
    expect(FONTLAB_KEY.startsWith(SAVE_KEY)).toBe(false);
    expect(SAVE_KEY.startsWith(FONTLAB_KEY)).toBe(false);
  });

  it('garbage or out-of-range values fall back to the defaults', () => {
    expect(sanitize(null)).toEqual(defaultSettings());
    expect(sanitize('nonsense')).toEqual(defaultSettings());
    const fixed = sanitize({ sizes: { '--fs-m': 15, '--fs-px-m': 20, '--fs-s': 99 }, groups: { names: { font: 'mono', weight: 600, upper: true }, prices: { font: 'comic', weight: 900 } } });
    expect(fixed.sizes['--fs-m']).toBe(15);
    expect(fixed.sizes['--fs-px-m']).toBe(16);
    expect(fixed.sizes['--fs-s']).toBe(12);
    expect(fixed.groups.names).toEqual({ font: 'mono', weight: 600, upper: true });
    expect(fixed.groups.prices).toEqual({ font: 'pixel', weight: 400, upper: false });
  });
});

describe('copied result', () => {
  it('lists sizes and group faces in a form to paste into a task', () => {
    const settings = defaultSettings();
    settings.sizes['--fs-m'] = 15;
    settings.groups.names = { font: 'mono', weight: 600, upper: false };
    settings.groups.verdict.upper = true;
    expect(formatSettings(settings, 'ru')).toBe(
      '--fs-s: 12px; --fs-m: 15px; --fs-l: 18px; --fs-px-s: 8px; --fs-px-m: 16px; --fs-px-l: 24px; '
      + 'названия: mono 600; цены: pixel; вердикт: pixel ЗАГЛАВНЫЕ; числа HUD: pixel; заголовки: pixel');
  });
});

describe('wiring', () => {
  it('every group has its mono and upper-case rules in style.css', () => {
    for (const id of GROUPS) {
      expect(styleCss).toContain(`html[data-fl-${id}="mono"]`);
      expect(styleCss).toContain(`html[data-fl-${id}-case="upper"]`);
      expect(styleCss).toContain(`var(--fl-${id}-weight, 400)`);
    }
  });

  it('Russian and English texts have the same keys', () => {
    expect(Object.keys(FONTLAB_TEXT.en).sort()).toEqual(Object.keys(FONTLAB_TEXT.ru).sort());
    expect(Object.keys(FONTLAB_TEXT.en.groupNames).sort()).toEqual([...GROUPS].sort());
    expect(Object.keys(FONTLAB_TEXT.en.sizeNames).sort()).toEqual([...SIZE_TOKENS].sort());
  });
});
