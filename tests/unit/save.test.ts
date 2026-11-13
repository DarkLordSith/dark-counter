// Save compatibility: migrate(), DC1 export/import and real saves of past versions.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDLORD_SEED, LEGACY_RENT_PERIOD, RENT, SAVE_CODE_PREFIX } from '../../src/data';
import { callNextCustomer, closeShop, customerLeaves, payRent, sleepUntilMorning } from '../../src/economy';
import { actor, actorReset, exportSave, importSave, migrate, newGame, setState, state } from '../../src/state';
import type { SavedGame } from '../../src/types';
import { makeState } from './helpers';

/** Every file in tests/fixtures/, picked up automatically. */
const FIXTURES = import.meta.glob<string>('../fixtures/*.txt', { query: '?raw', import: 'default', eager: true });

/** Deterministic Math.random for the duration of a test. */
function seedRandom(seed: number): void {
  let value = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => (value = value * 16807 % 2147483647) / 2147483647);
}

const encode = (data: unknown): string => SAVE_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(data))));

afterEach(() => {
  vi.restoreAllMocks();
  actorReset();
});

describe('migrate', () => {
  function legacySave(day: number): SavedGame {
    const { nextDue, owed, deferred, llAt, llDone, ...legacy } = makeState({ day, rent: 450 });
    void [nextDue, owed, deferred, llAt, llDone];
    return legacy;
  }

  it('returns null for no save', () => {
    expect(migrate(null)).toBeNull();
  });

  it('adds the landlord fields to a save made before the landlord update', () => {
    const migrated = migrate(legacySave(4));
    expect(migrated).toMatchObject({ nextDue: 6, owed: 450, deferred: false, llDone: false });
    expect(migrated?.llAt).toBeGreaterThanOrEqual(1);
    expect(migrated?.llAt).toBeLessThanOrEqual(4);
  });

  // v1/v2 saves had rent every 3 days: migrate() keeps that schedule (LEGACY_RENT_PERIOD), not the weekly one.
  it('puts the first landlord visit on the next 3rd day', () => {
    expect(LEGACY_RENT_PERIOD).toBe(3);
    expect(migrate(legacySave(1))?.nextDue).toBe(3);
    expect(migrate(legacySave(3))?.nextDue).toBe(3);
    expect(migrate(legacySave(5))?.nextDue).toBe(6);
  });

  it('leaves a current save untouched', () => {
    const current = makeState({ day: 7, nextDue: 9, owed: 540, deferred: true, llAt: 3, llDone: true });
    const copy = structuredClone(current);
    expect(migrate(current)).toEqual(copy);
  });
});

describe('DC1 save code', () => {
  it('survives export → import unchanged, mid-game with a customer at the counter', () => {
    seedRandom(42);
    newGame();
    callNextCustomer();
    const code = exportSave();
    expect(code.startsWith('DC1:')).toBe(true);
    const imported = importSave(code);
    expect(imported).toEqual(state);
    expect(JSON.stringify(imported)).toBe(JSON.stringify(state)); // same field order too
  });

  it('keeps Cyrillic text intact', () => {
    makeState({ log: ['Д1: Гробов опечатал лавку. «Кольцо Б» — ★'] });
    expect(importSave(exportSave())?.log[0]).toBe('Д1: Гробов опечатал лавку. «Кольцо Б» — ★');
  });

  it('tolerates spaces, line breaks and a missing DC1: prefix', () => {
    makeState({ credits: 1234 });
    const code = exportSave();
    const messy = `  ${code.slice(0, 20)}\n ${code.slice(20)}  \n`;
    expect(importSave(messy)?.credits).toBe(1234);
    expect(importSave(code.slice(SAVE_CODE_PREFIX.length))?.credits).toBe(1234);
  });

  it('rejects garbage and JSON that is not a save', () => {
    expect(importSave('')).toBeNull();
    expect(importSave(null)).toBeNull();
    expect(importSave('nonsense')).toBeNull();
    expect(importSave(encode({ hello: 'world' }))).toBeNull();
    expect(importSave(encode({ inv: [], phase: 'shop', credits: '100' }))).toBeNull();
  });

  it('migrates an old code on import', () => {
    const { nextDue, ...legacy } = makeState({ day: 2 });
    void nextDue;
    expect(importSave(encode(legacy))?.nextDue).toBe(3);
  });
});

describe('saves of past versions (tests/fixtures)', () => {
  const files = Object.entries(FIXTURES);

  it('has fixtures to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)('%s', (_path, raw) => {
    const code = raw.trim().replace(/\s+/g, '');

    it('loads', () => {
      const loaded = importSave(code);
      expect(loaded).not.toBeNull();
      expect(loaded?.inv).toBeInstanceOf(Array);
    });

    it('exports back to the very same code', () => {
      setState(importSave(code)!);
      expect(exportSave()).toBe(code);
    });

    it('keeps its rent, debt and due day: the weekly period starts from the next payment', () => {
      const original: SavedGame = JSON.parse(decodeURIComponent(escape(atob(code.replace(SAVE_CODE_PREFIX, '')))));
      const loaded = importSave(code)!;
      expect({ rent: loaded.rent, owed: loaded.owed, nextDue: loaded.nextDue })
        .toEqual({ rent: original.rent, owed: original.owed, nextDue: original.nextDue });
      setState(loaded);
      state.day = state.nextDue;
      state.credits = state.owed;
      state.cust = { kind: 'rent', name: 'Гробов', seed: LANDLORD_SEED, msg: '', pat: 0, max: 0, done: {} };
      payRent();
      expect(state.nextDue).toBe(state.day + RENT.periodDays);
      expect(state.rent).toBe((original.rent ?? 0) + RENT.increase);
    });

    it('can be played on: the next day starts and customers come', () => {
      seedRandom(7);
      const loaded = importSave(code)!;
      setState(loaded);
      const day = loaded.day;
      if (state.phase === 'shop') {
        if (state.cust) {
          customerLeaves();
          actorReset();
        }
        closeShop();
      }
      sleepUntilMorning();
      expect(state.day).toBe(day + 1);
      expect(state.phase).toBe('shop');
      callNextCustomer();
      if (!state.over) {
        expect(state.cust).not.toBeNull();
        expect(actor.phase).toBe('in');
      }
    });
  });
});
