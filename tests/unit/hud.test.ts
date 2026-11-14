// HUD (V1.4): one row of stats, two pixel icon buttons, new game only through the menu.
import { describe, expect, it } from 'vitest';
import { HUD_TEXT } from '../../src/data';
import { ICONS, iconSvg, ICON_SCALE } from '../../src/icons';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import indexHtml from '../../index.html?raw';

const css = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
const RULES: [string, string][] = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => [m[1].trim().replace(/\s+/g, ' '), m[2]]);
const rule = (selector: string): string => {
  const found = RULES.filter(([sel]) => sel === selector);
  expect(found, `rule "${selector}" in style.css`).toHaveLength(1);
  return found[0][1];
};
const rootToken = (name: string): string => RULES.filter(([sel]) => sel === ':root').map(([, body]) => body).join('\n')
  .match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
const renderHud = uiTs.match(/function renderHud\(\)[\s\S]*?\n}/)?.[0] ?? '';

describe('HUD layout', () => {
  it('is one row of fixed height that fits the 44 pt buttons with air around them', () => {
    expect(rule('.hud')).toContain('height: var(--hud-height)');
    expect(rule('.hud')).not.toContain('flex-wrap');
    expect(parseFloat(rootToken('--hud-height'))).toBeGreaterThanOrEqual(44 + 2 * 6);
  });

  it('numbers stay in the pixel font at --fs-px-m, labels in mono at --fs-s', () => {
    expect(rule('.st b')).toContain('font-size: var(--fs-px-m)');
    expect(rule('.st small')).toContain('font-size: var(--fs-s)');
  });

  it('icon buttons are 44×44', () => {
    expect(rule('.ib')).toContain('width: 44px');
    expect(rule('.ib')).toContain('height: 44px');
  });

  it('the game title left the HUD for the menu', () => {
    expect(renderHud).not.toMatch(/logo|ТЁМНЫЙ ПРИЛАВОК/);
    expect(styleCss).not.toMatch(/\.logo\b/);
    expect(uiTs).toMatch(/function openMenu\(\)[\s\S]*?HUD\.gameTitle/);
  });
});

describe('HUD buttons', () => {
  it('are pixel SVG icons, not emoji or font glyphs, with RU/EN labels', () => {
    expect(renderHud).toContain("iconSvg('note')");
    expect(renderHud).toContain("iconSvg('menu')");
    expect(renderHud).toContain('aria-label="${HUD.menu}"');
    expect(renderHud).toContain('aria-pressed="${audio.on}"');
    const openMenu = uiTs.match(/function openMenu\(\)[\s\S]*?\n}/)?.[0] ?? '';
    for (const code of [renderHud, openMenu]) {
      expect(code).not.toMatch(/[♪⟲☰⚙★☾]/u);
      expect(code).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('new game is only in the menu, behind a confirmation', () => {
    expect(renderHud).not.toContain('newgame');
    expect(uiTs.match(/data-a="newgame"/g)).toHaveLength(1);
    expect(uiTs).toMatch(/function openMenu\(\)[\s\S]*?data-a="newgame"/);
    expect(uiTs).toMatch(/newgame: \(\) => \{\s*confirmNewGame\(\);/);
    expect(HUD_TEXT.ru.confirmText).toBe('Текущая игра пропадёт, сохраните код.');
  });

  it('save opens the save window, which keeps the version label (long press → diagnostics)', () => {
    expect(uiTs).toMatch(/function openMenu\(\)[\s\S]*?data-a="savemenu"/);
    expect(uiTs).toMatch(/function openSaveMenu\(\)[\s\S]*?class="version"/);
  });

  it('Russian and English texts have the same keys', () => {
    expect(Object.keys(HUD_TEXT.en).sort()).toEqual(Object.keys(HUD_TEXT.ru).sort());
  });
});

describe('pixel icons', () => {
  it('every rectangle lies on the icon grid', () => {
    for (const [name, icon] of Object.entries(ICONS)) {
      for (const [x, y, w, h] of icon.rects) {
        expect([x, y, w, h].every(Number.isInteger), name).toBe(true);
        expect(x >= 0 && y >= 0 && x + w <= icon.w && y + h <= icon.h, `${name} [${x},${y},${w},${h}]`).toBe(true);
      }
    }
  });

  it('are drawn 2× with crisp edges and take their color from CSS', () => {
    expect(ICON_SCALE).toBe(2);
    const svg = iconSvg('note', 'strike');
    expect(svg).toContain('width="32" height="32"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toMatch(/fill=|#[0-9a-f]{3,6}|rgb/i);
    expect(rule('.ico')).toContain('fill: currentColor');
  });

  it('the HUD markup has no hard-coded buttons left in index.html', () => {
    expect(indexHtml).toContain('<header class="hud" id="hud"></header>');
  });
});
