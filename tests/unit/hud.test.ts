// HUD (V1.4 + fix): a bottom bar of stats and ☰, the wanted level on the scene wall,
// music in the menu (on by default), new game only through the menu.
import { describe, expect, it } from 'vitest';
import { MUSIC_KEY, musicWanted, rememberMusic, type PrefStorage } from '../../src/audio';
import { DEBT, MAX_HEAT, SAVE_KEY } from '../../src/data';

import { blinkLit, HEAT_METER, heatMeterCells, heatMeterHeight, heatMeterRects, sirenLit } from '../../src/heatmeter';
import { ICONS, iconSvg, ICON_SCALE } from '../../src/icons';
import { COLOR, MEANING, SHOP } from '../../src/palette';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import sceneTs from '../../src/scene.ts?raw';
import indexHtml from '../../index.html?raw';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';

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
    const stats = [
      Math.max(label(RU.hud.credits), 5 * digit), // 99999 кр
      Math.max(label(`${RU.hud.day}/${DEBT.shuttleDay}`), 2 * digit), // day 59 of 60
      Math.max(label(`${RU.hud.payment}·0${RU.hud.daysShort}`), 4 * digit), // payment 2400, due today
      Math.max(label(RU.hud.parts), 2 * digit), // 99 parts
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
    expect(Object.keys(ICONS)).toEqual(['menu', 'close', 'broken', 'ai', 'stolen', 'fame', 'lock']);
  });

  it('10 cells 4×4 with 1 px gaps on the left wall, clear of the window at x = 7', () => {
    expect(MAX_HEAT).toBe(10);
    const cells = heatMeterCells(0, MAX_HEAT, 0);
    expect(cells).toHaveLength(10);
    for (const [x, , w, h] of cells) {
      expect([w, h]).toEqual([4, 4]);
      expect(x + w).toBeLessThanOrEqual(6);
    }
    const rects = heatMeterRects(9, MAX_HEAT, 0);
    for (const [x, y, w] of rects) {
      expect(x + w, 'clear of the window and shelves (x ≥ 7)').toBeLessThanOrEqual(6);
      expect(y).toBeGreaterThanOrEqual(0);
    }
    expect(heatMeterHeight(10)).toBe(49);
    // above the counter top (y = 68)
    expect(Math.max(...rects.map(([, y, , h]) => y + h))).toBeLessThanOrEqual(68);
    expect(sceneTs).toContain('drawHeatMeter(now)');
  });

  it('a siren 6×5 sits on top of the plate', () => {
    const plateTop = HEAT_METER.top - 1;
    const siren = heatMeterRects(0, MAX_HEAT, 0).filter(([, y, , h]) => y + h <= plateTop);
    expect(siren.length).toBeGreaterThanOrEqual(2);
    const left = Math.min(...siren.map(r => r[0]));
    const right = Math.max(...siren.map(r => r[0] + r[2]));
    const topY = Math.min(...siren.map(r => r[1]));
    const bottom = Math.max(...siren.map(r => r[1] + r[3]));
    expect([right - left, bottom - topY]).toEqual([6, 5]);
    expect(bottom).toBeLessThan(plateTop);
  });

  it('fills from the bottom: filled cells solid risk, empty cells a line-colored outline', () => {
    const rects = heatMeterRects(3, MAX_HEAT, 0);
    const cells = heatMeterCells(3, MAX_HEAT, 0);
    expect(cells.map(cell => cell[4])).toEqual([...Array(3).fill(MEANING.risk), ...Array(7).fill(COLOR.line)]);
    // every empty cell has the wall color inside its 1 px outline
    for (const [x, y] of cells.slice(3)) {
      expect(rects).toContainEqual([x + 1, y + 1, 2, 2, SHOP.wall]);
    }
    // a filled cell has nothing drawn over it
    const [fx, fy] = cells[0];
    expect(rects.filter(([x, y]) => x === fx + 1 && y === fy + 1)).toHaveLength(0);
  });

  it('the siren is off below 8; from 8 it and the highest filled cell blink once a second', () => {
    expect(HEAT_METER.blinkFrom).toBe(8);
    expect(HEAT_METER.blinkPeriodMs).toBeGreaterThanOrEqual(1000);
    expect(blinkLit(0)).toBe(true);
    expect(blinkLit(600)).toBe(false);
    const solid = (heat: number, now: number): number => heatMeterCells(heat, MAX_HEAT, now).filter(r => r[4] === MEANING.risk).length;
    const sirenRisk = (heat: number, now: number): boolean => heatMeterRects(heat, MAX_HEAT, now)
      .some(([, y, , , color]) => y < HEAT_METER.top - 1 && color === MEANING.risk);
    expect(solid(7, 600)).toBe(7);
    expect(sirenRisk(7, 0)).toBe(false);
    expect(sirenLit(7, 0)).toBe(false);
    expect(solid(8, 0)).toBe(8);
    expect(solid(8, 600)).toBe(7);
    expect(sirenRisk(8, 0)).toBe(true);
    expect(sirenRisk(8, 600)).toBe(false);
    expect(sirenRisk(10, 0)).toBe(true);
  });

  it('screen readers hear it as text', () => {
    expect(indexHtml).toMatch(/<span class="sr-only" id="heatText" aria-live="polite"><\/span>/);
    expect(uiTs).toContain("`${t('hud.heat')} ${state.heat} ${t('hud.of')} ${MAX_HEAT}`");
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
    expect(uiTs).toMatch(/function startSoundOnFirstTouch\(\)[\s\S]*?'pointerdown', 'touchend'/);
    expect(openMenu).toContain('data-a="music"');
    expect(openMenu).toContain("${t('hud.music')}: ${audio.on ? t('hud.on') : t('hud.off')}");
    expect(RU.hud.music + ': ' + RU.hud.on).toBe('Музыка: вкл');
    expect(EN.hud.music + ': ' + EN.hud.off).toBe('Music: off');
  });
});

describe('menu', () => {
  it('holds the current mode on top, the debt, modes, music and save; no emoji or font glyphs', () => {
    expect(openMenu).toContain('<h2>${t(`mode.names.${state.mode}`)}</h2>');
    expect(openMenu).toContain('data-a="debt"');
    expect(openMenu).toContain('data-a="modes"');
    expect(openMenu).toContain('data-a="savemenu"');
    for (const code of [renderHud, openMenu]) {
      expect(code).not.toMatch(/[♪⟲☰⚙★☾]/u);
      expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('one "Режимы" item: a new game starts on the mode screen ("Начать заново" asks first)', () => {
    expect(openMenu.match(/data-a="modes"/g)).toHaveLength(1);
    expect(uiTs).not.toContain('data-a="newgame"');
    expect(uiTs).not.toMatch(/\bnewgame: \(\)/);
    expect(RU.hud).not.toHaveProperty('newGame');
    expect(uiTs).toMatch(/function askResetMode[\s\S]*?t\('mode\.resetText'/);
  });

  it('save opens the save window, which keeps the version label (long press → diagnostics)', () => {
    expect(uiTs).toMatch(/function openSaveMenu\(\)[\s\S]*?class="version"/);
  });

  it('Russian and English texts have the same keys', () => {
    expect(Object.keys(EN.hud).sort()).toEqual(Object.keys(RU.hud).sort());
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
