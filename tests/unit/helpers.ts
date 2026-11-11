// Builders for test data. Defaults describe a plain mid-game state.
import { setState } from '../../src/state';
import type { GameState, Item, ItemType, PresentedBuyer, SellerCustomer } from '../../src/types';

let nextUid = 1000;

export function makeItem(type: ItemType, overrides: Partial<Item> = {}): Item {
  return {
    uid: nextUid++,
    t: type,
    cond: 100,
    stolen: false,
    defect: false,
    infected: false,
    k: { cond: true, serial: true, flaw: true },
    ...overrides,
  };
}

export function makeState(overrides: Partial<GameState> = {}): GameState {
  const state: GameState = {
    day: 3,
    slot: 0,
    credits: 400,
    parts: 4,
    heat: 0,
    rent: 300,
    uid: 0,
    inv: [],
    log: [],
    cust: null,
    over: null,
    won: false,
    phase: 'shop',
    hours: 0,
    where: 'home',
    junk: null,
    jmsg: '',
    market: false,
    nextDue: 3,
    owed: 300,
    deferred: false,
    llAt: 2,
    llDone: false,
    ...overrides,
  };
  setState(state);
  return state;
}

export function makeSeller(overrides: Partial<SellerCustomer> = {}): SellerCustomer {
  return {
    name: 'Тест', seed: 1, pat: 5, done: {}, noise: 0, max: 5,
    kind: 'sell', item: makeItem('battery'), ask: 200, min: 100, msg: '',
    ...overrides,
  };
}

export function makePresentedBuyer(overrides: Partial<PresentedBuyer> = {}): PresentedBuyer {
  return {
    name: 'Тест', seed: 1, pat: 5, done: {}, noise: 0, max: 5,
    kind: 'buy', want: 'battery', mult: 1.2, item: makeItem('battery'), msg: '', max2: 100, offer: 65,
    ...overrides,
  };
}
