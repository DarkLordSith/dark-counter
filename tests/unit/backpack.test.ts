// The junkyard backpack (task 29): one row of slots per visit, the finds from the left, the drone's trace in place.
import { describe, expect, it } from 'vitest';
import { backpackFinds, backpackSlots, droneTrace } from '../../src/backpack';
import { JUNK } from '../../src/data';

import { dig, digsPerVisit, goToJunkyard } from '../../src/economy';
import { ICONS } from '../../src/icons';
import { mulberry32 } from '../../src/rng';
import type { JunkVisit } from '../../src/types';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import { makeItem, makeState } from './helpers';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';

const visitOf = (f: number[], dp: number, d: number): JunkVisit => ({ d, n: 0, dp, f, s: 77 });

describe('backpack slots', () => {
  it('as many slots as digs of the visit; the finds first, in the order dug up', () => {
    const broken = makeItem('battery', { cond: 20 });
    const rare = makeItem('battery', { rare: true });
    const other = makeItem('battery');
    const visit = visitOf([broken.uid, rare.uid], 3, 2);
    const slots = backpackSlots(visit, [other, rare, broken], null, 5);
    expect(slots).toHaveLength(5);
    expect(slots.map(slot => slot.kind)).toEqual(['item', 'item', 'empty', 'empty', 'empty']);
    expect(slots[0]).toMatchObject({ item: broken, mark: 'broken' });
    expect(slots[1]).toMatchObject({ item: rare, mark: 'rare' });
    expect(backpackFinds(visit, [other, rare, broken])).toEqual([broken, rare]);
  });

  it('a new visit starts with digsPerVisit empty slots', () => {
    const state = makeState({ phase: 'evening', hours: 12 });
    goToJunkyard(state, mulberry32(1));
    expect(backpackSlots(state.junk!, state.inv, null, digsPerVisit(state))).toEqual(Array(digsPerVisit(state)).fill({ kind: 'empty' }));
    expect(digsPerVisit(state)).toBe(JUNK.digsBase);
  });

  it('the drone: its catch leaves a trace in its own slot, the other tiles do not shift', () => {
    const a = makeItem('battery');
    const b = makeItem('battery');
    const c = makeItem('battery');
    const before = [a, b, c].map(({ uid, t }) => ({ uid, t }));
    const visit = visitOf([a.uid, c.uid], 4, 0);
    const trace = droneTrace(before, visit);
    expect(trace).toEqual({ seed: 77, index: 1, type: 'battery' });
    // the drone ended the visit after 4 digs of 5: the row keeps all 5 slots
    const slots = backpackSlots(visit, [a, c], trace, 5);
    expect(slots.map(slot => slot.kind)).toEqual(['item', 'gone', 'item', 'empty', 'empty']);
    expect(slots[2]).toMatchObject({ item: c });
    // the next visit (another heap seed) has no trace
    expect(backpackSlots({ ...visit, s: 78 }, [a, c], trace, 5).map(slot => slot.kind)).toEqual(['item', 'item', 'empty', 'empty', 'empty']);
  });

  it('no trace when the drone took nothing (the wanted level went up)', () => {
    expect(droneTrace([], visitOf([], 2, 0))).toBeNull();
  });

  it('a real visit: digging fills the row, the count is the finds still in the backpack', () => {
    const state = makeState({ phase: 'evening', hours: 24 });
    const rng = mulberry32(5);
    goToJunkyard(state, rng);
    while (state.junk && state.junk.d > 0) {
      dig(state, rng);
    }
    const visit = state.junk!;
    const slots = backpackSlots(visit, state.inv, null, digsPerVisit(state));
    expect(slots).toHaveLength(digsPerVisit(state));
    expect(slots.filter(slot => slot.kind === 'item')).toHaveLength(backpackFinds(visit, state.inv).length);
  });
});

describe('backpack on screen', () => {
  it('under the noise scale, above the home hint; texts RU/EN', () => {
    const pane = uiTs.match(/function junkyardPane[\s\S]*?\n}/)?.[0] ?? '';
    expect(pane.indexOf('noiseMeter(')).toBeLessThan(pane.indexOf('backpackRow('));
    expect(pane.indexOf('backpackRow(')).toBeLessThan(pane.indexOf('${homeHint}'));
    expect(RU.junk.backpack).toBe('Рюкзак');
    expect(EN.junk.backpack).toBe('Backpack');
  });

  it('tiles 60×36, an empty slot is a line outline, ✕ is a 5×5 pixel icon', () => {
    expect(styleCss).toMatch(/\.bp-slot \{[^}]*width: 60px;[^}]*height: 36px;[^}]*border: 1px solid var\(--line\);/);
    expect(styleCss).toMatch(/\.bp-broken \{\s*color: var\(--m-wear\);/);
    expect(styleCss).toMatch(/\.bp-gone::before \{[^}]*border: 1px solid var\(--m-risk\);[^}]*opacity: 0\.43;/);
    expect(ICONS.broken).toMatchObject({ w: 5, h: 5 });
  });

  it('reduced motion: no flash, no flight', () => {
    const reduced = [...styleCss.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
    expect(reduced).toMatch(/\.bp-new,\s*\.bp-new-rare \{\s*animation: none;/);
    expect(reduced).toMatch(/\.bp-fly \{\s*display: none;/);
  });
});
