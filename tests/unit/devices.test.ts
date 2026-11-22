// Task 43 («Играбельная v1», п.5): check devices — level 1 spares the patience, level 2 sharpens the gut feeling.
import { describe, expect, it } from 'vitest';
import { deviceFor, DEVICES } from '../../src/data';
import { buyDevice, canBuyDevice, devicePrice, inspect } from '../../src/economy';
import { importSaveCode, migrate } from '../../src/state';
import type { GameState, ItemType, SavedGame } from '../../src/types';
import { logLines, makeItem, makeSeller, makeState } from './helpers';
import uiTs from '../../src/ui.ts?raw';
import realDay42 from '../fixtures/finale/day42-real-dc2.txt?raw';

/** A seller of `type` with every risk unknown, patience 5, the gut-feeling noise 0.1. */
function sellerOf(type: ItemType, dev: Partial<GameState['dev']> = {}): GameState {
  const game = makeState({ dev: { scan: 0, serial: 0, diag: 0, ...dev } });
  game.cust = makeSeller({ item: makeItem(type, { k: { cond: type !== 'arm', serial: false, flaw: false } }), noise: 0.1 });
  return game;
}

describe('which device makes a check', () => {
  it('the serial — the serial reader; the insides — the scanner (electronics) or the diagnostics (implant)', () => {
    expect(deviceFor('cutter', 'serial')).toBe('serial');
    expect(deviceFor('visor', 'flaw')).toBe('scan');
    expect(deviceFor('arm', 'flaw')).toBe('diag');
  });
});

describe('level 1: the check costs no patience', () => {
  it('without the device a check costs 1 patience', () => {
    const game = sellerOf('cutter');
    inspect(game, 'serial');
    expect(game.cust?.pat).toBe(4);
  });

  it('with the device at level 1 — none; another device does not help', () => {
    const game = sellerOf('visor', { serial: 1 });
    inspect(game, 'serial');
    expect(game.cust?.pat).toBe(5);
    inspect(game, 'flaw'); // the scanner is 0
    expect(game.cust?.pat).toBe(4);
    const implant = sellerOf('arm', { diag: 1 });
    inspect(implant, 'flaw');
    expect(implant.cust?.pat).toBe(5);
  });
});

describe('level 2: the gut feeling is sharper after the check', () => {
  it('the noise halves after a check with a level-2 device, once a customer', () => {
    const game = sellerOf('visor', { serial: 2, scan: 2 });
    inspect(game, 'serial');
    expect(game.cust?.kind === 'sell' && game.cust.noise).toBeCloseTo(0.1 * DEVICES.sharpNoise);
    inspect(game, 'flaw');
    expect(game.cust?.kind === 'sell' && game.cust.noise).toBeCloseTo(0.1 * DEVICES.sharpNoise);
  });

  it('a level-1 device does not sharpen; a level-2 one after a level-1 check does', () => {
    const game = sellerOf('visor', { serial: 1, scan: 2 });
    inspect(game, 'serial');
    expect(game.cust?.kind === 'sell' && game.cust.noise).toBe(0.1);
    inspect(game, 'flaw');
    expect(game.cust?.kind === 'sell' && game.cust.noise).toBeCloseTo(0.05);
    expect(game.cust?.pat).toBe(5); // level 2 keeps level 1
  });
});

describe('buying', () => {
  it('400 then 900, by day in the shop; the log says what was bought', () => {
    const game = makeState({ credits: 2000 });
    expect(devicePrice(game, 'scan')).toBe(DEVICES.prices[0]);
    expect(buyDevice(game, 'scan')).toBe(true);
    expect(game).toMatchObject({ credits: 1600, dev: { scan: 1 } });
    expect(logLines(game)[0]).toBe('Д3: Куплено: Сканер, ур. 1, за 400 кр.');
    expect(buyDevice(game, 'scan')).toBe(true);
    expect(game).toMatchObject({ credits: 700, dev: { scan: 2 } });
    expect(devicePrice(game, 'scan')).toBeNull();
    expect(buyDevice(game, 'scan')).toBe(false);
  });

  it('not in the evening, not without the money; the payment is not a bar (the confirmation warns)', () => {
    expect(canBuyDevice(makeState({ credits: 2000, phase: 'evening' }), 'serial')).toBe(false);
    expect(canBuyDevice(makeState({ credits: 399 }), 'serial')).toBe(false);
    expect(canBuyDevice(makeState({ credits: 450, owed: 550 }), 'serial')).toBe(true);
  });

  it('the screen: the «Устройства» section of the craft tab, the confirmation shows what is left for the payment', () => {
    expect(uiTs).toMatch(/devices-title[\s\S]*DEVICE_NAMES\.map\(deviceRow\)/);
    expect(uiTs).toMatch(/devices\.confirmText', \{ n: price, day: state\.nextDue, owed: state\.owed, left \}/);
    expect(uiTs).toMatch(/left < state\.owed \? `<p class="m-risk">/);
  });
});

describe('saves', () => {
  it('an older save has no devices; a save of this build keeps its own', () => {
    const old = structuredClone(makeState()) as Partial<GameState>;
    delete old.dev;
    expect(migrate(old as SavedGame)?.dev).toEqual({ scan: 0, serial: 0, diag: 0 });
    expect(migrate(structuredClone(makeState({ dev: { scan: 2, serial: 1, diag: 0 } })) as SavedGame)?.dev).toEqual({ scan: 2, serial: 1, diag: 0 });
  });

  it('the real day-42 save loads with no devices', async () => {
    const game = (await importSaveCode(realDay42.trim()))!;
    expect(game).toMatchObject({ day: 42, dev: { scan: 0, serial: 0, diag: 0 } });
  });
});
