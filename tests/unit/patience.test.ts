// V2.5: the customer's patience is a bar over their head on the scene, not pips in the deal panel.
import { describe, expect, it } from 'vitest';
import { CUSTOMER, SHOP_SIGN } from '../../src/data';
import { COLOR, MEANING } from '../../src/palette';
import { PATIENCE_BAR, patienceBarRects, patienceBlinkLit, patienceFill, patienceLow } from '../../src/patiencebar';
import { COUNTER_X } from '../../src/state';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';

const LIT = 0; // patienceBlinkLit(0) — the "on" quarter second
const DARK = PATIENCE_BAR.blinkPeriodMs / 2;

describe('patience bar length', () => {
  it('is full at full patience and shrinks step by step', () => {
    for (let max = CUSTOMER.patienceMin; max <= CUSTOMER.patienceMax; max++) {
      expect(patienceFill(max, max)).toBe(PATIENCE_BAR.width);
      let previous: number = PATIENCE_BAR.width;
      for (let pat = max - 1; pat >= 1; pat--) {
        const fill = patienceFill(pat, max);
        expect(fill).toBeLessThan(previous);
        expect(fill).toBeGreaterThanOrEqual(1);
        previous = fill;
      }
      expect(patienceFill(0, max)).toBe(0);
    }
  });

  it('is proportional: half the patience — half the bar', () => {
    expect(patienceFill(3, 6)).toBe(6);
    expect(patienceFill(2, 4)).toBe(6);
    expect(patienceFill(1, 6)).toBe(2);
  });
});

describe('low patience', () => {
  it('starts on the last ~25% or the last point', () => {
    expect(patienceLow(1, 4)).toBe(true);
    expect(patienceLow(2, 4)).toBe(false);
    expect(patienceLow(1, 6)).toBe(true);
    expect(patienceLow(2, 6)).toBe(false);
    expect(patienceLow(2, 8)).toBe(true);
    expect(patienceLow(3, 8)).toBe(false);
    expect(patienceLow(0, 6)).toBe(false);
  });

  it('blinks twice a second', () => {
    expect(patienceBlinkLit(LIT)).toBe(true);
    expect(patienceBlinkLit(DARK)).toBe(false);
    expect(patienceBlinkLit(PATIENCE_BAR.blinkPeriodMs)).toBe(true);
  });

  it('the fill disappears in the dark half of a blink, stays when not low', () => {
    const wearCells = (pat: number, max: number, now: number, reduced: boolean): number =>
      patienceBarRects(pat, max, COUNTER_X, now, reduced).filter(rect => rect[4] === MEANING.wear).length;
    expect(wearCells(1, 6, LIT, false)).toBe(1);
    expect(wearCells(1, 6, DARK, false)).toBe(0);
    expect(wearCells(4, 6, DARK, false)).toBe(1);
  });

  it('with reduced motion: no blinking, a wear frame instead', () => {
    const dark = patienceBarRects(1, 6, COUNTER_X, DARK, true);
    expect(dark[0][4]).toBe(MEANING.wear);
    expect(dark.at(-1)?.[4]).toBe(MEANING.wear);
    expect(patienceBarRects(4, 6, COUNTER_X, DARK, true)[0][4]).toBe(COLOR.ink);
  });
});

describe('patience bar on the scene', () => {
  it('Grobov (no patience) has no bar', () => {
    expect(patienceBarRects(0, 0, COUNTER_X, LIT, false)).toEqual([]);
  });

  it('is centered over the head, about a head wide', () => {
    const [frame] = patienceBarRects(6, 6, COUNTER_X, LIT, false);
    expect(frame[0] + frame[2] / 2).toBe(COUNTER_X);
    expect(PATIENCE_BAR.width).toBeGreaterThanOrEqual(10);
    expect(PATIENCE_BAR.width).toBeLessThanOrEqual(14);
    expect(PATIENCE_BAR.height).toBeGreaterThanOrEqual(1);
    expect(PATIENCE_BAR.height).toBeLessThanOrEqual(2);
  });

  it('keeps clear of the "ЛАВКА 7Б" sign and of the speech bubble', () => {
    const rule = styleCss.match(/\.bubble \{([^}]*)\}/)?.[1] ?? '';
    const percent = (name: string): number => Number(rule.match(new RegExp(`\\n\\s*${name}: ([\\d.]+)%`))?.[1]);
    const bubbleRight = (percent('left') + percent('max-width')) / 100 * 160;
    for (const [x, y, w, h] of patienceBarRects(6, 6, COUNTER_X, LIT, false)) {
      expect(y, 'below the sign').toBeGreaterThanOrEqual(SHOP_SIGN.y + SHOP_SIGN.h);
      expect(x, 'right of the bubble box').toBeGreaterThanOrEqual(bubbleRight);
      expect(x + w).toBeLessThanOrEqual(160);
      expect(y + h).toBeLessThanOrEqual(100);
    }
  });

  it('the deal panel has no patience pips any more', () => {
    expect(uiTs).not.toContain('Терпение');
    expect(styleCss).not.toContain('.pips');
  });
});
