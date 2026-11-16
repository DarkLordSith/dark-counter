// Save code DC2 (Patch A, task 22): deflate-raw compressed, the log trimmed to the last lines;
// DC1 codes still load, DC1 is what a browser without CompressionStream exports.
import { describe, expect, it } from 'vitest';
import { LOG_LIMIT, SAVE_CODE_PREFIX, SAVE_CODE_PREFIX_V2, SAVE_LOG_LINES } from '../../src/data';
import { canCompress, exportSave, exportSaveCode, importSave, importSaveCode, newGame, saveGame, saveSnapshot, state } from '../../src/state';
import type { KeyValueStore } from '../../src/types';
import uiTs from '../../src/ui.ts?raw';
import day25 from '../fixtures/v6-day25.txt?raw';
import { makeState } from './helpers';

const withLog = (lines: number) => makeState({ log: Array.from({ length: lines }, (_, i) => `Д3: строка ${i}`) });

describe('the save keeps the last log lines only', () => {
  it('saveSnapshot cuts the log to SAVE_LOG_LINES, newest first, and leaves the open game as it is', () => {
    const game = withLog(LOG_LIMIT);
    const saved = saveSnapshot(game);
    expect(saved.log).toEqual(game.log.slice(0, SAVE_LOG_LINES));
    expect(game.log).toHaveLength(LOG_LIMIT);
    expect(Object.keys(saved)).toEqual(Object.keys(game));
  });

  it('localStorage and both codes carry the trimmed log', async () => {
    withLog(30);
    const store: KeyValueStore & { data: Record<string, string> } = {
      data: {}, getItem(key) { return this.data[key] ?? null; }, setItem(key, value) { this.data[key] = value; },
    };
    saveGame(store);
    expect(JSON.parse(Object.values(store.data)[0]).log).toHaveLength(SAVE_LOG_LINES);
    expect(importSave(exportSave())!.log).toHaveLength(SAVE_LOG_LINES);
    expect((await importSaveCode(await exportSaveCode(state)))!.log).toHaveLength(SAVE_LOG_LINES);
  });
});

describe('DC2', () => {
  it('Node and current browsers can compress', () => {
    expect(canCompress()).toBe(true);
  });

  it('goes there and back, Russian text included', async () => {
    newGame('calm');
    state.log.unshift('Д1: Гробов: «Платёж. 400 кр.» — ёлки, кириллица и “кавычки”');
    const code = await exportSaveCode(state);
    expect(code.startsWith(SAVE_CODE_PREFIX_V2)).toBe(true);
    expect(await importSaveCode(code)).toEqual(saveSnapshot(state));
  });

  it('is several times shorter than DC1 on the day-25 fixture', async () => {
    const game = importSave(day25)!;
    const dc2 = await exportSaveCode(game);
    expect(dc2.length * 4).toBeLessThan(day25.trim().length);
    expect(exportSave(game).length).toBeGreaterThan(dc2.length);
  });

  it('without CompressionStream the code is DC1, and it loads', async () => {
    const game = makeState({ credits: 777 });
    const code = await exportSaveCode(game, false);
    expect(code.startsWith(SAVE_CODE_PREFIX)).toBe(true);
    expect((await importSaveCode(code))?.credits).toBe(777);
  });

  it('rejects broken codes instead of throwing', async () => {
    const code = await exportSaveCode(makeState());
    expect(await importSaveCode(code.slice(0, 40))).toBeNull();
    expect(await importSaveCode('DC2:не-base64')).toBeNull();
    expect(await importSaveCode(SAVE_CODE_PREFIX_V2 + btoa('просто текст'.length.toString()))).toBeNull();
    expect(await importSaveCode('')).toBeNull();
  });

  it('the save window downloads and loads files, and shows DC2', () => {
    expect(uiTs).toContain('data-a="savefile"');
    expect(uiTs).toContain('data-a="loadfile"');
    expect(uiTs).toContain('id="loadfilepick"');
    expect(uiTs).toMatch(/exportSaveCode\(game\)\.then/);
    expect(uiTs).toContain('await importSaveCode(');
  });
});
