// =====================================================================
//  actionbar.ts — the action bar (V1.5 "Каркас"): which one main button
//  the current screen shows above the HUD, or a dim hint when there is
//  no obvious main action. Pure rules, no DOM: ui.ts draws the result
//  and leaves that action out of the pane, Vitest checks the table.
//  Also the queue chip on the scene (chipLines): the other bit of
//  "where am I in the day" text drawn over the scene.
//  The game state and the scene figure come as parameters (task 21).
// =====================================================================
import { t } from './i18n';
import { clockOf } from './day';
import { isLandlordDue, isPresentedBuyer, planCollateral } from './economy';
import type { Actor, GameState, Tab } from './types';


export type MainAction =
  /** One button: data-a / data-v as in the pane; tone 'risk' only for eviction. */
  | { kind: 'button'; action: string; value?: string; label: string; tone: 'action' | 'risk' }
  /** No main action here: a dim hint in the bar (never an empty bar). */
  | { kind: 'hint'; text: string }
  /** The game is over: the bar is hidden, the final window has its own buttons. */
  | { kind: 'none' };

const button = (action: string, label: string, tone: 'action' | 'risk' = 'action'): MainAction => ({ kind: 'button', action, label, tone });
const hint = (text: string): MainAction => ({ kind: 'hint', text });

/** What the bar needs to know about the scene: whether a figure is walking in or out. */
export type SceneFigure = Pick<Actor, 'phase'>;

/** "Позвать следующего" is possible: the counter is free and someone is still in the queue (or Grobov is due). */
export function canCallNext(state: GameState, actor: SceneFigure): boolean {
  return state.phase === 'shop' && actor.phase === 'empty' && !state.cust && !state.over
    && (state.slot < state.cn || isLandlordDue(state));
}

/** Grobov at the counter: pay if the money is there, else defer, else goods, else eviction. */
function landlordAction(state: GameState): MainAction {
  if (state.credits >= state.owed) {
    return button('rentpay', t('action.pay', { amount: state.owed }));
  }
  if (!state.deferred) {
    return button('rentdefer', t('action.defer'));
  }
  const plan = planCollateral(state);
  if (plan.ok && plan.items.length) {
    return button('rentitems', t('action.collateral'));
  }
  return button('evict', t('action.evict'), 'risk');
}

/** What the screen adds to the rules (not in the save): ui.ts passes it. */
export interface BarContext {
  /** The morning window was shown and nobody has been called yet (task 29): "Позвать" reads "Открыть лавку". */
  morning?: boolean;
  /** The Mac layout (V2.4): the customer is on the scene, a click on them opens the counter. */
  desk?: boolean;
}

/**
 * The main action of the screen. Only "Позвать следующего" works from any tab
 * (as the scene button did); the others need the "Прилавок" / evening pane,
 * so on the other tabs the bar says where to go.
 */
export function mainAction(state: GameState, actor: SceneFigure, tab: Tab, context: BarContext = {}): MainAction {
  if (state.over) {
    return { kind: 'none' };
  }
  if (state.phase === 'evening') {
    if (tab !== 'deal') {
      return hint(state.where === 'junk' ? t('action.toJunkyard') : t('action.toEvening'));
    }
    if (state.where === 'junk') {
      // "Копать" while digs are left; then (or after the drone) "Вернуться домой" takes the bar
      return state.junk && state.junk.d > 0 ? button('dig', t('junk.dig')) : button('home', t('action.home'));
    }
    return button('sleep', t('action.sleep'));
  }
  if (canCallNext(state, actor)) {
    // the morning: one button closes the window and calls the first customer
    return context.morning ? button('openshop', t('action.openShop')) : button('call', t('action.call'));
  }
  if (actor.phase === 'in') {
    return hint(t('action.approaching'));
  }
  if (actor.phase === 'out') {
    return hint(t('action.leaving'));
  }
  const customer = state.cust;
  if (!customer) {
    if (tab !== 'deal') {
      return hint(t('action.shiftOver'));
    }
    return state.slot >= state.cn && !isLandlordDue(state) ? button('closeshop', t('action.closeShop')) : hint(t('action.wait'));
  }
  if (tab !== 'deal') {
    // Mac: the stock or the bench window is open over the scene, the customer is right there
    return hint(context.desk ? t('action.toCounterDesk') : t('action.toCounter'));
  }
  if (customer.kind === 'rent') {
    return landlordAction(state);
  }
  if (customer.kind === 'sell') {
    return button('offer', t('action.offer'));
  }
  if (!state.inv.some(item => item.t === customer.want)) {
    return button('refuse', t('action.noItem'));
  }
  return isPresentedBuyer(customer) ? button('ask', t('action.ask')) : hint(t('action.showItem'));
}


/**
 * Chip in the scene corner: the game time first (task 16), then the queue. Short lines (V1.6),
 * so the chip stays clear of the "ЛАВКА 7Б" sign on a 375 pt screen: in the evening one line
 * "21:00 · ВЕЧЕР", in the shop the time, "ОЧЕРЕДЬ: 3" and "+ПЛАТЁЖ" each on its own line.
 * The first line is the time; ui.ts tints it `wear` past midnight (chipIsNight).
 */
export function chipLines(state: GameState): string[] {
  if (state.over) {
    return [t('day.closed')];
  }
  const clock = clockOf(state);
  if (state.phase === 'evening') {
    const place = clock.night ? t('day.night') : state.where === 'junk' ? t('day.junk') : t('day.evening');
    return [`${clock.text} · ${place}`];
  }
  const queue = state.cn - state.slot - (state.cust ? 1 : 0);
  const landlordDue = isLandlordDue(state);
  const queueText = queue > 0 ? t('day.queue', { n: queue }) : landlordDue ? t('day.queue', { n: 0 }) : t('day.shiftOver');
  return landlordDue ? [clock.text, queueText, t('day.payment')] : [clock.text, queueText];
}

/** Past midnight: the chip's time is drawn in `wear` (time, as in the colour dictionary). */
export const chipIsNight = (state: GameState): boolean => !state.over && clockOf(state).night;

/** The action the bar took from the pane on this screen, if any (the pane leaves it out). */
export function barAction(state: GameState, actor: SceneFigure, tab: Tab, context: BarContext = {}): string | null {
  const main = mainAction(state, actor, tab, context);
  return main.kind === 'button' ? main.action : null;
}
