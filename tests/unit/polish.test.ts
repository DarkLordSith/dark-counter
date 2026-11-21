// V1.6 "Мелочи": the dark speech bubble and the queue chip keep clear of the "ЛАВКА 7Б" sign,
// the deal fits an iPhone SE without scrolling, the "~" sits mid-line, no sticky hover on touch.
import { afterEach, describe, expect, it } from 'vitest';
import { chipLines } from '../../src/actionbar';
import { CUSTOMERS_PER_DAY, LANDLORD_SEED, SHOP_SIGN } from '../../src/data';
import { actorReset, state } from '../../src/state';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import { makeSeller, makeState } from './helpers';

const css = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
const RULES: [string, string][] = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => [m[1].trim().replace(/\s+/g, ' '), m[2]]);
const rule = (selector: string): string => {
  const found = RULES.filter(([sel]) => sel === selector);
  expect(found, `rule "${selector}" in style.css`).toHaveLength(1);
  return found[0][1];
};
const prop = (body: string, name: string): string => body.match(new RegExp(`(?:^|;|\\s)${name}:\\s*([^;]+);`))?.[1].trim() ?? '';
const percent = (value: string): number => parseFloat(value) / 100;
const rootPx = (name: string): number => parseFloat(RULES.filter(([sel]) => sel === ':root').map(([, body]) => body).join('\n')
  .match(new RegExp(`${name}:\\s*([^;]+);`))?.[1] ?? 'NaN');

/** Scene size in pixels: 160×100 logical, on a phone the full screen width. */
const SCENE = { w: 160, h: 100 };

afterEach(() => actorReset());

describe('speech bubble', () => {
  it('is dark with a 1px turquoise frame and light text', () => {
    const bubble = rule('.bubble');
    expect(prop(bubble, 'background')).toBe('var(--panel)');
    expect(prop(bubble, 'border')).toBe('1px solid var(--m-action)');
    expect(prop(bubble, 'color')).toBe('var(--fg)');
  });

  it('does not cross the "ЛАВКА 7Б" sign (scene coordinates)', () => {
    const bubble = rule('.bubble');
    const top = percent(prop(bubble, 'top')) * SCENE.h;
    const left = percent(prop(bubble, 'left')) * SCENE.w;
    const right = left + percent(prop(bubble, 'max-width')) * SCENE.w;
    const signBottom = SHOP_SIGN.y + SHOP_SIGN.h;
    const below = top >= signBottom;
    const leftOfIt = right <= SHOP_SIGN.x;
    expect(below || leftOfIt, `bubble x ${left}–${right}, top ${top}; sign x ${SHOP_SIGN.x}–${SHOP_SIGN.x + SHOP_SIGN.w}, y ${SHOP_SIGN.y}–${signBottom}`).toBe(true);
    // clear of the wanted-level plate on the left wall (x 0–5)
    expect(left).toBeGreaterThanOrEqual(6);
  });

  it('wraps long lines instead of running over (no nowrap) and keeps the tail', () => {
    expect(rule('.bubble')).not.toContain('nowrap');
    expect(rule('.bubble::before')).toContain('border-left: 8px solid var(--m-action)');
    expect(rule('.bubble::after')).toContain('border-left: 8px solid var(--panel)');
  });
});

describe('queue chip', () => {
  function allChips(): string[][] {
    const chips: string[][] = [];
    makeState({ slot: 0, day: 3, nextDue: 7 });
    chips.push(chipLines(state)); // ОЧЕРЕДЬ: 6
    state.slot = CUSTOMERS_PER_DAY;
    chips.push(chipLines(state)); // СМЕНА ОКОНЧЕНА
    state.day = 7;
    state.nextDue = 7;
    state.slot = 1;
    chips.push(chipLines(state)); // ОЧЕРЕДЬ: 5 / +ПЛАТЁЖ
    state.slot = CUSTOMERS_PER_DAY;
    chips.push(chipLines(state)); // ОЧЕРЕДЬ: 0 / +ПЛАТЁЖ
    state.cust = makeSeller();
    chips.push(chipLines(state));
    state.cust = { kind: 'rent', name: 'Гробов', seed: LANDLORD_SEED, msg: '', pat: 0, max: 0, done: {} };
    chips.push(chipLines(state));
    makeState({ phase: 'evening', hours: 4, where: 'home' });
    chips.push(chipLines(state));
    state.where = 'junk';
    chips.push(chipLines(state));
    state.hours = 0;
    state.late = 2;
    chips.push(chipLines(state)); // 02:00 · НОЧЬ
    makeState({ slot: 3, late: 2, cn: 4 });
    chips.push(chipLines(state)); // 16:00 / ОЧЕРЕДЬ: 1
    makeState({ over: 'конец', ending: 'stayed' });
    chips.push(chipLines(state));
    return chips;
  }

  it('"+ПЛАТЁЖ" goes on its own line', () => {
    expect(allChips()).toContainEqual(['09:50', 'ОЧЕРЕДЬ: 5', '+ПЛАТЁЖ']);
    expect(allChips().flat().every(line => !line.includes(' +ПЛАТЁЖ'))).toBe(true);
  });

  it.each([375, 390])('does not reach the sign on a %d pt screen', width => {
    const chip = rule('.chip');
    const glyph = rootPx('--fs-px-s'); // Public Pixel: one glyph = 1em
    const padding = 2 * parseFloat(prop(chip, 'padding').split(/\s+/)[1]);
    const right = width * (1 - percent(prop(chip, 'right')));
    const signRight = (SHOP_SIGN.x + SHOP_SIGN.w) / SCENE.w * width;
    for (const lines of allChips()) {
      const chipWidth = Math.max(...lines.map(line => line.length)) * glyph + padding;
      expect(right - chipWidth, lines.join(' / ')).toBeGreaterThanOrEqual(signRight);
    }
  });
});

describe('deal on an iPhone SE (375×667)', () => {
  it('the price, the gut feeling and the buttons fit the pane without scrolling', () => {
    // fixed zones (measured in Chrome, see the report): scene 234, ticker 30, tabs 38
    const pane = 667 - 234 - 30 - 38 - rootPx('--bar-height') - rootPx('--hud-height');
    const padding = (body: string): number => prop(body, 'padding-block').split(/\s+/).reduce((sum, v) => sum + parseFloat(v), 0);
    const gap = parseFloat(prop(rule('.deal'), 'gap'));
    const fact = parseFloat(prop(rule('.fact'), 'min-height'));
    const button = 36;
    const seller = [
      20 + parseFloat(prop(rule('.thead'), 'margin-bottom')), // name, kind, patience
      fact + 22 + 4 + 2 * 6 + 2, // compact card: name line + facts row, padding, border
      parseFloat(prop(rule('.deal'), 'margin-top')),
      25, gap, button, gap, 22, gap, button, // ask · price row · gut feeling · "За N / Отпустить"
    ].reduce((sum, h) => sum + h, 0) + padding(rule('.pane'));
    expect(pane).toBe(257);
    expect(seller).toBeLessThanOrEqual(pane);
  });

  it('the seller card is compact: facts are the inspect buttons, a smaller icon', () => {
    expect(uiTs).toMatch(/function fact\([\s\S]*?data-a="insp"/);
    expect(uiTs).not.toContain('<div class="tools">');
    expect(rule('.midico')).toContain('height: 32px');
    expect(rule('.facts')).toContain('grid-template-columns: repeat(2, 1fr)'); // task 41: at most 2 checks a category
    expect(rule('.fact')).toContain('min-height: 36px');
  });
});

describe('small things', () => {
  it('"~" next to pixel numbers is raised to mid-line', () => {
    expect(rule('.approx')).toContain('position: relative');
    expect(rule('.approx')).toContain('top: -2px');
  });

  it('hover highlight only with a real pointer (no sticky "Куча N" on touch)', () => {
    expect(css).not.toMatch(/^\.btn:hover/m);
    expect(css).toMatch(/@media \(hover: hover\) \{\s*\.btn:hover:not\(:disabled\)/);
  });

  it('a new log line flashes the ticker, even if the text repeats', () => {
    expect(uiTs).toMatch(/state\.log !== shownLog/);
    expect(css).toMatch(/\.ticker\.fresh \{/);
  });
});
