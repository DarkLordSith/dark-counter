// Junkyard v2 (15.11.2026): one heap, "Копать" up to digsBase + digBonus times, depth raises
// the rare chance, noise raises the guard drone chance; "home" at any moment.
import { gameRng } from '../../src/rng';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIG_ODDS, HUD_TEXT, JUNK, JUNK_TEXT, MAX_HEAT, SAVE_KEY } from '../../src/data';
import {
  canGoToJunkyard, dig, digBonus, digsPerVisit, droneChance, goHome, goToJunkyard, junkVisitHours, noiseLevel, rareChance,
} from '../../src/economy';
import { audio, MUSIC_KEY, playSfx, rememberSfx, SFX_KEY, SFX_NAMES, sfxWanted } from '../../src/audio';
import { migrate, state } from '../../src/state';
import type { JunkPile, SavedGame } from '../../src/types';
import uiTs from '../../src/ui.ts?raw';
import { makeItem, makeState } from './helpers';

/** Math.random returns these values in turn (then 0.5). */
function rolls(...values: number[]): void {
  const queue = [...values];
  vi.spyOn(Math, 'random').mockImplementation(() => queue.length ? queue.shift()! : 0.5);
}

function seedRandom(seed: number): void {
  let value = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => (value = value * 16807 % 2147483647) / 2147483647);
}

const atJunkyard = (): void => {
  makeState({ phase: 'evening', hours: 4 });
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

  it('gives exactly 5 digs without a bonus, then nothing more', () => {
    seedRandom(7);
    atJunkyard();
    expect(digBonus(state)).toBe(0);
    expect(state.junk?.d).toBe(JUNK.digsBase);
    let digs = 0;
    // the drone may end the visit early: count until it says no more
    while (dig(state, gameRng)) {
      digs++;
    }
    expect(digs).toBeLessThanOrEqual(5);
    expect(state.junk?.d).toBe(0);
    expect(dig(state, gameRng)).toBeNull();
  });

  it('never meets the drone without noise: 5 quiet digs', () => {
    atJunkyard();
    // drone rolls 0.99 (no drone), noise spread 0.5, loot 0.99 (empty) …
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const kinds = Array.from({ length: 6 }, () => dig(state, gameRng)?.kind);
    expect(kinds).toEqual(['empty', 'empty', 'empty', 'empty', 'empty', undefined]);
  });

  it('a fresh visit gets digsBase + digBonus digs (the bonus is the hook for gear and events)', () => {
    makeState({ phase: 'evening', hours: 4 });
    expect(digsPerVisit(state)).toBe(JUNK.digsBase + digBonus(state));
    goToJunkyard(state, gameRng);
    expect(state.junk?.d).toBe(digsPerVisit(state));
  });

  it('"home" works at any moment and ends the visit', () => {
    atJunkyard();
    goHome(state);
    expect(state.where).toBe('home');
    expect(state.junk).toBeNull();
    expect(dig(state, gameRng)).toBeNull();
    atJunkyard();
    dig(state, gameRng);
    goHome(state);
    expect(state.where).toBe('home');
  });
});

describe('depth and noise', () => {
  it('each dig goes one level deeper; deeper means a higher rare chance', () => {
    atJunkyard();
    dig(state, gameRng);
    dig(state, gameRng);
    expect(state.junk?.dp).toBe(2);
    expect(rareChance(4)).toBeGreaterThan(rareChance(0));
    expect(rareChance(0)).toBe(DIG_ODDS.rare);
    // never more than the "empty" share it takes from
    expect(rareChance(1000)).toBeCloseTo(DIG_ODDS.rare + DIG_ODDS.empty);
  });

  it('the same loot roll turns rare deeper in the heap', () => {
    // a roll just past parts + broken + the base rare chance: empty on the first dig, rare on the 5th
    // (each dig rolls: drone check, noise spread, loot)
    const roll = DIG_ODDS.parts + DIG_ODDS.broken + DIG_ODDS.rare + 0.01;
    atJunkyard();
    rolls(0.99, 0.5, roll);
    const first = dig(state, gameRng)?.kind;
    vi.restoreAllMocks();
    state.junk!.dp = 4;
    state.junk!.n = 0; // quiet: no drone
    rolls(0.99, 0.5, roll);
    const deep = dig(state, gameRng)?.kind;
    expect(first).toBe('empty');
    expect(deep).toBe('rare');
  });

  it('noise grows with every dig and reads as тихо → слышно → громко → дрон рядом', () => {
    atJunkyard();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const noise: number[] = [];
    for (let i = 0; i < 5; i++) {
      dig(state, gameRng);
      noise.push(state.junk!.n);
    }
    expect(noise.every((value, i) => i === 0 || value > noise[i - 1])).toBe(true);
    expect([0, 25, 45, 70].map(noiseLevel)).toEqual([0, 1, 2, 3]);
    expect(JUNK_TEXT.ru.levels).toEqual(['тихо', 'слышно', 'громко', 'дрон рядом']);
    expect(JUNK_TEXT.en.levels).toHaveLength(4);
  });

  it('the drone chance is (noise / 100)², and zero on the first dig', () => {
    expect(droneChance({ d: 5, n: 90, dp: 0, f: [], s: 1 })).toBe(0);
    expect(droneChance({ d: 3, n: 50, dp: 2, f: [], s: 1 })).toBeCloseTo(0.25);
    expect(droneChance({ d: 1, n: 0, dp: 4, f: [], s: 1 })).toBe(0);
  });
});

describe('the guard drone', () => {
  it('takes one find of this visit and ends the visit ("Пришлось бежать")', () => {
    atJunkyard();
    const old = makeItem('battery');
    state.inv.push(old);
    // first dig: the drone check cannot hit, loot roll just past parts → a broken find
    rolls(0, 0.5, DIG_ODDS.parts + 0.01);
    expect(dig(state, gameRng)?.kind).toBe('broken');
    vi.restoreAllMocks();
    const found = state.junk!.f[0];
    expect(state.inv.some(item => item.uid === found)).toBe(true);
    state.junk!.n = 100; // the drone surely comes
    rolls(0);
    const result = dig(state, gameRng);
    expect(result?.kind).toBe('drone');
    expect(result?.message).toContain('Пришлось бежать');
    expect(state.inv.some(item => item.uid === found)).toBe(false);
    expect(state.inv).toContain(old); // older stock is safe
    expect(state.junk).toMatchObject({ d: 0, run: true });
    expect(dig(state, gameRng)).toBeNull();
  });

  it('with no find of this visit it raises the wanted level', () => {
    atJunkyard();
    state.heat = 2;
    state.junk!.dp = 2;
    state.junk!.n = 100;
    rolls(0);
    expect(dig(state, gameRng)?.kind).toBe('drone');
    expect(state.heat).toBe(2 + JUNK.droneHeat);
    state.heat = MAX_HEAT;
    atJunkyard();
    state.junk!.dp = 2;
    state.junk!.n = 100;
    state.heat = MAX_HEAT;
    dig(state, gameRng);
    expect(state.heat).toBe(MAX_HEAT);
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

  it('cover every dig result, the noise, the drone and going home', () => {
    expect(SFX_NAMES).toEqual(expect.arrayContaining(['dig', 'empty', 'parts', 'broken', 'rare', 'drone', 'tick', 'hum', 'home']));
  });

  it('have their own menu item with RU/EN words', () => {
    expect(uiTs).toContain('data-a="sounds" aria-pressed="${audio.sfx}">${HUD.sounds}: ${audio.sfx ? HUD.on : HUD.off}');
    expect(HUD_TEXT.ru.sounds + ': ' + HUD_TEXT.ru.on).toBe('Звуки: вкл');
    expect(HUD_TEXT.en.sounds + ': ' + HUD_TEXT.en.off).toBe('Sounds: off');
  });
});

describe('strings', () => {
  it('RU and EN have the same junkyard keys', () => {
    expect(Object.keys(JUNK_TEXT.en).sort()).toEqual(Object.keys(JUNK_TEXT.ru).sort());
  });

  it('the old piles are gone from the interface', () => {
    expect(uiTs).not.toContain('Куча ');
    expect(uiTs).not.toContain('digPile');
  });
});
