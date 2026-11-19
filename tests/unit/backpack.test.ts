// The junkyard backpack (task 35, v3): a 4×2 grid of 8 places, the finds of the visit in the order dug up,
// the one item tile, a card with "Выбросить", the "Рюкзак полон" choice.
import { describe, expect, it } from 'vitest';
import { BACKPACK_COLUMNS, backpackFinds, backpackSlots } from '../../src/backpack';
import { JUNK } from '../../src/data';

import { dig, goToJunkyard, throwAway } from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import type { JunkVisit } from '../../src/types';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import { makeItem, makeState } from './helpers';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';

const visitOf = (f: number[]): JunkVisit => ({ d: 3, n: 0, dp: 3, f, s: 77 });

describe('backpack places', () => {
  it('8 places in 2 rows of 4; the finds first, in the order dug up', () => {
    expect(JUNK.backpackSize).toBe(8);
    expect(BACKPACK_COLUMNS * 2).toBe(JUNK.backpackSize);
    const broken = makeItem('battery', { uid: 1, cond: 20 });
    const rare = makeItem('chip', { uid: 2, rare: true });
    const other = makeItem('battery', { uid: 3 });
    const visit = visitOf([broken.uid, rare.uid]);
    const slots = backpackSlots(visit, [other, rare, broken]);
    expect(slots).toHaveLength(8);
    expect(slots.map(slot => slot.kind)).toEqual(['item', 'item', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(slots[0]).toMatchObject({ item: broken });
    expect(backpackFinds(visit, [other, rare, broken])).toEqual([broken, rare]);
  });

  it('a new visit starts empty; digging fills it, a thrown-out find frees its place', () => {
    const state = makeState({ phase: 'evening', hours: 24 });
    const rng = mulberry32(5);
    goToJunkyard(state, rng);
    expect(backpackSlots(state.junk!, state.inv).every(slot => slot.kind === 'empty')).toBe(true);
    while (!state.junk!.f.length) {
      dig(state, rng);
    }
    const count = backpackFinds(state.junk!, state.inv).length;
    throwAway(state, state.junk!.f[0]);
    expect(backpackSlots(state.junk!, state.inv).filter(slot => slot.kind === 'item')).toHaveLength(count - 1);
  });
});

describe('backpack on screen', () => {
  it('the depth scale, the grid, then the card / "Рюкзак полон" / home; texts RU/EN', () => {
    const pane = uiTs.match(/function junkyardPane[\s\S]*?\n}/)?.[0] ?? '';
    expect(pane.indexOf('depthMeter(')).toBeLessThan(pane.indexOf('backpackGrid('));
    expect(pane.indexOf('backpackGrid(')).toBeLessThan(pane.indexOf('${below}'));
    expect(pane).toMatch(/findCard\(picked\)[\s\S]*fullNote\(waiting\)[\s\S]*homeButton/);
    expect(uiTs).not.toContain('noiseMeter');
    expect(RU.junk.backpack).toBe('Рюкзак');
    expect(EN.junk.backpack).toBe('Backpack');
    expect(RU.junk.throwAway).toBe('Выбросить');
    expect(RU.junk.packFull).toBe('Рюкзак полон');
    expect(RU.junk.openPack).toBe('Выбросить что-то');
    expect(RU.junk.leave).toBe('Оставить находку');
  });

  it('the grid is 4 columns of item tiles, an empty place is a 60×36 line outline', () => {
    expect(styleCss).toMatch(/\.bp-grid \{[^}]*grid-template-columns: repeat\(4, 62px\);/);
    expect(styleCss).toMatch(/\.bp-slot \{[^}]*width: 62px;[^}]*border: 1px solid var\(--line\);/);
    expect(uiTs).toContain("itemTile(item, 'pick', backpack.pick === item.uid");
  });

  it('a tap on a find opens its card; the card throws out, "Выбросить что-то" opens the cheapest', () => {
    expect(uiTs).toMatch(/data-a="throw" data-v="\$\{item\.uid\}"/);
    expect(uiTs).toMatch(/openpack: \(\) => \{[\s\S]*?estimatedValue\(a\) - estimatedValue\(b\)/);
    expect(uiTs).toMatch(/leavefind: \(\) => leaveWaiting\(state\)/);
  });

  it('reduced motion: no flash', () => {
    const reduced = [...styleCss.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
    expect(reduced).toMatch(/\.bp-new,\s*\.bp-new-rare \{\s*animation: none;/);
  });
});
