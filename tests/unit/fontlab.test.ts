// Font lab (debug sheet): defaults, allowed sizes, storage key, the copied result.
import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from '../../src/data';
import {
  DEFAULT_SIZES, defaultSettings, DESKTOP_QUERY, FONTLAB_KEY, FONTLAB_KEYS, FONTLAB_TEXT, formatDpr, formatSettings, GROUPS,
  isCrisp, isDefault, isPixelToken, PIXEL_SIZES, PROFILE_SIZES, PROFILES, sanitize, SIZE_TOKENS, stepSize,
} from '../../src/fontlab';
import styleCss from '../../src/style.css?raw';

const css = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
const sizesIn = (body: string): Record<string, number> =>
  Object.fromEntries([...body.matchAll(/(--fs-[\w-]+):\s*(\d+)px/g)].map(m => [m[1], Number(m[2])]));

/** Phone profile: the top-level :root (not the one inside @media). */
const rootTokens = (): Record<string, number> =>
  sizesIn([...css.matchAll(/(^|\})\s*:root\s*\{([^}]*)\}/g)].map(m => m[2]).join('\n'));

/** Desktop profile: :root inside @media DESKTOP_QUERY. */
const desktopTokens = (): Record<string, number> => {
  const escaped = DESKTOP_QUERY.replace(/[()]/g, '\\$&');
  const block = css.match(new RegExp(`@media ${escaped}\\s*\\{\\s*:root\\s*\\{([^}]*)\\}`));
  expect(block, `@media ${DESKTOP_QUERY} { :root { … } } in style.css`).toBeTruthy();
  return sizesIn(block![1]);
};

describe('defaults', () => {
  it('are the current type scale tokens in style.css', () => {
    expect(rootTokens()).toEqual(DEFAULT_SIZES);
    expect(PROFILE_SIZES.phone).toEqual(DEFAULT_SIZES);
  });

  it('the desktop profile in style.css sets every size token and matches the lab', () => {
    expect(desktopTokens()).toEqual(PROFILE_SIZES.desktop);
    expect(Object.keys(PROFILE_SIZES.desktop).sort()).toEqual([...SIZE_TOKENS].sort());
  });

  it('for now the desktop profile is a copy of the phone one (the look does not change)', () => {
    expect(PROFILE_SIZES.desktop).toEqual(PROFILE_SIZES.phone);
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
  it('pixel sizes are multiples of 8, plus 12 for DPR 2 screens', () => {
    expect([...PIXEL_SIZES]).toEqual([8, 12, 16, 24, 32]);
    const allowed = (size: number): boolean => size % 8 === 0 || size === 12;
    for (const token of SIZE_TOKENS.filter(isPixelToken)) {
      let size = DEFAULT_SIZES[token];
      for (const direction of [1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1] as const) {
        size = stepSize(token, size, direction);
        expect(allowed(size), `${size}px`).toBe(true);
      }
      expect(size).toBe(8);
    }
    expect(stepSize('--fs-px-m', 8, 1)).toBe(12);
    expect(stepSize('--fs-px-m', 12, 1)).toBe(16);
  });

  it('sharp or soft: whole device pixels per font pixel', () => {
    expect(isCrisp(12, 2)).toBe(true);   // Mac Retina: 3
    expect(isCrisp(12, 3)).toBe(false);  // iPhone 12: 4.5
    expect(isCrisp(16, 3)).toBe(true);   // 6
    expect(isCrisp(8, 1)).toBe(true);
    expect(isCrisp(12, 1)).toBe(false);
    expect(isCrisp(16, 1.5)).toBe(true);
    expect(isCrisp(8, 1.25)).toBe(false);
    expect(formatDpr(3)).toBe('3');
    expect(formatDpr(1.3333333)).toBe('1.33');
  });

  it('mono sizes move by 1px within 10–20', () => {
    expect(stepSize('--fs-m', 14, 1)).toBe(15);
    expect(stepSize('--fs-m', 14, -1)).toBe(13);
    expect(stepSize('--fs-s', 10, -1)).toBe(10);
    expect(stepSize('--fs-l', 20, 1)).toBe(20);
  });
});

describe('stored settings', () => {
  it('use their own localStorage key per profile, apart from the save', () => {
    expect(FONTLAB_KEYS.phone).toBe(FONTLAB_KEY); // settings from PR #11 stay with the phone
    expect(new Set(Object.values(FONTLAB_KEYS)).size).toBe(PROFILES.length);
    for (const key of Object.values(FONTLAB_KEYS)) {
      expect(key).not.toBe(SAVE_KEY);
      expect(key.startsWith(SAVE_KEY)).toBe(false);
      expect(SAVE_KEY.startsWith(key)).toBe(false);
    }
  });

  it('garbage or out-of-range values fall back to the defaults', () => {
    expect(sanitize(null)).toEqual(defaultSettings());
    expect(sanitize('nonsense')).toEqual(defaultSettings());
    const fixed = sanitize({ sizes: { '--fs-m': 15, '--fs-px-m': 20, '--fs-s': 99 }, groups: { names: { font: 'mono', weight: 600, upper: true }, prices: { font: 'comic', weight: 900 } } });
    expect(fixed.sizes['--fs-m']).toBe(15);
    expect(fixed.sizes['--fs-px-m']).toBe(16);
    expect(sanitize({ sizes: { '--fs-px-m': 12 } }).sizes['--fs-px-m']).toBe(12);
    expect(sanitize(null, 'desktop')).toEqual(defaultSettings('desktop'));
    expect(isDefault(defaultSettings('desktop'), 'desktop')).toBe(true);
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
    expect(formatSettings(settings, 'ru', 'phone', 3)).toBe(
      '[телефон, DPR 3] --fs-xs: 11px; --fs-s: 12px; --fs-m: 15px; --fs-l: 18px; --fs-px-s: 8px; --fs-px-m: 16px; --fs-px-l: 24px; '
      + 'названия: mono 600; цены: pixel; вердикт: pixel ЗАГЛАВНЫЕ; числа HUD: pixel; заголовки: pixel');
    expect(formatSettings(defaultSettings('desktop'), 'en', 'desktop', 2)).toMatch(/^\[desktop, DPR 2\] --fs-xs: 11px; --fs-s: 12px;/);
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
    expect(Object.keys(FONTLAB_TEXT.en.profileNames).sort()).toEqual([...PROFILES].sort());
  });
});
