// Pure economy (task 21): the rules get the game `state` and an `rng` as parameters,
// so one seed gives one and the same day. Math.random is made to throw here:
// if a rule still reached for it (or for the global state), these tests would fail.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../src/rng';
import type { Rng } from '../../src/rng';
import {
  callNextCustomer, closeShop, customerLeaves, dig, goHome, goToJunkyard, offerToSeller, sleepUntilMorning,
} from '../../src/economy';
import { createGame } from '../../src/state';
import type { GameState } from '../../src/types';
import { makeItem, makeSeller, makeState } from './helpers';

const sources = import.meta.glob<string>('../../src/*.ts', { query: '?raw', import: 'default', eager: true });
const source = (name: string): string => sources[`../../src/${name}.ts`];

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(() => {
    throw new Error('a rule called Math.random instead of its rng');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Plays one shop day of a fresh game: every visitor is offered half the asking price, then refused. */
function playShopDay(rng: Rng): GameState {
  const game = createGame('story', rng);
  while (callNextCustomer(game, rng)) {
    const customer = game.cust;
    if (customer?.kind === 'sell') {
      offerToSeller(game, Math.round(customer.ask / 2), rng);
    }
    customerLeaves(game);
  }
  closeShop(game);
  return game;
}

describe('mulberry32', () => {
  it('the same seed gives the same numbers in [0, 1); another seed gives others', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(first);
    expect(first.every(x => x >= 0 && x < 1)).toBe(true);
    const c = mulberry32(43);
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(first);
  });
});

describe('one seed → one and the same day', () => {
  it('customer flow: a new game and its whole shop day', () => {
    const one = playShopDay(mulberry32(7));
    const two = playShopDay(mulberry32(7));
    expect(two).toEqual(one);
    expect(one.slot).toBe(one.cn);
    expect(one.log.length).toBeGreaterThan(one.cn);
    expect(playShopDay(mulberry32(8)).log).not.toEqual(one.log);
  });

  it('haggling: the same offers get the same answers', () => {
    const haggle = (seed: number): GameState => {
      const rng = mulberry32(seed);
      const game = makeState({ credits: 1000, cust: makeSeller({ item: makeItem('battery', { uid: 1 }), ask: 300, min: 150, pat: 6, max: 6 }) });
      for (const price of [160, 180, 200, 220, 240]) {
        offerToSeller(game, price, rng);
      }
      return game;
    };
    expect(haggle(3)).toEqual(haggle(3));
  });

  it('a junkyard visit (v3): the same digs, finds and parts for the same seed', () => {
    const visit = (seed: number): { state: GameState; kinds: string[] } => {
      const rng = mulberry32(seed);
      const game = makeState({ phase: 'evening', hours: 5 });
      goToJunkyard(game, rng);
      const kinds: string[] = [];
      for (let result = dig(game, rng); result; result = dig(game, rng)) {
        kinds.push(result.kind);
      }
      goHome(game);
      return { state: game, kinds };
    };
    expect(visit(4).kinds).toHaveLength(6);
    expect(visit(4)).toEqual(visit(4));
  });

  it('the night: infection, the raid and the morning are the same', () => {
    const night = (seed: number): { state: GameState; events: unknown[] } => {
      const game = makeState({
        phase: 'evening', heat: 9, day: 4, nextDue: 7,
        // fixed uids: makeItem() numbers items from a shared counter
        inv: [makeItem('chip', { uid: 1, infected: true }), makeItem('comm', { uid: 2 }), makeItem('visor', { uid: 3 }), makeItem('battery', { uid: 4, stolen: true })],
      });
      const { events } = sleepUntilMorning(game, mulberry32(seed));
      return { state: game, events };
    };
    const one = night(11);
    expect(night(11)).toEqual(one);
    expect(one.state.day).toBe(5);
  });
});

describe('the rules do not reach for globals', () => {
  it('economy, actionbar and day never call Math.random or performance.now', () => {
    for (const name of ['economy', 'actionbar', 'day', 'state']) {
      expect(source(name), name).not.toMatch(/Math\.random|performance\.now/);
    }
  });

  it('economy and actionbar do not import the live state, the screen or the scene figure', () => {
    for (const name of ['economy', 'actionbar']) {
      const fromState = source(name).match(/import \{([^}]*)\} from '\.\/state'/)?.[1] ?? '';
      expect(fromState, name).not.toMatch(/\b(state|ui|actor|actorEnter)\b/);
    }
  });
});
