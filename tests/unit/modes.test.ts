// Game modes (story / calm / sandbox stub), one save slot per mode, the player profile.
import { gameRng } from '../../src/rng';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEBT, LANDLORD_SEED, MODE_TEXT, MODES, PLAYABLE_MODES, PROFILE_KEY, SAVE_CODE_PREFIX, SAVE_KEY, SAVE_KEYS } from '../../src/data';
import {
  canBuySeat, closeShop, isDebtClosed, isLandlordDue, payEarly, payRent, sleepUntilMorning,
} from '../../src/economy';
import { defaultProfile, isPlayable, loadProfile, recordEnding, saveProfile } from '../../src/profile';
import { actorReset, exportSave, importSave, loadGame, migrate, newGame, persistence, readSlot, saveGame, setState, state } from '../../src/state';
import type { KeyValueStore, SavedGame } from '../../src/types';
import { makeState } from './helpers';

const FIXTURES = import.meta.glob<string>('../fixtures/*.txt', { query: '?raw', import: 'default', eager: true });

/** localStorage stand-in. */
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

function sleep(): string[] {
  closeShop(state);
  return sleepUntilMorning(state, gameRng).events;
}

afterEach(() => {
  vi.restoreAllMocks();
  actorReset();
  persistence.enabled = true;
});

describe('modes', () => {
  it('story, calm and the locked sandbox; names RU/EN', () => {
    expect(MODES).toEqual(['story', 'calm', 'sandbox']);
    expect(PLAYABLE_MODES).toEqual(['story', 'calm']);
    expect(MODE_TEXT.ru.names).toEqual({ story: 'Начало конца', calm: 'Без таймера', sandbox: 'Своя лавка' });
    expect(MODE_TEXT.en.names).toEqual({ story: 'Beginning of the End', calm: 'No Timer', sandbox: 'Your Own Shop' });
    expect(Object.keys(MODE_TEXT.en)).toEqual(Object.keys(MODE_TEXT.ru));
  });

  it('a new game is story by default', () => {
    newGame();
    expect(state.mode).toBe('story');
    newGame('calm');
    expect(state).toMatchObject({ mode: 'calm', debt: DEBT.start });
    expect(state.log[0]).not.toContain('шаттл');
  });

  it('sandbox cannot be played yet, even if a profile or a code says so', () => {
    expect(isPlayable(defaultProfile(), 'sandbox')).toBe(false);
    expect(isPlayable({ ...defaultProfile(), unlocked: ['story', 'calm', 'sandbox'] }, 'sandbox')).toBe(false);
    const { mode, ...legacy } = makeState();
    void mode;
    expect(migrate({ ...legacy, mode: 'sandbox' } as SavedGame)?.mode).toBe('story');
  });
});

describe('old saves are story', () => {
  it('a save without mode', () => {
    const { mode, ...legacy } = makeState({ day: 9 });
    void mode;
    expect(migrate(legacy)?.mode).toBe('story');
  });

  it.each(Object.entries(FIXTURES))('old code %s', (_path, raw) => {
    expect(importSave(raw)?.mode).toBe('story');
  });

  it('story keeps the old localStorage key', () => {
    expect(SAVE_KEYS.story).toBe(SAVE_KEY);
    expect(SAVE_KEY).toBe('dark-counter-v3');
  });
});

describe('save slots', () => {
  it('every mode and the profile have their own key', () => {
    const keys = [...Object.values(SAVE_KEYS), PROFILE_KEY];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('story and calm are saved and read apart', () => {
    const store = memoryStore();
    makeState({ mode: 'story', day: 12, credits: 111 });
    saveGame(store);
    makeState({ mode: 'calm', day: 30, credits: 999 });
    saveGame(store);
    expect(readSlot('story', store)).toMatchObject({ mode: 'story', day: 12, credits: 111 });
    expect(readSlot('calm', store)).toMatchObject({ mode: 'calm', day: 30, credits: 999 });
    expect(loadGame('sandbox', store)).toBeNull();
  });

  it('nothing is written while persistence is off (first launch behind the mode screen)', () => {
    const store = memoryStore();
    persistence.enabled = false;
    newGame('story');
    saveGame(store);
    expect(store.data.size).toBe(0);
  });

  it('a calm code is imported as calm and then saved into the calm slot', () => {
    makeState({ mode: 'calm', day: 21, debt: 9000 });
    const code = exportSave();
    expect(code.startsWith(SAVE_CODE_PREFIX)).toBe(true);
    const store = memoryStore();
    makeState({ mode: 'story', day: 3 });
    saveGame(store);
    setState(importSave(code)!);
    saveGame(store);
    expect(readSlot('calm', store)).toMatchObject({ mode: 'calm', day: 21, debt: 9000 });
    expect(readSlot('story', store)).toMatchObject({ mode: 'story', day: 3 });
  });
});

describe('calm "Без таймера"', () => {
  it('has no shuttle: no ending on day 60, no reminders, no seat', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    makeState({ mode: 'calm', day: 52, nextDue: 99 });
    expect(sleep().some(event => event.includes('шаттл'))).toBe(false);
    state.day = 59;
    sleep();
    sleep();
    expect(state).toMatchObject({ day: 61, ending: null, over: null });
    state.debt = 0;
    state.credits = 99999;
    expect(canBuySeat(state)).toBe(false);
  });

  it('keeps the debt and the weekly payment', () => {
    makeState({ mode: 'calm', day: 7, nextDue: 7, rent: 400, owed: 400, credits: 400, debt: DEBT.start });
    state.cust = { kind: 'rent', name: 'Гробов', seed: LANDLORD_SEED, msg: '', pat: 0, max: 0, done: {} };
    payRent(state);
    expect(state.debt).toBe(DEBT.start - 400);
  });

  it('a closed debt is "Долг закрыт"; continuing goes on without payments', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    makeState({ mode: 'calm', day: 20, debt: 300, owed: 300, nextDue: 21, credits: 500 });
    expect(isDebtClosed(state)).toBe(false);
    payEarly(state, 500);
    expect(isDebtClosed(state)).toBe(true);
    for (let i = 0; i < 30; i++) {
      sleep();
      expect(isLandlordDue(state)).toBe(false);
    }
    expect(state).toMatchObject({ day: 50, ending: null, over: null, debt: 0 });
  });

  it('a closed debt in story is not "Долг закрыт" (the seat and the shuttle are ahead)', () => {
    makeState({ mode: 'story', debt: 0 });
    expect(isDebtClosed(state)).toBe(false);
  });
});

describe('player profile', () => {
  it('defaults: no endings, story and calm open, last = story', () => {
    expect(loadProfile(memoryStore())).toEqual({ endings: {}, unlocked: ['story', 'calm'], last: 'story', tapped: false });
  });

  it('records endings per mode once and survives a reload', () => {
    const store = memoryStore();
    const profile = loadProfile(store);
    expect(recordEnding(profile, 'story', 'left')).toBe(true);
    expect(recordEnding(profile, 'story', 'left')).toBe(false);
    expect(recordEnding(profile, 'calm', 'paid')).toBe(true);
    profile.last = 'calm';
    saveProfile(profile, store);
    expect(loadProfile(store)).toEqual({ endings: { story: ['left'], calm: ['paid'] }, unlocked: ['story', 'calm'], last: 'calm', tapped: false });
  });

  it('"Новая игра" does not touch it', () => {
    const store = memoryStore();
    const profile = loadProfile(store);
    recordEnding(profile, 'story', 'stayed');
    saveProfile(profile, store);
    newGame('story');
    saveGame(store);
    newGame('calm');
    saveGame(store);
    expect(loadProfile(store).endings).toEqual({ story: ['stayed'] });
  });

  it('a broken profile falls back to the defaults', () => {
    for (const raw of ['{oops', 'null', '42', '"x"', '[]']) {
      const store = memoryStore();
      store.setItem(PROFILE_KEY, raw);
      expect(loadProfile(store)).toEqual(defaultProfile());
    }
    const store = memoryStore();
    store.setItem(PROFILE_KEY, JSON.stringify({ endings: { story: ['left', 'nope', 7], moon: ['left'] }, unlocked: 'all', last: 'sandbox' }));
    expect(loadProfile(store)).toEqual({ endings: { story: ['left'] }, unlocked: ['story', 'calm'], last: 'story', tapped: false });
  });

  it('no storage at all: defaults, saving does not throw', () => {
    expect(loadProfile(null)).toEqual(defaultProfile());
    expect(() => saveProfile(defaultProfile(), null)).not.toThrow();
  });
});
