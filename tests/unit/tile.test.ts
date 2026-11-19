// The one item tile (task 35): the stock, the backpack and the seller's item look the same —
// the condition top left ("?" until checked), one status mark top right, the most dangerous known.
import { describe, expect, it } from 'vitest';
import { ICONS } from '../../src/icons';
import { tileCondition, tileMark, TILE_MARKS } from '../../src/tile';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import { makeItem } from './helpers';

const known = { cond: true, serial: true, flaw: true };

describe('the mark in the corner', () => {
  it('the order of danger: ◉ AI > ▲ stolen > ★̸ fake > ✕ broken > ★ rare', () => {
    expect(TILE_MARKS).toEqual(['ai', 'stolen', 'fake', 'broken', 'rare']);
    const everything = makeItem('chip', { infected: true, stolen: true, defect: true, rare: true, k: known });
    expect(tileMark(everything)).toBe('ai');
    expect(tileMark({ ...everything, infected: false })).toBe('stolen');
    expect(tileMark({ ...everything, infected: false, stolen: false })).toBe('broken');
    expect(tileMark({ ...everything, infected: false, stolen: false, defect: false })).toBe('rare');
    expect(tileMark({ ...everything, infected: false, stolen: false, defect: false, rare: undefined })).toBeNull();
  });

  it('a hidden problem shows only after its check; the fake waits for B1', () => {
    const unchecked = makeItem('chip', { infected: true, stolen: true, defect: true, k: { cond: false, serial: false, flaw: false } });
    expect(tileMark(unchecked)).toBeNull();
    expect(tileMark({ ...unchecked, k: { cond: false, serial: true, flaw: false } })).toBe('stolen');
    expect(tileMark({ ...unchecked, k: { cond: false, serial: false, flaw: true } })).toBe('ai');
    expect(tileMark({ ...unchecked, rare: true })).toBe('rare'); // no separate "?" mark
  });
});

describe('the condition in the corner', () => {
  it('"?" until checked, then the %', () => {
    const item = makeItem('battery', { cond: 37, k: { cond: false, serial: false, flaw: false } });
    expect(tileCondition(item)).toBeNull();
    expect(tileCondition({ ...item, k: { ...item.k, cond: true } })).toBe(37);
    expect(uiTs).toContain(`'<b class="tc tc-unknown">?</b>'`);
  });
});

describe('the tile on screen', () => {
  it('one face for the stock, the backpack and the seller card; the price stays under it', () => {
    expect(uiTs).toContain("const stockTile = (item: Item): string => itemTile(item, 'sel', ui.sel === item.uid);");
    expect(uiTs).toContain("${tileFace(item, 'midico')}<div class=\"di-body\">");
    expect(uiTs).toMatch(/function itemTile[\s\S]*?\$\{tileFace\(item\)\}<span class="tv">/);
  });

  it('60×36 face, the icon ×2 in the middle, pixel 8px on a bg plate, "?" grey (unknown = dim)', () => {
    expect(styleCss).toMatch(/\.tface \{[^}]*width: 60px;[^}]*height: 36px;/);
    expect(styleCss).toMatch(/\.tc \{[^}]*background: var\(--bg\);[^}]*color: var\(--fg\);[^}]*font-size: var\(--fs-px-s\);/);
    expect(styleCss).toMatch(/\.tc-unknown \{\s*color: var\(--m-unknown\);/);
  });

  it('◉ and ▲ are 5×5 pixel icons like ✕ and ★', () => {
    expect(ICONS.ai).toMatchObject({ w: 5, h: 5 });
    expect(ICONS.stolen).toMatchObject({ w: 5, h: 5 });
    expect(ICONS.broken).toMatchObject({ w: 5, h: 5 });
  });
});
