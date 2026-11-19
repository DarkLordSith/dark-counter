// The "rare" mark (V2.6): ★ from a 5×5 map in `rare` (= lamp), the fake ★̸ for Patch B1,
// rare junkyard finds keep the flag, turquoise no longer means "rare".
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dig, feedback, goToJunkyard } from '../../src/economy';
import { BASE, COLOR, CSS_TOKENS, MEANING } from '../../src/palette';
import { gameRng, mulberry32 } from '../../src/rng';
import { createItem, state } from '../../src/state';
import { tileMark } from '../../src/tile';
import { isRareItem, isRareLine, STAR_MAPS, starRects, starSvg } from '../../src/star';
import type { StarKind } from '../../src/star';
import economyTs from '../../src/economy.ts?raw';
import uiTs from '../../src/ui.ts?raw';
import { makeItem, makeState } from './helpers';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';

/** The maps exactly as the task draws them: L = lamp, W = wear, F = fg. */
const TASK_MAPS: Record<StarKind, string[]> = {
  rare: ['..L..', 'LLLLL', '.LLL.', '.L.L.', 'L...L'],
  fake: ['..W.F', 'WWWFW', '.WFW.', '.F.W.', 'F...W'],
};
const LETTER: Record<string, string> = { L: BASE.lamp, W: BASE.wear, F: BASE.fg };

/** Draws the rects back onto a 5×5 grid of letters. */
function redraw(kind: StarKind): string[] {
  const grid = Array.from({ length: 5 }, () => [...'.....']);
  const letterOf = (color: string): string => Object.keys(LETTER).find(key => LETTER[key] === color) ?? '?';
  for (const [x, y, w, h, color] of starRects(kind)) {
    expect([w, h]).toEqual([1, 1]);
    grid[y][x] = letterOf(color);
  }
  return grid.map(row => row.join(''));
}

afterEach(() => vi.restoreAllMocks());

describe('star sprites', () => {
  it('match the maps from the task, pixel by pixel', () => {
    expect(STAR_MAPS).toEqual(TASK_MAPS);
    expect(redraw('rare')).toEqual(TASK_MAPS.rare);
    expect(redraw('fake')).toEqual(TASK_MAPS.fake);
  });

  it('are SVG rects (not a font glyph), 10×10 px at ×2', () => {
    const svg = starSvg('rare');
    expect(svg).toContain('width="10" height="10"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toContain('★');
    expect(svg.match(/<rect /g)).toHaveLength(starRects('rare').length);
    expect(starSvg('rare', 4)).toContain('width="20" height="20"');
  });

  it('the fake star is ready but not shown in the game yet: only the tile mark table has it, no item gets it', () => {
    expect(uiTs.match(/starSvg\('fake'/g)).toHaveLength(1);
    expect(uiTs).toContain("fake: `<i class=\"tm\">${starSvg('fake')}</i>`");
    expect(tileMark(makeItem('chip', { rare: true, stolen: true, infected: true, defect: true }))).not.toBe('fake');
  });
});

describe('meaning "rare"', () => {
  it('is lamp, reaches CSS as --m-rare and is not turquoise', () => {
    expect(MEANING.rare).toBe(BASE.lamp);
    expect(CSS_TOKENS['--m-rare']).toBe(MEANING.rare);
    expect(MEANING.rare).not.toBe(MEANING.action);
    expect(MEANING.rare).not.toBe(COLOR.cyan);
  });

  it('the rare find floats a lamp star, not a turquoise glyph', () => {
    expect(economyTs).not.toMatch(/floatText\('★'/);
    makeState({ phase: 'evening', hours: 4 });
    goToJunkyard(state, gameRng);
    feedback.floats.length = 0;
    // one find (0.5 → a single item), its rare roll under 4%
    const queue = [0.5, 0.001];
    vi.spyOn(Math, 'random').mockImplementation(() => queue.length ? queue.shift()! : 0.5);
    expect(dig(state, gameRng)?.kind).toBe('rare');
    expect(feedback.floats.at(-1)).toMatchObject({ color: MEANING.rare, star: 'rare' });
  });
});

describe('rare items', () => {
  it('a rare find keeps the flag; other items save without the field', () => {
    makeState({ phase: 'evening', hours: 4 });
    goToJunkyard(state, gameRng);
    const queue = [0.5, 0.001];
    vi.spyOn(Math, 'random').mockImplementation(() => queue.length ? queue.shift()! : 0.5);
    dig(state, gameRng);
    const found = state.inv.at(-1)!;
    expect(isRareItem(found)).toBe(true);
    expect(found.rare).toBe(true);
    const plain = createItem(makeState(), 'chip', {}, mulberry32(1));
    expect('rare' in plain).toBe(false);
    expect(isRareItem(plain)).toBe(false);
    expect(isRareItem(makeItem('arm'))).toBe(false); // old saves: no field = ordinary
  });

  it('log and bubble lines of a rare find are recognised in both languages', () => {
    expect(isRareLine('Свалка: ' + RU.junk.rare.replace('{name}', 'Нейрочип'))).toBe(true);
    expect(isRareLine(EN.junk.rare.replace('{name}', 'Neurochip'))).toBe(true);
    expect(isRareLine('Свалка: ' + RU.junk.empty)).toBe(false);
  });

  it('the tile mark and the legend have "★ редкое"', () => {
    expect(RU.stock.legend.rare).toBe('редкое');
    expect(uiTs).toContain("rare: `<i class=\"tm\">${starSvg('rare')}</i>`");
    expect(uiTs).toContain("${MARK_HTML[mark]}${t(`stock.legend.${mark}`)}");
  });
});
