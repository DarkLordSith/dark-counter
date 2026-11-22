// Task 41 («Играбельная v1», п.3, А2 of 19.11): checks at the counter by category, "check where the risk is".
import { describe, expect, it } from 'vitest';
import { CATEGORY_CHECKS, checksFor, INSPECT, ITEM_CATEGORIES, itemCategory, ITEM_TYPES } from '../../src/data';
import { callNextCustomer, dig, goToJunkyard, goHome, inspect, sellerChecks } from '../../src/economy';
import { mulberry32 } from '../../src/rng';
import { createItem, importSaveCode, migrate } from '../../src/state';
import type { GameState, Item, ItemType, SavedGame } from '../../src/types';
import { makeItem, makeSeller, makeState, shown } from './helpers';
import realDay42 from '../fixtures/finale/day42-real-dc2.txt?raw';

const types = Object.keys(ITEM_TYPES) as ItemType[];
const ofCategory = (cat: string): ItemType[] => types.filter(type => itemCategory(type) === cat);
/** An rng that always rolls 0: every random risk would come true. */
const always = (): number => 0;
const counter = (game: GameState): GameState['cust'] => game.cust;
/** A seller of a fresh item of `type` (rolled with `rng`) at the counter. */
function sellerWith(type: ItemType, rng = always): GameState {
  const game = makeState();
  game.cust = makeSeller({ item: createItem(game, type, {}, rng), ask: 300, min: 150 });
  return game;
}

describe('the rule of the brief', () => {
  it('the table: electronics — scanner and serial, weapon and collectible — serial, implant — diagnostics, chem and household — none', () => {
    expect(CATEGORY_CHECKS).toEqual({
      electronics: ['flaw', 'serial'],
      weapon: ['serial'],
      implant: ['flaw'],
      collectible: ['serial'],
      chem: [],
      household: [],
    });
    for (const cat of ITEM_CATEGORIES) {
      expect(CATEGORY_CHECKS[cat].length, cat).toBeLessThanOrEqual(2);
    }
  });

  it('the condition is seen at once on everything but an implant', () => {
    for (const type of types) {
      expect(createItem(makeState(), type, {}, always).k.cond, type).toBe(itemCategory(type) !== 'implant');
    }
  });
});

describe('no risk without a chance to check', () => {
  it('chem and household: never stolen, defective or infected, nothing unknown', () => {
    for (const type of [...ofCategory('chem'), ...ofCategory('household')]) {
      const item = createItem(makeState(), type, {}, always);
      expect(item, type).toMatchObject({ stolen: false, defect: false, infected: false, k: { cond: true, serial: true, flaw: true } });
    }
  });

  it('weapon and collectible: only stolen (the serial), no defect, no AI', () => {
    for (const type of [...ofCategory('weapon'), ...ofCategory('collectible')]) {
      const item = createItem(makeState(), type, {}, always);
      expect(item, type).toMatchObject({ stolen: true, defect: false, infected: false, k: { serial: false, flaw: true } });
    }
  });

  it('implant: a defect and AI, never stolen; electronics: all three', () => {
    for (const type of ofCategory('implant')) {
      expect(createItem(makeState(), type, {}, always), type).toMatchObject({ stolen: false, defect: true, k: { cond: false, serial: true, flaw: false } });
    }
    expect(createItem(makeState(), 'visor', {}, always)).toMatchObject({ stolen: true, defect: true, infected: true });
  });

  it('the sellers of a day: every hidden risk has its check', () => {
    const rng = mulberry32(41);
    const game = makeState({ inv: [] });
    let sellers = 0;
    for (let i = 0; i < 400; i++) {
      game.cust = null;
      game.slot = 0;
      game.cn = 6;
      callNextCustomer(game, rng);
      const seller = counter(game); // a call: TS keeps the type it narrowed to null above
      if (seller?.kind !== 'sell') {
        continue;
      }
      sellers++;
      const item = seller.item;
      const checks = sellerChecks(seller);
      if (item.stolen) {
        expect(checks, item.t).toContain('serial');
      }
      if (item.defect || item.infected) {
        expect(checks, item.t).toContain('flaw');
      }
    }
    expect(sellers).toBeGreaterThan(300);
  });

  it('junkyard finds: no filed serial without the check, a defect without the scanner is seen at once', () => {
    const rng = mulberry32(7);
    const finds: Item[] = [];
    for (let night = 0; night < 40; night++) {
      const game = makeState({ phase: 'evening', hours: 5, inv: [] });
      goToJunkyard(game, rng);
      while (game.junk && game.junk.d > 0) {
        dig(game, rng);
      }
      finds.push(...game.inv);
      goHome(game);
    }
    expect(finds.length).toBeGreaterThan(50);
    for (const item of finds) {
      if (!checksFor(item.t).includes('serial')) {
        expect(item.stolen, item.t).toBe(false);
      }
      if (!checksFor(item.t).includes('flaw')) {
        expect(item.k.flaw, item.t).toBe(true);
      }
    }
    expect(finds.some(item => item.defect && item.k.flaw && itemCategory(item.t) === 'household')).toBe(true);
  });
});

describe('inspection at the counter', () => {
  it('only the checks of the category; the condition is no check of its own', () => {
    const ration = sellerWith('ration');
    expect(sellerChecks(ration.cust as never)).toEqual([]);
    expect(inspect(ration, 'serial')).toBe(false);
    expect(inspect(ration, 'flaw')).toBe(false);
    expect(ration.cust?.pat).toBe(5); // no patience spent

    const cutter = sellerWith('cutter');
    expect(inspect(cutter, 'cond')).toBe(false);
    expect(inspect(cutter, 'flaw')).toBe(false);
    expect(inspect(cutter, 'serial')).toBe(true);
    expect(cutter.cust?.pat).toBe(4);
    expect(shown(cutter.cust?.msg)).toBe('…Серийник? Его и не было. Ладно, скину цену.');
  });

  it('electronics: the AI scanner finds the virus, then a defect', () => {
    const visor = sellerWith('visor');
    expect(sellerChecks(visor.cust as never)).toEqual(['flaw', 'serial']);
    expect(inspect(visor, 'flaw')).toBe(true);
    expect(shown(visor.cust?.msg)).toBe('Какой ещё ИИ? Я не знал! Забирай дешевле.');
    const comm = sellerWith('comm'); // comm is not aiCapable: a defect
    inspect(comm, 'flaw');
    expect(shown(comm.cust?.msg)).toBe('Ну да, контакт отходит. Учту в цене.');
  });

  it('implant: the diagnostics shows the condition with the defect (the rejection) and lowers the price', () => {
    const game = makeState();
    const item = createItem(game, 'arm', { infected: false, defect: true }, always);
    game.cust = makeSeller({ item, ask: 400, min: 200 });
    expect(item.k.cond).toBe(false);
    expect(inspect(game, 'flaw')).toBe(true);
    expect(item.k).toMatchObject({ cond: true, flaw: true });
    expect(shown(game.cust.msg)).toBe('Отторжение? Бывает, приживётся. Скину.');
    expect(game.cust.kind === 'sell' && game.cust.ask).toBe(400 * INSPECT.defectAskMult);

    const clean = sellerWith('chip', () => 0.99); // no defect, no AI: the condition line
    inspect(clean, 'flaw');
    expect(shown(clean.cust?.msg)).toMatch(/^Состояние \d+%\./);
  });
});

describe('saves', () => {
  it('an older seller of household goods at the counter: its unknowns open, a known risk stays', () => {
    const game = makeState();
    const ration = makeItem('ration', { stolen: true, k: { cond: false, serial: false, flaw: false } });
    const arm = makeItem('arm', { k: { cond: false, serial: false, flaw: false } });
    game.inv.push(arm);
    game.cust = makeSeller({ item: ration });
    const migrated = migrate(structuredClone(game) as SavedGame)!;
    // a risk without a check is shown, not hidden: the stolen ration is seen as stolen
    expect(migrated.cust?.kind === 'sell' && migrated.cust.item).toMatchObject({ stolen: true, k: { cond: true, serial: true, flaw: true } });
    // an implant keeps its hidden condition and insides; its serial is nothing to check any more
    expect(migrated.inv.find(item => item.t === 'arm')?.k).toEqual({ cond: false, serial: true, flaw: false });
  });

  it('the real day-42 save loads; nothing is left unknown that no check could open', async () => {
    const game = (await importSaveCode(realDay42.trim()))!;
    expect(game.day).toBe(42);
    for (const item of game.inv) {
      const checks = checksFor(item.t);
      expect(item.k.serial || checks.includes('serial'), item.t).toBe(true);
      expect(item.k.flaw || checks.includes('flaw'), item.t).toBe(true);
    }
  });
});
