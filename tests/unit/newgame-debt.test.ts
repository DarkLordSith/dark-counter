// Task 25: every new game starts with DEBT.start; DEBT.legacyStart is only for saves made
// before the debt update (no `debt` field). The bug seen on 17.11 (a new game with 25 000)
// came from an old build still running in the PWA, see registerSW in main.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { DEBT, PLAYABLE_MODES } from '../../src/data';
import { mulberry32 } from '../../src/rng';
import {
  actorReset, createGame, exportSave, exportSaveCode, importSave, importSaveCode, newGame, persistence, readSlot, saveGame,
  setState, state,
} from '../../src/state';
import type { KeyValueStore, SavedGame } from '../../src/types';
import { makeState } from './helpers';

import mainSource from '../../src/main.ts?raw';
import viteConfig from '../../vite.config.ts?raw';

const FIXTURES = import.meta.glob<string>('../fixtures/*.txt', { query: '?raw', import: 'default', eager: true });

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

/** The raw JSON of a DC1 code, before migrate(). */
function rawSave(code: string): SavedGame {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.trim().slice(4)), char => char.charCodeAt(0)))) as SavedGame;
}

afterEach(() => {
  actorReset();
  persistence.enabled = true;
});

describe('a new game starts with DEBT.start', () => {
  it('the numbers: 20 000 now, 25 000 for saves before the debt update', () => {
    expect(DEBT.start).toBe(20000);
    expect(DEBT.legacyStart).toBe(25000);
  });

  it.each(PLAYABLE_MODES)('createGame(%s): debt and the first log line', mode => {
    const game = createGame(mode, mulberry32(7));
    expect(game.debt).toBe(DEBT.start);
    expect(game.log.at(-1)).toContain(String(DEBT.start));
    expect(game.log.join()).not.toContain(String(DEBT.legacyStart));
  });

  // ui.ts: first launch (the provisional story game, then "Начать" in any mode), "Начать" in an
  // empty slot, "Начать заново", ☰ "Новая игра" and "Новая игра" after an ending — all call newGame(mode).
  it.each(PLAYABLE_MODES)('newGame(%s) → save → reload: still DEBT.start', mode => {
    const store = memoryStore();
    newGame(mode);
    expect(state.debt).toBe(DEBT.start);
    saveGame(store);
    expect(readSlot(mode, store)?.debt).toBe(DEBT.start);
  });

  it('first launch: the provisional game behind the mode screen becomes the real one', () => {
    const store = memoryStore();
    persistence.enabled = false;
    newGame('story');
    saveGame(store);
    expect(readSlot('story', store)).toBeNull();
    persistence.enabled = true;
    saveGame(store);
    expect(readSlot('story', store)?.debt).toBe(DEBT.start);
  });

  it('restart over a running game in the other slot keeps that game and starts fresh', () => {
    const store = memoryStore();
    makeState({ mode: 'calm', day: 30, debt: 9000 });
    saveGame(store);
    newGame('calm');
    saveGame(store);
    expect(readSlot('calm', store)).toMatchObject({ day: 1, debt: DEBT.start });
  });

  it('a new game survives save codes DC1 and DC2', async () => {
    newGame('story');
    expect(importSave(exportSave())?.debt).toBe(DEBT.start);
    expect((await importSaveCode(await exportSaveCode(state, true)))?.debt).toBe(DEBT.start);
    expect((await importSaveCode(await exportSaveCode(state, false)))?.debt).toBe(DEBT.start);
  });
});

describe('old saves keep their debt', () => {
  it('a save before the debt update (no debt field) gets legacyStart', () => {
    const { debt, ...legacy } = makeState({ day: 9 });
    void debt;
    expect(importSave(`DC1:${btoa(JSON.stringify(legacy))}`)?.debt).toBe(DEBT.legacyStart);
  });

  it('a save made on the old balance keeps 25 000 (its own debt, not rewritten)', () => {
    setState(makeState({ day: 1, debt: DEBT.legacyStart }));
    expect(importSave(exportSave())?.debt).toBe(DEBT.legacyStart);
  });

  it.each(Object.entries(FIXTURES))('fixture %s: legacyStart without a debt field, its own debt with one', (_path, raw) => {
    const before = rawSave(raw);
    expect(importSave(raw)?.debt).toBe(before.debt ?? DEBT.legacyStart);
  });
});

describe('an open page moves onto a new build', () => {
  it('a new worker takes over at once, registerSW reloads the page onto it', () => {
    expect(mainSource).toContain("from 'virtual:pwa-register'");
    expect(mainSource).toMatch(/registerSW\(\{\s*immediate: true/);
    expect(mainSource).toContain('registration.update()');
    expect(viteConfig).toContain("registerType: 'autoUpdate'");
    expect(viteConfig).toContain('injectRegister: false');
    expect(viteConfig).toContain('skipWaiting: true');
    expect(viteConfig).toContain('clientsClaim: true');
  });
});
