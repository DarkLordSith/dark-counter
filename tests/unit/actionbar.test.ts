// V1.5 "Каркас": the action bar above the HUD — one main button per screen, always in the same place.
import { afterEach, describe, expect, it } from 'vitest';
import { barAction, canCallNext, mainAction, type MainAction } from '../../src/actionbar';
import { ACTION_TEXT, CUSTOMERS_PER_DAY, JUNK_TEXT, LANDLORD_SEED } from '../../src/data';
import { actor, actorAtCounter, actorReset, state } from '../../src/state';
import type { Tab } from '../../src/types';
import styleCss from '../../src/style.css?raw';
import uiTs from '../../src/ui.ts?raw';
import indexHtml from '../../index.html?raw';
import { makeItem, makePresentedBuyer, makeSeller, makeState } from './helpers';

const css = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
const RULES: [string, string][] = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => [m[1].trim().replace(/\s+/g, ' '), m[2]]);
const rule = (selector: string): string => {
  const found = RULES.filter(([sel]) => sel === selector);
  expect(found, `rule "${selector}" in style.css`).toHaveLength(1);
  return found[0][1];
};
const rootPx = (name: string): number => parseFloat(RULES.filter(([sel]) => sel === ':root').map(([, body]) => body).join('\n')
  .match(new RegExp(`${name}:\\s*([^;]+);`))?.[1] ?? 'NaN');

const action = (tab: Tab = 'deal'): string | null => barAction(tab);
const at = (main: MainAction): string => main.kind === 'button' ? main.label : main.kind === 'hint' ? main.text : '';
const landlord = () => ({ kind: 'rent' as const, name: 'Гробов', seed: LANDLORD_SEED, msg: '', pat: 0, max: 0, done: {} });

afterEach(() => actorReset());

describe('main action table', () => {
  it('shop, free counter → "Позвать следующего" on any tab', () => {
    makeState({ slot: 0 });
    expect(canCallNext()).toBe(true);
    for (const tab of ['deal', 'inv', 'craft'] as const) {
      expect(action(tab)).toBe('call');
    }
  });

  it('the queue is over → "Закрыть лавку"', () => {
    makeState({ slot: CUSTOMERS_PER_DAY, day: 3, nextDue: 7 });
    expect(action()).toBe('closeshop');
    expect(mainAction('inv')).toEqual({ kind: 'hint', text: ACTION_TEXT.ru.shiftOver });
  });

  it('a customer walking in or out → a dim hint, not an empty bar', () => {
    makeState();
    state.cust = makeSeller();
    actor.phase = 'in';
    expect(mainAction('deal')).toEqual({ kind: 'hint', text: ACTION_TEXT.ru.approaching });
    state.cust = null;
    actor.phase = 'out';
    expect(mainAction('deal')).toEqual({ kind: 'hint', text: ACTION_TEXT.ru.leaving });
  });

  it('seller → "Предложить"; buyer → "Назвать цену" once an item is shown', () => {
    makeState();
    state.cust = makeSeller();
    actorAtCounter(1);
    expect(action()).toBe('offer');
    expect(mainAction('inv').kind).toBe('hint');
    state.inv = [makeItem('battery')];
    state.cust = { ...makePresentedBuyer(), item: null };
    expect(mainAction('deal')).toEqual({ kind: 'hint', text: ACTION_TEXT.ru.showItem });
    state.cust = makePresentedBuyer({ item: state.inv[0] });
    expect(action()).toBe('ask');
  });

  it('buyer, nothing of that kind in stock → "Нет такого, до свидания"', () => {
    makeState({ inv: [] });
    state.cust = { ...makePresentedBuyer(), item: null };
    actorAtCounter(1);
    expect(action()).toBe('refuse');
  });

  it('Grobov: pay if the money is there, else defer, else goods, else eviction (in the risk color)', () => {
    makeState({ credits: 500, owed: 400 });
    state.cust = landlord();
    actorAtCounter(LANDLORD_SEED);
    expect(at(mainAction('deal'))).toBe('Заплатить 400 кр.');
    expect(action()).toBe('rentpay');
    state.credits = 100;
    expect(action()).toBe('rentdefer');
    state.deferred = true;
    state.inv = [makeItem('arm')];
    expect(action()).toBe('rentitems');
    state.inv = [];
    expect(mainAction('deal')).toMatchObject({ action: 'evict', tone: 'risk' });
  });

  it('evening → "Спать"; junkyard → "Копать", then "Вернуться домой"; on other tabs a hint', () => {
    makeState({ phase: 'evening', where: 'home', hours: 4 });
    expect(action()).toBe('sleep');
    expect(mainAction('inv')).toEqual({ kind: 'hint', text: ACTION_TEXT.ru.toEvening });
    state.where = 'junk';
    state.junk = { d: 2, n: 30, dp: 3, f: [], s: 1 };
    expect(action()).toBe('dig');
    expect(mainAction('deal')).toMatchObject({ label: JUNK_TEXT.ru.dig });
    state.junk.d = 0;
    expect(action()).toBe('home');
    state.junk = { d: 0, n: 50, dp: 4, f: [], s: 1, run: true }; // after the drone
    expect(action()).toBe('home');
    expect(mainAction('inv')).toEqual({ kind: 'hint', text: ACTION_TEXT.ru.toJunkyard });
  });

  it('after the end the bar is hidden (the final window has its buttons)', () => {
    makeState({ over: 'конец', ending: 'stayed' });
    expect(mainAction('deal')).toEqual({ kind: 'none' });
  });

  it('only "Позвать следующего" is a button off the "Прилавок" tab (the rest needs the pane)', () => {
    makeState();
    state.cust = makeSeller();
    actorAtCounter(1);
    for (const tab of ['inv', 'craft'] as const) {
      expect(mainAction(tab).kind).toBe('hint');
    }
  });

  it('RU and EN have the same strings', () => {
    expect(Object.keys(ACTION_TEXT.en)).toEqual(Object.keys(ACTION_TEXT.ru));
  });
});

describe('one main button per screen', () => {
  it('the moved actions are not in the panes any more: only the bar draws them', () => {
    for (const moved of ['call', 'offer', 'ask', 'closeshop', 'sleep', 'dig', 'evict']) {
      // buttons only: the Enter key handler still looks for [data-a="offer"] in the bar
      const asButton = new RegExp(`<button[^>]*data-a="${moved}"`);
      expect(uiTs, moved).not.toMatch(asButton);
      expect(indexHtml, moved).not.toMatch(asButton);
    }
    // Grobov's chosen option leaves the list (rentOptions), "Нет такого" leaves the buyer pane
    expect(uiTs).toMatch(/function rentOptions[\s\S]*?barAction\('deal'\)/);
    expect(uiTs).not.toContain('Нет такого, до свидания');
    // junkyard v2: "Вернуться домой" is a secondary pane button only while "Копать" holds the bar
    expect(uiTs).toMatch(/const homeButton = visit\.d > 0 \? `<button class="btn" data-a="home">/);
    expect(uiTs.match(/<button[^>]*data-a="home"/g)).toHaveLength(1);
  });

  it('the bar renders one button or one hint', () => {
    const render = uiTs.match(/function renderActionBar\(\)[\s\S]*?\n}/)?.[0] ?? '';
    expect(render.match(/<button/g)).toHaveLength(1);
    expect(render).toContain('class="act-hint m-inactive"');
    expect(render).toContain('btn pri act-main');
  });
});

describe('the bar in the layout', () => {
  it('sits between the pane and the HUD, in the same place on every screen', () => {
    const order = ['id="pane"', 'id="actionbar"', 'id="hud"'].map(mark => indexHtml.indexOf(mark));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(rule('.actionbar')).toContain('flex: none');
    expect(rule('.actionbar')).toContain('height: var(--bar-height)');
    expect(rootPx('--bar-height')).toBeGreaterThanOrEqual(44 + 2 * 4);
  });

  it('the main button and the hint are full width and at least 44 pt', () => {
    for (const selector of ['.act-main', '.act-hint']) {
      expect(rule(selector)).toContain('width: 100%');
      expect(rule(selector)).toContain('min-height: 44px');
    }
  });

  it('stays above the on-screen keyboard; only the HUD hides (V1.6)', () => {
    expect(RULES.some(([selector]) => selector === '.kb-open .actionbar')).toBe(false);
    expect(rule('.kb-open .hud')).toContain('display: none');
    // the page shrinks to the visible part, so the bar sits right above the keyboard
    expect(rule('.kb-open #app')).toContain('var(--kb-height');
    expect(uiTs).toMatch(/function trackKeyboard\(\)[\s\S]*?'--kb-height', `\$\{viewport\.height\}px`/);
    expect(uiTs).toMatch(/function trackKeyboard\(\)[\s\S]*?scrollIntoView\(\{ block: 'nearest' \}\)/);
  });

  it('the scene call button is gone; the scene runs edge to edge on a phone', () => {
    expect(indexHtml).not.toContain('callBtn');
    expect(styleCss).not.toMatch(/^\.call\b/m);
    expect(rule('.stage')).toContain('62.5vw');
    expect(css).toMatch(/@media \(max-width: 899px\) \{\s*\.scene \{[^}]*margin-left: calc\(50% - 50vw\)/);
  });

  it('fits a 375 × 667 screen: scene, ticker, tabs, bar and HUD leave room for the pane', () => {
    const scene = Math.min(0.4 * 667, 0.625 * 375); // .stage height
    const ticker = 30, tabs = 38;
    const fixed = scene + ticker + tabs + rootPx('--bar-height') + rootPx('--hud-height');
    expect(667 - fixed).toBeGreaterThanOrEqual(200);
  });
});
