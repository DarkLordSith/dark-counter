// =====================================================================
//  actionbar.ts — the action bar (V1.5 "Каркас"): which one main button
//  the current screen shows above the HUD, or a dim hint when there is
//  no obvious main action. Pure rules, no DOM: ui.ts draws the result
//  and leaves that action out of the pane, Vitest checks the table.
// =====================================================================
import { ACTION_TEXT, CUSTOMERS_PER_DAY } from './data';
import { isLandlordDue, isPresentedBuyer, planCollateral } from './economy';
import { actor, state } from './state';
import type { Tab } from './types';
import { fill } from './util';

const TEXT = ACTION_TEXT.ru;

export type MainAction =
  /** One button: data-a / data-v as in the pane; tone 'risk' only for eviction. */
  | { kind: 'button'; action: string; value?: string; label: string; tone: 'action' | 'risk' }
  /** No main action here: a dim hint in the bar (never an empty bar). */
  | { kind: 'hint'; text: string }
  /** The game is over: the bar is hidden, the final window has its own buttons. */
  | { kind: 'none' };

const button = (action: string, label: string, tone: 'action' | 'risk' = 'action'): MainAction => ({ kind: 'button', action, label, tone });
const hint = (text: string): MainAction => ({ kind: 'hint', text });

/** "Позвать следующего" is possible: the counter is free and someone is still in the queue (or Grobov is due). */
export function canCallNext(): boolean {
  return state.phase === 'shop' && actor.phase === 'empty' && !state.cust && !state.over
    && (state.slot < CUSTOMERS_PER_DAY || isLandlordDue());
}

/** Grobov at the counter: pay if the money is there, else defer, else goods, else eviction. */
function landlordAction(): MainAction {
  if (state.credits >= state.owed) {
    return button('rentpay', fill(TEXT.pay, { amount: state.owed }));
  }
  if (!state.deferred) {
    return button('rentdefer', TEXT.defer);
  }
  const plan = planCollateral();
  if (plan.ok && plan.items.length) {
    return button('rentitems', TEXT.collateral);
  }
  return button('evict', TEXT.evict, 'risk');
}

/**
 * The main action of the screen. Only "Позвать следующего" works from any tab
 * (as the scene button did); the others need the "Прилавок" / evening pane,
 * so on the other tabs the bar says where to go.
 */
export function mainAction(tab: Tab): MainAction {
  if (state.over) {
    return { kind: 'none' };
  }
  if (state.phase === 'evening') {
    if (tab !== 'deal') {
      return hint(state.where === 'junk' ? TEXT.toJunkyard : TEXT.toEvening);
    }
    return state.where === 'junk' ? button('home', TEXT.home) : button('sleep', TEXT.sleep);
  }
  if (canCallNext()) {
    return button('call', TEXT.call);
  }
  if (actor.phase === 'in') {
    return hint(TEXT.approaching);
  }
  if (actor.phase === 'out') {
    return hint(TEXT.leaving);
  }
  const customer = state.cust;
  if (!customer) {
    if (tab !== 'deal') {
      return hint(TEXT.shiftOver);
    }
    return state.slot >= CUSTOMERS_PER_DAY && !isLandlordDue() ? button('closeshop', TEXT.closeShop) : hint(TEXT.wait);
  }
  if (tab !== 'deal') {
    return hint(TEXT.toCounter);
  }
  if (customer.kind === 'rent') {
    return landlordAction();
  }
  if (customer.kind === 'sell') {
    return button('offer', TEXT.offer);
  }
  if (!state.inv.some(item => item.t === customer.want)) {
    return button('refuse', TEXT.noItem);
  }
  return isPresentedBuyer(customer) ? button('ask', TEXT.ask) : hint(TEXT.showItem);
}

/** The action the bar took from the pane on this screen, if any (the pane leaves it out). */
export function barAction(tab: Tab): string | null {
  const main = mainAction(tab);
  return main.kind === 'button' ? main.action : null;
}
