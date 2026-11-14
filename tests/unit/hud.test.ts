// HUD (V1.4 + fix): a bottom bar of stats and ☰, the wanted level on the scene wall,
// music in the menu (on by default), new game only through the menu.
import { describe, expect, it } from 'vitest';
import { MUSIC_KEY, musicWanted, rememberMusic, type PrefStorage } from '../../src/audio';
import { HUD_TEXT, MAX_HEAT, SAVE_KEY } from '../../src/data';
import { blinkLit, HEAT_METER, heatMeterHeight, heatMeterRects } from '../../src/heatmeter';
import { ICONS, iconSvg, ICON_SCALE } from '../../src/icons';
import { COLOR, MEANING } from '../../src/palette';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import sceneTs from '../../src/scene.ts?raw';
import indexHtml from '../../index.html?raw';

const css = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
const RULES: [string, string][] = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => [m[1].trim().replace(/\s+/g, ' '), m[2]]);
const rule = (selector: string): string => {
  const found = RULES.filter(([sel]) => sel === selector);
  expect(found, `rule "${selector}" in style.css`).toHaveLength(1);
  return found[0][1];
};
const rootPx = (name: string): number => parseFloat(RULES.filter(([sel]) => sel === ':root').map(([, body]) => body).join('\n')
  .match(new RegExp(`${name}:\\s*([^;]+);`))?.[1] ?? 'NaN');
const fn = (name: string): string => uiTs.match(new RegExp(`function ${name}\\(\\)[\\s\\S]*?\\n}`))?.[0] ?? '';
const renderHud = fn('renderHud');
const openMenu = fn('openMenu');

describe('bottom bar', () => {
  it('sits at the bottom: scene first, the bar after the scrolling pane', () => {
    const order = ['class="ceiling"', 'id="stage"', 'id="ticker"', 'id="tabs"', 'id="pane"', 'id="hud"'].map(mark => indexHtml.indexOf(mark));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(indexHtml).toContain('<footer class="hud" id="hud"></footer>');
  });

  it('is one row of fixed height for the 44 pt button', () => {
    expect(rule('.hud')).toContain('height: var(--hud-height)');
    expect(rule('.hud')).not.toContain('flex-wrap');
    expect(rootPx('--hud-height')).toBeGreaterThanOrEqual(44 + 2 * 4);
  });

  it('stats sit on the left at an even step, not spread out', () => {
    expect(rule('.stats')).toContain('justify-content: flex-start');
    expect(rule('.stats')).not.toContain('space-between');
    expect(rule('.stats')).toContain('gap: 16px');
  });

  it('labels: 11px grey; numbers: pixel 16px', () => {
    expect(rootPx('--fs-xs')).toBe(11);
    expect(rule('.st small')).toContain('font-size: var(--fs-xs)');
    expect(rule('.st small')).toContain('color: var(--dim)');
    expect(rule('.st b')).toContain('font-size: var(--fs-px-m)');
    expect(rootPx('--fs-px-m')).toBe(16);
  });

  it('☰ is a 44×44 icon without a tile, grey, white when pressed', () => {
    expect(rule('.ib')).toContain('width: 44px');
    expect(rule('.ib')).toContain('height: 44px');
    expect(rule('.ib')).toContain('background: none');
    expect(rule('.ib')).toContain('color: var(--dim)');
    expect(rule('.ib:active')).toContain('color: var(--fg)');
  });

  it('the menu sheet slides up from the bar', () => {
    expect(rule('.modal.sheet')).toContain('align-items: flex-end');
    expect(rule('.modal.sheet')).toContain('var(--hud-height)');
  });

  it('hides while the on-screen keyboard is open', () => {
    expect(rule('.kb-open .hud')).toContain('display: none');
    expect(uiTs).toMatch(/function trackKeyboard\(\)[\s\S]*?visualViewport[\s\S]*?'kb-open'/);
  });

  it('fits a 375 pt screen with the widest realistic numbers', () => {
    const digit = rootPx('--fs-px-m'); // Public Pixel: 1em per glyph
    const label = (text: string): number => text.length * rootPx('--fs-xs') * 0.6; // IBM Plex Mono: 0.6em
    const gap = 16;
    const buyoutBorderAndPadding = 2 * 2 + 2;
    const stats = [
      Math.max(label(HUD_TEXT.ru.buyout), 4 * digit) + buyoutBorderAndPadding, // 9999 кр
      Math.max(label(HUD_TEXT.ru.day), 2 * digit), // day 99
      Math.max(label(`${HUD_TEXT.ru.rent}·0${HUD_TEXT.ru.daysShort}`), 4 * digit), // rent 2250, due today
      Math.max(label(HUD_TEXT.ru.parts), 2 * digit), // 99 parts
    ];
    const width = stats.reduce((sum, w) => sum + w, 0) + gap * (stats.length - 1) + 8 + 44;
    const bodyPadding = 2 * 12;
    expect(width).toBeLessThanOrEqual(375 - bodyPadding);
  });
});

describe('the wanted level is on the scene, not in the HUD', () => {
  it('the HUD has no wanted meter, eye or music button', () => {
    expect(renderHud).not.toMatch(/heat|meterCells|eye|music/);
    expect(styleCss).not.toMatch(/\.heat\b/);
    expect(Object.keys(ICONS)).toEqual(['menu']);
  });

  it('10 cells 4×4 with 1 px gaps on the left wall, clear of the window at x = 7', () => {
    expect(MAX_HEAT).toBe(10);
    const rects = heatMeterRects(0, MAX_HEAT, 0);
    const cells = rects.slice(2);
    expect(cells).toHaveLength(10);
    for (const [x, , w, h] of cells) {
      expect([w, h]).toEqual([4, 4]);
      expect(x + w).toBeLessThanOrEqual(6);
    }
    for (const [x, , w] of rects) {
      expect(x + w).toBeLessThanOrEqual(6);
    }
    expect(heatMeterHeight(10)).toBe(49);
    // above the counter top (y = 68)
    expect(Math.max(...rects.map(([, y, , h]) => y + h))).toBeLessThanOrEqual(68);
    expect(sceneTs).toContain('drawHeatMeter(now)');
  });

  it('fills from the bottom: empty cells wall-line, filled cells risk', () => {
    const cells = heatMeterRects(3, MAX_HEAT, 0).slice(2);
    const byHeight = [...cells].sort((a, b) => b[1] - a[1]); // lowest first
    expect(byHeight.map(cell => cell[4])).toEqual([...Array(3).fill(MEANING.risk), ...Array(7).fill(COLOR.line)]);
  });

  it('from 7 on the highest filled cell blinks once a second; below 7 nothing blinks', () => {
    expect(HEAT_METER.blinkFrom).toBe(7);
    expect(HEAT_METER.blinkPeriodMs).toBeGreaterThanOrEqual(1000);
    expect(blinkLit(0)).toBe(true);
    expect(blinkLit(600)).toBe(false);
    const risky = (heat: number, now: number): number => heatMeterRects(heat, MAX_HEAT, now).filter(r => r[4] === MEANING.risk).length;
    expect(risky(7, 0)).toBe(7);
    expect(risky(7, 600)).toBe(6);
    expect(risky(6, 600)).toBe(6);
  });

  it('screen readers hear it as text', () => {
    expect(indexHtml).toMatch(/<span class="sr-only" id="heatText" aria-live="polite"><\/span>/);
    expect(uiTs).toContain('`${HUD.heat} ${state.heat} ${HUD.of} ${MAX_HEAT}`');
  });
});

describe('music', () => {
  const fakeStorage = (): PrefStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: key => void data.delete(key) };
  };

  it('is on by default', () => {
    expect(musicWanted(fakeStorage())).toBe(true);
    expect(musicWanted(null)).toBe(true);
  });

  it('"off" is remembered, "on" clears it', () => {
    const storage = fakeStorage();
    rememberMusic(false, storage);
    expect(musicWanted(storage)).toBe(false);
    rememberMusic(true, storage);
    expect(musicWanted(storage)).toBe(true);
    expect(storage.data.size).toBe(0);
  });

  it('keeps its choice apart from the save', () => {
    expect(MUSIC_KEY).not.toBe(SAVE_KEY);
    expect(MUSIC_KEY.startsWith(SAVE_KEY)).toBe(false);
  });

  it('starts on the first touch and is a text item of the menu', () => {
    expect(uiTs).toMatch(/function startMusicOnFirstTouch\(\)[\s\S]*?'pointerdown', 'touchend'/);
    expect(openMenu).toContain('data-a="music"');
    expect(openMenu).toContain('${HUD.music}: ${audio.on ? HUD.on : HUD.off}');
    expect(HUD_TEXT.ru.music + ': ' + HUD_TEXT.ru.on).toBe('Музыка: вкл');
    expect(HUD_TEXT.en.music + ': ' + HUD_TEXT.en.off).toBe('Music: off');
  });
});

describe('menu', () => {
  it('holds the game title, music, save and new game; no emoji or font glyphs', () => {
    expect(openMenu).toContain('HUD.gameTitle');
    expect(openMenu).toContain('data-a="savemenu"');
    expect(openMenu).toContain('data-a="newgame"');
    for (const code of [renderHud, openMenu]) {
      expect(code).not.toMatch(/[♪⟲☰⚙★☾]/u);
      expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('new game is only in the menu, behind a confirmation', () => {
    expect(renderHud).not.toContain('newgame');
    expect(uiTs.match(/data-a="newgame"/g)).toHaveLength(1);
    expect(uiTs).toMatch(/newgame: \(\) => \{\s*confirmNewGame\(\);/);
    expect(HUD_TEXT.ru.confirmText).toBe('Текущая игра пропадёт, сохраните код.');
  });

  it('save opens the save window, which keeps the version label (long press → diagnostics)', () => {
    expect(uiTs).toMatch(/function openSaveMenu\(\)[\s\S]*?class="version"/);
  });

  it('Russian and English texts have the same keys', () => {
    expect(Object.keys(HUD_TEXT.en).sort()).toEqual(Object.keys(HUD_TEXT.ru).sort());
  });
});

describe('pixel icons', () => {
  it('lie on their grid, are drawn 2× with crisp edges and take their color from CSS', () => {
    for (const [name, icon] of Object.entries(ICONS)) {
      for (const [x, y, w, h] of icon.rects) {
        expect(x >= 0 && y >= 0 && x + w <= icon.w && y + h <= icon.h, `${name} [${x},${y},${w},${h}]`).toBe(true);
      }
    }
    expect(ICON_SCALE).toBe(2);
    const svg = iconSvg('menu');
    expect(svg).toContain('width="32" height="32"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toMatch(/fill=|#[0-9a-f]{3,6}|rgb/i);
    expect(rule('.ico')).toContain('fill: currentColor');
  });
});
