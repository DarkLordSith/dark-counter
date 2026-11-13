// Acceptance curves of haggling (formerly pSell / pBuy), the gut feeling and its verdict word.
import { describe, expect, it } from 'vitest';
import { HUNCH_VERDICT, HUNCH_VERDICT_TEXT } from '../../src/data';
import { buyerAcceptChance, hunchVerdict, perceivedChance, sellerAcceptChance } from '../../src/economy';
import { makePresentedBuyer, makeSeller } from './helpers';

describe('sellerAcceptChance (pSell)', () => {
  // ask 200, hidden min 100 → insult floor at 70
  const seller = makeSeller({ ask: 200, min: 100 });

  it('accepts for sure at or above the asking price', () => {
    expect(sellerAcceptChance(seller, 200)).toBe(1);
    expect(sellerAcceptChance(seller, 999)).toBe(1);
  });

  it('never accepts at or below 70% of the hidden limit', () => {
    expect(sellerAcceptChance(seller, 70)).toBe(0);
    expect(sellerAcceptChance(seller, 0)).toBe(0);
  });

  it('is 50% exactly at the hidden limit', () => {
    expect(sellerAcceptChance(seller, 100)).toBe(0.5);
  });

  it('grows linearly between the floor and the limit', () => {
    expect(sellerAcceptChance(seller, 85)).toBeCloseTo(0.25);
  });

  it('stays at most 97% just below the asking price', () => {
    const chance = sellerAcceptChance(seller, 199);
    expect(chance).toBeGreaterThan(0.9);
    expect(chance).toBeLessThanOrEqual(0.97);
  });

  it('never decreases when the player offers more', () => {
    let previous = -1;
    for (let price = 0; price <= 250; price += 5) {
      const chance = sellerAcceptChance(seller, price);
      expect(chance).toBeGreaterThanOrEqual(previous);
      previous = chance;
    }
  });
});

describe('buyerAcceptChance (pBuy)', () => {
  // offer 65, hidden max 100 → ceiling at 135
  const buyer = makePresentedBuyer({ offer: 65, max2: 100 });

  it('accepts for sure at or below their own offer', () => {
    expect(buyerAcceptChance(buyer, 65)).toBe(1);
    expect(buyerAcceptChance(buyer, 10)).toBe(1);
  });

  it('is 50% exactly at the hidden limit', () => {
    expect(buyerAcceptChance(buyer, 100)).toBe(0.5);
  });

  it('never accepts at or above 135% of the hidden limit', () => {
    expect(buyerAcceptChance(buyer, 135)).toBe(0);
    expect(buyerAcceptChance(buyer, 500)).toBe(0);
  });

  it('falls linearly between the limit and the ceiling', () => {
    expect(buyerAcceptChance(buyer, 117.5)).toBeCloseTo(0.25);
  });

  it('caps at 97% just above the offer', () => {
    expect(buyerAcceptChance(buyer, 66)).toBeLessThanOrEqual(0.97);
  });

  it('never increases when the player asks more', () => {
    let previous = 2;
    for (let price = 0; price <= 200; price += 5) {
      const chance = buyerAcceptChance(buyer, price);
      expect(chance).toBeLessThanOrEqual(previous);
      previous = chance;
    }
  });
});

describe('perceivedChance (gut feeling)', () => {
  it('shows sure outcomes as they are', () => {
    const seller = makeSeller({ noise: 0.1 });
    expect(perceivedChance(seller, 1000)).toBe(1);
    expect(perceivedChance(seller, 0)).toBe(0);
  });

  it('rounds to 5% steps and adds the customer noise', () => {
    const seller = makeSeller({ ask: 200, min: 100, noise: 0 });
    expect(perceivedChance(seller, 85)).toBe(0.25);
    expect(perceivedChance({ ...seller, noise: 0.1 }, 85)).toBe(0.35);
  });

  it('never shows certainty for an uncertain deal', () => {
    const seller = makeSeller({ ask: 200, min: 100, noise: 0.12 });
    expect(perceivedChance(seller, 199)).toBe(0.95);
    expect(perceivedChance({ ...seller, noise: -0.12 }, 71)).toBe(0.05);
  });

  it('works for buyers too', () => {
    expect(perceivedChance(makePresentedBuyer({ offer: 65, max2: 100 }), 100)).toBe(0.5);
  });
});

describe('hunchVerdict (gut-feeling word)', () => {
  it('maps the chance to one word at the agreed thresholds', () => {
    expect(hunchVerdict(0)).toBe('unlikely');
    expect(hunchVerdict(0.24)).toBe('unlikely');
    expect(hunchVerdict(0.25)).toBe('maybe');
    expect(hunchVerdict(0.54)).toBe('maybe');
    expect(hunchVerdict(0.55)).toBe('likely');
    expect(hunchVerdict(0.84)).toBe('likely');
    expect(hunchVerdict(0.85)).toBe('deal');
    expect(hunchVerdict(1)).toBe('deal');
  });

  it('thresholds live in data.ts and go up', () => {
    expect(HUNCH_VERDICT).toEqual({ maybe: 0.25, likely: 0.55, deal: 0.85 });
  });

  it('has a word for every verdict in Russian and English', () => {
    expect(HUNCH_VERDICT_TEXT.ru).toEqual({ unlikely: 'вряд ли', maybe: 'может быть', likely: 'скорее да', deal: 'по рукам' });
    expect(HUNCH_VERDICT_TEXT.en).toEqual({ unlikely: 'unlikely', maybe: 'maybe', likely: 'likely', deal: 'deal' });
  });

  it('works on what the player sees (perceivedChance)', () => {
    const seller = makeSeller({ ask: 200, min: 100, noise: 0 });
    expect(hunchVerdict(perceivedChance(seller, 75))).toBe('unlikely');
    expect(hunchVerdict(perceivedChance(seller, 100))).toBe('maybe');
    expect(hunchVerdict(perceivedChance(seller, 200))).toBe('deal');
  });
});
