// Junkyard v3 (task 35, 19.11.2026): one heap, "Копать" gives 0–3 finds and 0–2 parts, depth raises
// the rare chance of each find, the backpack holds 8; no drone, no noise; "home" at any moment.
import { gameRng, mulberry32 } from '../../src/rng';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIG_LOOT, DIG_ODDS, JUNK, SAVE_KEY } from '../../src/data';

import {
  canGoToJunkyard, dig, digBonus, digsPerVisit, goHome, goToJunkyard, isBackpackFull, junkVisitHours, leaveWaiting, rareChance,
  throwAway, waitingFinds,
} from '../../src/economy';
import { droneChance, noiseLevel } from '../../src/guarddrone';
import { audio, MUSIC_KEY, playSfx, rememberSfx, SFX_KEY, SFX_NAMES, sfxWanted } from '../../src/audio';
import { migrate, state } from '../../src/state';
import type { Item, JunkPile, SavedGame } from '../../src/types';
import economyTs from '../../src/economy.ts?raw';
import sceneTs from '../../src/scene.ts?raw';
import uiTs from '../../src/ui.ts?raw';
import { makeItem, makeState } from './helpers';
import { RU } from '../../src/lang/ru';
import { EN } from '../../src/lang/en';
import { text } from '../../src/i18n';

const atJunkyard = (hours = 5): void => {
  makeState({ phase: 'evening', hours });
  goToJunkyard(state, gameRng);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a visit', () => {
  it('the road costs an hour, every dig then pays its own (past midnight: day.test.ts)', () => {
    makeState({ phase: 'evening', hours: 4 });
    expect(canGoToJunkyard(state)).toBe(true);
    goToJunkyard(state, gameRng);
    expect(state.where).toBe('junk');
    expect(state.hours).toBe(4 - junkVisitHours());
    expect(junkVisitHours()).toBe(JUNK.travelHours);
    makeState({ phase: 'evening', hours: junkVisitHours() });
    expect(canGoToJunkyard(state)).toBe(false);
  });

  it('digs up to the safety cap of 6 (+ the bonus hook), then nothing more', () => {
    atJunkyard();
    expect(digBonus(state)).toBe(0);
    expect(JUNK.maxDigs).toBe(6);
    expect(digsPerVisit(state)).toBe(JUNK.maxDigs + digBonus(state));
    expect(state.junk?.d).toBe(digsPerVisit(state));
    const rng = mulberry32(3);
    let digs = 0;
    while (dig(state, rng)) {
      digs++;
      state.junk!.f.forEach(uid => throwAway(state, uid)); // keep places free: the cap, not the backpack
    }
    expect(digs).toBe(6);
    expect(dig(state, rng)).toBeNull();
  });

  it('"home" works at any moment and ends the visit; the finds stay in the stock', () => {
    atJunkyard();
    goHome(state);
    expect(state.where).toBe('home');
    expect(state.junk).toBeNull();
    expect(dig(state, gameRng)).toBeNull();
    atJunkyard();
    const rng = mulberry32(5);
    dig(state, rng);
    dig(state, rng);
    const found = [...state.junk!.f];
    goHome(state);
    expect(state.where).toBe('home');
    expect(found.every(uid => state.inv.some(item => item.uid === uid))).toBe(true);
  });

  it('no drone and no noise any more: the noise field stays 0, the wanted level never moves', () => {
    atJunkyard();
    state.heat = 3;
    const rng = mulberry32(11);
    for (let i = 0; i < 6; i++) {
      dig(state, rng);
      leaveWaiting(state);
    }
    expect(state.junk?.n).toBe(0);
    expect(state.junk?.run).toBeUndefined();
    expect(state.heat).toBe(3);
    expect(economyTs).not.toMatch(/droneCatches|noiseLevel|droneChance/);
    expect(sceneTs).not.toContain('drawGuardDrone');
  });
});

describe('what a dig gives (seeded)', () => {
  /** Plays `visits` visits of four digs (the evening before midnight) with one seed; an unbounded backpack. */
  function tally(seed: number, visits: number): { counts: number[]; parts: number; items: number; rare: number; condMin: number; condMax: number } {
    const rng = mulberry32(seed);
    const counts = [0, 0, 0, 0];
    let parts = 0, items = 0, rare = 0, condMin = 100, condMax = 0;
    for (let v = 0; v < visits; v++) {
      atJunkyard();
      for (let d = 0; d < 4; d++) {
        const result = dig(state, rng)!;
        counts[result.items.length]++;
        parts += result.parts;
        items += result.items.length;
        for (const item of result.items) {
          if (item.rare) {
            rare++;
          } else {
            condMin = Math.min(condMin, item.cond);
            condMax = Math.max(condMax, item.cond);
          }
        }
        state.junk!.f = []; // the counts, not the backpack
      }
    }
    return { counts, parts, items, rare, condMin, condMax };
  }

  it('1–3 items (50/35/15%) or none (10%), 0–2 parts a dig; cheap and broken: 5–30%', () => {
    const digs = 4000;
    const { counts, parts, condMin, condMax } = tally(1, digs / 4);
    const share = counts.map(n => n / digs);
    expect(share[0]).toBeCloseTo(DIG_ODDS.empty, 1);
    expect(share[1]).toBeCloseTo(0.9 * 0.5, 1);
    expect(share[2]).toBeCloseTo(0.9 * 0.35, 1);
    expect(share[3]).toBeCloseTo(0.9 * 0.15, 1);
    expect(parts / digs).toBeCloseTo((DIG_LOOT.partsMin + DIG_LOOT.partsMax) / 2, 1);
    expect(condMin).toBeGreaterThanOrEqual(5);
    expect(condMax).toBeLessThanOrEqual(30);
  });

  it('a visit before midnight (four digs) brings about 5 items', () => {
    const visits = 1000;
    const { items } = tally(2, visits);
    // 4 digs × (1 − empty) × the average 1–3 items (task 36: empty 20% → ≈ 5.3)
    const expected = 4 * (1 - DIG_ODDS.empty) * DIG_ODDS.items.reduce((sum, odds, i) => sum + odds * (i + 1), 0);
    expect(items / visits).toBeGreaterThan(expected - 0.5);
    expect(items / visits).toBeLessThan(expected + 0.5);
  });

  it('★ — 4% a find, +2% for every dig deeper', () => {
    expect(rareChance(0)).toBeCloseTo(0.04);
    expect(rareChance(1)).toBeCloseTo(0.06);
    expect(rareChance(5)).toBeCloseTo(0.14);
    const { items, rare } = tally(3, 1000);
    // four digs: depth 0…3, the average chance 7%
    expect(rare / items).toBeGreaterThan(0.055);
    expect(rare / items).toBeLessThan(0.085);
  });

  it('a find: the condition is seen at once (you dug it out), the serial and the insides are not', () => {
    atJunkyard();
    const rng = mulberry32(8);
    let found: Item[] = [];
    while (!found.length) {
      found = dig(state, rng)!.items;
    }
    expect(found[0].k).toEqual({ cond: true, serial: false, flaw: false });
  });

  it('the message lists the finds and the parts; a rare one keeps the junk.rare key for the ★', () => {
    atJunkyard();
    const rng = mulberry32(4);
    for (let i = 0; i < 6; i++) {
      const result = dig(state, rng)!;
      const line = text(result.message);
      if (result.items.some(item => item.rare)) {
        expect(line).toContain('Редкая находка');
      } else if (result.items.length) {
        expect(line).toContain('Откопал:');
      }
      if (result.parts && result.items.length) {
        expect(line).toContain(`Запчасти: +${result.parts}`);
      }
      state.junk!.f = [];
    }
  });
});

describe('the backpack', () => {
  /** A visit with a full backpack (8 broken batteries) and a dig that surely finds something. */
  function fullBackpack(): Item[] {
    atJunkyard();
    const pack = Array.from({ length: JUNK.backpackSize }, (_, i) => makeItem('battery', { uid: 100 + i, cond: 10 }));
    state.inv.push(...pack);
    state.junk!.f = pack.map(item => item.uid);
    return pack;
  }

  it('is full at 8: the dig still works, the finds that do not fit wait ("Рюкзак полон")', () => {
    fullBackpack();
    expect(isBackpackFull(state)).toBe(true);
    const rng = mulberry32(9);
    let result = dig(state, rng)!;
    while (!result.items.length) {
      result = dig(state, rng)!;
    }
    expect(result.left).toBe(result.items.length);
    expect(waitingFinds(state)).toEqual(result.items);
    expect(state.junk!.f).toHaveLength(JUNK.backpackSize);
    expect(result.items.every(item => !state.inv.includes(item))).toBe(true);
    expect(text(result.message)).toContain('Рюкзак полон');
  });

  it('"Выбросить" frees a place: the item is gone, a waiting find takes the place', () => {
    const pack = fullBackpack();
    const rng = mulberry32(9);
    while (!dig(state, rng)!.items.length) {
      // dig until something waits
    }
    const waiting = [...waitingFinds(state)];
    const came = throwAway(state, pack[0].uid);
    expect(came).toBe(waiting[0]);
    expect(state.inv).not.toContain(pack[0]);
    expect(state.inv).toContain(waiting[0]);
    expect(state.junk!.f).toContain(waiting[0].uid);
    expect(state.junk!.f).toHaveLength(JUNK.backpackSize);
    expect(waitingFinds(state)).toEqual(waiting.slice(1));
  });

  it('"Оставить находку", the next dig or the road home leave the waiting finds behind', () => {
    fullBackpack();
    state.junk!.w = [makeItem('servo', { uid: 300 })];
    leaveWaiting(state);
    expect(waitingFinds(state)).toEqual([]);
    expect('w' in state.junk!).toBe(false);
    state.junk!.w = [makeItem('servo', { uid: 301 })];
    dig(state, mulberry32(1));
    expect(waitingFinds(state).some(item => item.uid === 301)).toBe(false);
    state.junk!.w = [makeItem('servo', { uid: 302 })];
    goHome(state);
    expect(state.inv.some(item => item.uid === 302)).toBe(false);
  });

  it('throwing out with nothing waiting just frees the place; only finds of this visit can go', () => {
    const pack = fullBackpack();
    const old = makeItem('chip', { uid: 500 });
    state.inv.push(old);
    expect(throwAway(state, old.uid)).toBeNull();
    expect(state.inv).toContain(old);
    expect(throwAway(state, pack[3].uid)).toBeNull();
    expect(state.junk!.f).toHaveLength(JUNK.backpackSize - 1);
    expect(isBackpackFull(state)).toBe(false);
  });
});

describe('the drone, put aside for patch C1 (guarddrone.ts)', () => {
  it('keeps the v2 rules: the noise words and the chance (noise / 100)², zero on the first dig', () => {
    expect([0, 25, 45, 70].map(noiseLevel)).toEqual([0, 1, 2, 3]);
    expect(droneChance(90, 0)).toBe(0);
    expect(droneChance(50, 2)).toBeCloseTo(0.25);
    expect(droneChance(0, 4)).toBe(0);
  });
});

describe('old saves in the middle of a junkyard visit', () => {
  const piles = (dug: number): JunkPile[] => Array.from({ length: 6 }, (_, i) => ({ dug: i < dug, seed: 40 + i }));
  const oldSave = (where: 'home' | 'junk', hours: number, dug: number): SavedGame => ({
    ...makeState({ phase: 'evening', where, hours }),
    junk: { piles: piles(dug) },
  });

  it('become a v2 visit with the digs the old visit still allowed', () => {
    const migrated = migrate(oldSave('junk', 2, 1));
    expect(migrated?.junk).toEqual({ d: 2, n: 0, dp: 4, f: [], s: 40 });
    expect(migrated?.where).toBe('junk');
  });

  it('go home when nothing is left to dig, and drop the piles kept after "home"', () => {
    expect(migrate(oldSave('junk', 0, 2))).toMatchObject({ where: 'home', junk: null });
    expect(migrate(oldSave('home', 3, 3))).toMatchObject({ where: 'home', junk: null });
  });

  it('a v2 visit is kept as it is', () => {
    const visit = { d: 3, n: 26, dp: 2, f: [5], s: 9 };
    expect(migrate({ ...makeState({ phase: 'evening', where: 'junk', hours: 1 }), junk: { ...visit } })?.junk).toEqual(visit);
  });

  it('a v2 visit with noise loads and plays on in v3: digs, no drone, home', () => {
    const find = makeItem('battery', { uid: 5, cond: 12 });
    const saved = { ...makeState({ phase: 'evening', where: 'junk', hours: 2, inv: [find] }), junk: { d: 3, n: 58, dp: 2, f: [5], s: 9 } };
    const game = migrate(JSON.parse(JSON.stringify(saved)) as SavedGame)!;
    expect(game.junk).toEqual({ d: 3, n: 58, dp: 2, f: [5], s: 9 });
    const rng = mulberry32(6);
    const result = dig(game, rng)!;
    expect(result).not.toBeNull();
    expect(game.junk!.n).toBe(58); // kept, not used
    expect(game.junk!.dp).toBe(3);
    expect(game.heat).toBe(saved.heat);
    goHome(game);
    expect(game.inv.some(item => item.uid === 5)).toBe(true);
  });

  it('a v2 visit after the drone (run) has no digs left: only "home"', () => {
    const saved = { ...makeState({ phase: 'evening', where: 'junk', hours: 1 }), junk: { d: 0, n: 80, dp: 3, f: [], s: 9, run: true } };
    const game = migrate(JSON.parse(JSON.stringify(saved)) as SavedGame)!;
    expect(dig(game, mulberry32(1))).toBeNull();
    goHome(game);
    expect(game.where).toBe('home');
  });
});

describe('junkyard sounds', () => {
  const memory = (): Storage => {
    const data = new Map<string, string>();
    return {
      getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: key => void data.delete(key),
      clear: () => data.clear(), key: () => null, get length() { return data.size; },
    };
  };

  it('are on by default, and "Звуки: выкл" is remembered apart from the music and the save', () => {
    const storage = memory();
    expect(sfxWanted(storage)).toBe(true);
    rememberSfx(false, storage);
    expect(sfxWanted(storage)).toBe(false);
    expect(storage.getItem(MUSIC_KEY)).toBeNull();
    rememberSfx(true, storage);
    expect(sfxWanted(storage)).toBe(true);
    expect(SFX_KEY).not.toBe(MUSIC_KEY);
    expect(SFX_KEY.startsWith(SAVE_KEY)).toBe(false);
  });

  it('do not play when switched off', () => {
    const before = audio.sfx;
    audio.sfx = false;
    expect(SFX_NAMES.map(name => playSfx(name))).toEqual(SFX_NAMES.map(() => false));
    audio.sfx = before;
  });

  it('cover every dig result and going home', () => {
    expect(SFX_NAMES).toEqual(expect.arrayContaining(['dig', 'empty', 'parts', 'broken', 'rare', 'home']));
  });

  it('have their own menu item with RU/EN words', () => {
    expect(uiTs).toContain("data-a=\"sounds\" aria-pressed=\"${audio.sfx}\">${t('hud.sounds')}: ${audio.sfx ? t('hud.on') : t('hud.off')}");
    expect(RU.hud.sounds + ': ' + RU.hud.on).toBe('Звуки: вкл');
    expect(EN.hud.sounds + ': ' + EN.hud.off).toBe('Sounds: off');
  });
});

describe('strings', () => {
  it('RU and EN have the same junkyard keys', () => {
    expect(Object.keys(EN.junk).sort()).toEqual(Object.keys(RU.junk).sort());
  });

  it('the old piles are gone from the interface', () => {
    expect(uiTs).not.toContain('Куча ');
    expect(uiTs).not.toContain('digPile');
  });
});
