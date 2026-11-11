// What the landlord takes when the player pays rent with goods.
// Collateral value = true value × 50% for stolen, × 60% for clean goods.
//   arm   (760, 100%, clean)  → 456
//   chip  (520, 100%, stolen) → 260
//   battery (90, 100%, stolen) → 45, clean → 54
import { describe, expect, it } from 'vitest';
import { collateralHeatRelief, planCollateral } from '../../src/economy';
import { makeItem, makeState } from './helpers';

describe('planCollateral (collateralPlan)', () => {
  it('takes only cash when it covers the debt', () => {
    makeState({ credits: 500, owed: 300, inv: [makeItem('arm')] });
    expect(planCollateral()).toEqual({ cash: 300, items: [], ok: true, over: 0, hot: 0 });
  });

  it('takes all cash first, then prefers stolen goods that cover the rest', () => {
    const arm = makeItem('arm');
    const chip = makeItem('chip', { stolen: true });
    const battery = makeItem('battery', { stolen: true });
    makeState({ credits: 100, owed: 300, inv: [arm, chip, battery] });
    const plan = planCollateral();
    expect(plan.cash).toBe(100);
    expect(plan.items).toEqual([chip]); // cheapest stolen item that covers 200
    expect(plan.ok).toBe(true);
    expect(plan.over).toBe(60); // 260 − 200, no change given
    expect(plan.hot).toBe(1);
  });

  it('when no stolen item covers the rest, takes the most valuable one and continues', () => {
    const arm = makeItem('arm');
    const battery = makeItem('battery', { stolen: true });
    makeState({ credits: 100, owed: 300, inv: [arm, battery] });
    const plan = planCollateral();
    expect(plan.items).toEqual([battery, arm]);
    expect(plan.ok).toBe(true);
    expect(plan.over).toBe(456 - 155);
    expect(plan.hot).toBe(1);
  });

  it('reports that even the whole stock is not enough', () => {
    makeState({ credits: 0, owed: 300, inv: [makeItem('battery')] });
    const plan = planCollateral();
    expect(plan.ok).toBe(false);
    expect(plan.items).toHaveLength(1);
    expect(plan.over).toBe(0);
  });

  it('does not take anything from an empty stock', () => {
    makeState({ credits: 10, owed: 300, inv: [] });
    expect(planCollateral()).toEqual({ cash: 10, items: [], ok: false, over: 0, hot: 0 });
  });

  it('stolen goods taken by the landlord lower the wanted level, but not below zero', () => {
    makeState({ credits: 0, owed: 300, heat: 1, inv: [makeItem('chip', { stolen: true }), makeItem('chip', { stolen: true })] });
    const plan = planCollateral();
    expect(plan.hot).toBe(2);
    expect(collateralHeatRelief(plan)).toBe(1);
  });
});
