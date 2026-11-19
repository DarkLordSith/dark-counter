// =====================================================================
//  ui.ts — HTML rendering of the HUD, scene overlay, tabs and panes,
//  plus all click/keyboard handlers (buttons carry data-a="action").
// =====================================================================
import { barAction, chipIsNight, chipLines, mainAction } from './actionbar';
import type { BarContext } from './actionbar';
import { customersToday, formatHour, openingHour } from './day';
import { audio, playSfx, setJunkAmbience, startSoundOnGesture, toggleMusic, toggleSfx } from './audio';
import {
  BENCH_COST, DEBT, JUNK, HAGGLE, ITEM_TYPES, MARKET, MAX_HEAT, MODES,
  PLAYABLE_MODES, RECIPES, RENT, SUPPLIER, WHOLESALE,
} from './data';
import { customerNameText, detectLang, getLang, isLang, itemName, LANGS, setLang, t, text as textOf, tx } from './i18n';
import type { Lang, Tx } from './i18n';
import type { RU } from './lang/ru';
import { byId, maybeById } from './dom';
import { iconSvg } from './icons';
import { isRareItem, isRareLine, starSvg } from './star';
import type { StarKind } from './star';
import { closeWindow, initWindows, isWindowOpen, labelWindowFrame, openWindow, relayoutWindow, updateWindow } from './window';
import { DESK_QUERY, stageFit } from './layout';
import { benchNav, benchOffer, benchOrder, filterStock, STOCK_FILTERS, successor } from './stock';
import { backpackFinds, backpackSlots } from './backpack';
import type { BackpackSlot } from './backpack';
import { tileCondition, tileMark, TILE_MARKS } from './tile';
import type { TileMark } from './tile';
import type { WindowSpec } from './window';
import {
  askBuyer, availableOfType, buyFromSeller, buySeat, callNextCustomer, canBuySeat, canCraft, hasShuttle, isDebtClosed, canVisitMarket, closeShop,
  collateralHeatRelief, craft, customerLeaves, deferredDebt, deferRent, dig, estimatedValue, evict, feedback,
  canGoToJunkyard, digIsLate, goHome, goToJunkyard, hunchVerdict, junkVisitHours, leaveWaiting, throwAway, waitingFinds, inspect, isFullyKnown, isInspectCheck, isLandlordDue, isOnCounter, isPresentedBuyer,
  nextRent, offerToSeller, orderParts, payEarly, payRent, payWithCollateral, perceivedChance, planCollateral, presentItem,
  expenseLines, recipeNeeds, scrapValue, seatPrice, sellToBuyer, showsInfection, sleepUntilMorning, useWorkbench, visitMarket,
  bulkPrice, bulkStock, canSetDiscount, cartItems, cartTotal, fitsCart, sellBatch, setDiscount, toggleCart,
} from './economy';
import type { CollateralPlan, MorningReport } from './economy';
import { isPlayable, loadProfile, recordEnding, recordHotspotTap, saveProfile } from './profile';
import { hitTest } from './hotspots';
import { isOnHeap, onSceneClick, paintIcons, playDigFx, pressHotspot, scenePoint, setHotspotHints } from './scene';
import {
  actor, actorAtCounter, actorEnter, actorReset, addLog, exportSaveCode, findItem, importSaveCode, newGame, persistence, readSlot, saveGame, setState, state, ui,
} from './state';
import type { BuyerCustomer, Customer, GameState, InspectCheck, Item, ItemType, JunkVisit, Mode, Profile, Recipe, RentCustomer, SellerCustomer, StockFilter, Tab, WholesaleCustomer } from './types';
import { roundTo10 } from './util';
import { VERSION_LABEL } from './version';
import { gameRng } from './rng';

/* =====================================================================
   Small HTML helpers
   ===================================================================== */

// Colors carry meaning only through the m-* classes (style.css → --m-* → MEANING in palette.ts).
const UNKNOWN = '<span class="m-unknown">?</span>';
const closeButton = (): string => `<button class="btn pri" data-a="close">${t('hud.close')}</button>`;
const FLOATING_TEXT_LIFETIME_MS = 1300;
/** Viewport shrink that means an on-screen keyboard, not a browser bar. */
const KEYBOARD_MIN_PX = 150;
const disabledIf = (condition: unknown): string => condition ? 'disabled' : '';

/**
 * "About N": the one place that writes the approximation sign. Public Pixel draws "~" as "∾"
 * and its "≈" is unreadable, so the sign is set in mono (.approx) and the number keeps its font.
 */
const approx = (value: string | number): string => `<span class="approx">~</span>${value}`;
/** "120 кр." / "120 cr." */
const money = (n: number): string => t('unit.money', { n });
/** The visitor's name: Grobov's is translated (the save keeps the Russian one), customers' names stay as they are. */
const customerName = (customer: Customer): string => customer.kind === 'rent' ? t('landlord.name') : customerNameText(customer.name);
const conditionText = (item: Item): string => item.k.cond ? item.cond + '%' : '?%';

function iconCanvas(type: ItemType, cssClass = '', infected = false): string {
  return `<canvas class="${cssClass}" width="28" height="16" data-ico="${type}" data-inf="${infected ? 1 : 0}"></canvas>`;
}

function itemTags(item: Item): string {
  const tags: string[] = [];
  if (isRareItem(item)) {
    tags.push(`<span class="tag m-rare">${starSvg('rare')} ${t('stock.legend.rare')}</span>`);
  }
  tags.push(item.k.cond ? `<span class="tag ${item.cond < 40 ? 'm-wear' : ''}">${item.cond}%</span>` : `<span class="tag m-unknown">${t('tags.condUnknown')}</span>`);
  if (item.k.serial) {
    tags.push(item.stolen ? `<span class="tag m-risk">${t('tags.stolen')}</span>` : `<span class="tag m-action">${t('tags.clean')}</span>`);
  } else {
    tags.push(`<span class="tag m-unknown">${t('tags.serialUnknown')}</span>`);
  }
  if (item.k.flaw) {
    if (item.defect) {
      tags.push(`<span class="tag m-wear">${t('tags.defect')}</span>`);
    }
    if (item.infected) {
      tags.push(`<span class="tag m-risk">${t('tags.ai')}</span>`);
    }
    if (!item.defect && !item.infected) {
      tags.push(`<span class="tag m-action">${t('tags.insidesOk')}</span>`);
    }
  } else {
    tags.push(`<span class="tag m-unknown">${t('tags.insidesUnknown')}</span>`);
  }
  return `<div class="tags">${tags.join('')}</div>`;
}

/** Status marks of the item tile (task 35): pixel icons 5×5 drawn 2×, the legend under the stock uses the same ones. */
const MARK_HTML: Record<TileMark, string> = {
  ai: `<i class="tm m-risk">${iconSvg('ai')}</i>`,
  stolen: `<i class="tm m-risk">${iconSvg('stolen')}</i>`,
  fake: `<i class="tm">${starSvg('fake')}</i>`,
  broken: `<i class="tm m-wear">${iconSvg('broken')}</i>`,
  rare: `<i class="tm">${starSvg('rare')}</i>`,
};

/**
 * The face of the one item tile (task 35): the icon ×2 in a 60×36 frame, the condition
 * top left ("?" until checked), one status mark top right — the most dangerous known (tile.ts).
 */
function tileFace(item: Item, iconClass = ''): string {
  const condition = tileCondition(item);
  const corner = condition === null ? '<b class="tc tc-unknown">?</b>' : `<b class="tc">${condition}%</b>`;
  const mark = tileMark(item);
  return `<span class="tface">${iconCanvas(item.t, iconClass, showsInfection(item))}${corner}${mark ? MARK_HTML[mark] : ''}</span>`;
}

/** The whole tile: the face and the price under it; a button with its action, the name for screen readers. */
function itemTile(item: Item, action: string, on: boolean, extraClass = ''): string {
  const label = `${itemName(item.t)}, ${conditionText(item)}, ${money(estimatedValue(item))}`;
  return `<button class="tile stile ${extraClass} ${on ? 'on' : ''}" data-a="${action}" data-v="${item.uid}" aria-label="${label}">${tileFace(item)}<span class="tv">${approx(estimatedValue(item))}</span></button>`;
}

/** The legend under the stock: only the marks that are on the shelf now, "?" while anything is unchecked. */
function stockLegend(items: readonly Item[]): string {
  const shown = new Set(items.map(tileMark));
  const entries: string[] = [];
  if (items.some(item => tileCondition(item) === null)) {
    entries.push(`<span><b class="tc tc-unknown">?</b>${t('stock.legend.unknown')}</span>`);
  }
  for (const mark of TILE_MARKS) {
    if (shown.has(mark)) {
      entries.push(`<span>${MARK_HTML[mark]}${t(`stock.legend.${mark}`)}</span>`);
    }
  }
  return entries.length ? `<div class="legend">${entries.join('')}</div>` : '';
}

/** Row of cells, the first `filled` of them lit (the junkyard noise bar). */
function meterCells(total: number, filled: number): string {
  return Array.from({ length: total }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
}

/* =====================================================================
   HUD, scene overlay, tabs
   ===================================================================== */

/** One HUD stat: a small mono label above a pixel-font number (V1.4: one row on a 375 pt screen). */
const hudStat = (label: string, valueHtml: string, cssClass = ''): string =>
  `<span class="st ${cssClass}"><small>${label}</small>${valueHtml}</span>`;

/**
 * Weekly payment: days left go into the label ("платёж·3д"), so the number column stays narrow.
 * The stat is a button: it opens the debt window (early payments, the shuttle seat).
 */
function paymentStat(): string {
  const daysLeft = state.nextDue - state.day;
  const paying = state.debt > 0 && !state.over;
  const urgent = paying && (state.credits < state.owed && daysLeft <= 1 || state.deferred);
  // due today = "0д": same width as "6д" (the scene chip says "+ПЛАТЁЖ" on that day)
  const when = paying ? `·${Math.max(0, daysLeft)}${t('hud.daysShort')}` : '';
  const value = paying ? state.owed : '—';
  return `<button class="st st-btn ${urgent ? 'm-risk' : ''}" data-a="debt" aria-haspopup="dialog"><small>${t('hud.payment')}${when}</small><b>${value}</b></button>`;
}

/** Bottom bar: кр · день/60 · платёж · зап, then ☰. The wanted level is on the scene wall, music in the menu. */
function renderHud(): void {
  const menu = `<button class="ib" data-a="menu" aria-haspopup="dialog" aria-label="${t('hud.menu')}">${iconSvg('menu')}</button>`;
  byId('hud').innerHTML = `<div class="stats">${[
    hudStat(t('hud.credits'), `<b>${state.credits}</b>`),
    // the shuttle day goes into the label ("день/60"): the number column keeps two digits
    hudStat(hasShuttle(state) ? `${t('hud.day')}/${state.shuttleDay}` : t('hud.day'), `<b>${state.day}</b>`),
    paymentStat(),
    hudStat(t('hud.parts'), `<b>${state.parts}</b>`),
  ].join('')}</div>${menu}`;
}

/** Screen-reader text of the wanted-level meter drawn on the scene ("розыск 3 из 10"). */
const heatText = (): string => `${t('hud.heat')} ${state.heat} ${t('hud.of')} ${MAX_HEAT}`;

/** A log line as shown, in the current language: a rare find gets the star (it is not stored). */
const logLine = (line: string): string => isRareLine(line) ? `${starSvg('rare')} ${textOf(line)}` : textOf(line);

/** The log the ticker showed last: a different array means a new line (see renderSceneOverlay). */
let shownLog: string[] | null = null;

/** Speech bubble, queue chip and the log ticker ("call next" lives in the action bar since V1.5). */
export function renderSceneOverlay(): void {
  const customer = state.cust;
  const atCounter = actor.phase === 'idle' && customer;
  const bubble = byId('bubble');
  if (state.where === 'junk' && state.jmsg) {
    bubble.hidden = false;
    bubble.textContent = textOf(state.jmsg);
    bubble.classList.add('free');
    // a rare find: the star and a lamp frame instead of the turquoise one (V2.6)
    const rare = isRareLine(state.jmsg);
    bubble.classList.toggle('rare', rare);
    if (rare) {
      bubble.insertAdjacentHTML('afterbegin', `${starSvg('rare')} `);
    }
  } else {
    bubble.classList.remove('free', 'rare');
    bubble.hidden = !atCounter;
    if (atCounter) {
      bubble.textContent = textOf(customer.msg);
    }
  }
  // the time comes first; past midnight it reads as `wear` (time)
  const night = chipIsNight(state);
  byId('chip').innerHTML = chipLines(state).map((line, i) => `<span${i === 0 && night ? ' class="m-wear"' : ''}>${line}</span>`).join('');
  const ticker = byId('ticker');
  ticker.innerHTML = `<b>›</b> ${logLine(state.log[0] || '')}`;
  // addLog(state, ) makes a new array: a new line arrived, even if its text repeats the last one
  if (state.log !== shownLog) {
    if (shownLog) {
      ticker.classList.remove('fresh');
      void ticker.offsetWidth; // restart the animation
      ticker.classList.add('fresh');
    }
    shownLog = state.log;
  }
  const heat = byId('heatText');
  if (heat.textContent !== heatText()) {
    // aria-live: announced only when the level changes
    heat.textContent = heatText();
  }
}

/** Tab names; on a Mac (V2.4) they are also the titles of the windows that replaced the pane. */
function tabLabels(): [Tab, string][] {
  const firstTab = t(state.phase === 'shop' ? 'tabs.counter' : state.where === 'junk' ? 'tabs.junk' : 'tabs.evening');
  return [['deal', firstTab], ['inv', t('tabs.stock', { n: state.inv.length })], ['craft', t('tabs.craft')]];
}

function renderTabs(): void {
  byId('tabs').innerHTML = tabLabels()
    .map(([key, label]) => `<button class="tab ${ui.tab === key ? 'on' : ''}" data-a="tab" data-v="${key}">${label}</button>`)
    .join('');
}

/* =====================================================================
   Price input and chance meter
   ===================================================================== */

function priceRow(defaultPrice: number): string {
  return `<div class="pr"><button class="btn" data-a="adj" data-v="-50">−50</button><button class="btn" data-a="adj" data-v="-10">−10</button>
  <input id="offer" type="number" inputmode="numeric" min="0" step="10" value="${defaultPrice}" aria-label="${t('deal.price')}">
  <button class="btn" data-a="adj" data-v="10">+10</button><button class="btn" data-a="adj" data-v="50">+50</button></div>
  <div class="chance"><span>${t('deal.hunch')}</span><div class="cbar"><i id="cbar"></i></div><b id="cverdict" class="verdict">—</b><small id="cval">—</small></div>`;
}

const readOffer = (input: HTMLInputElement): number => Math.max(0, parseInt(input.value) || 0);

function updateChanceMeter(): void {
  const customer = state.cust;
  const input = maybeById<HTMLInputElement>('offer');
  if (!customer || !input || !maybeById('cval')) {
    return;
  }
  // the price box exists only for a seller or a buyer who was shown an item
  if (customer.kind === 'rent' || customer.kind === 'bulk' || (customer.kind === 'buy' && !isPresentedBuyer(customer))) {
    return;
  }
  const chance = perceivedChance(customer, readOffer(input));
  byId('cverdict').textContent = t(`verdict.${hunchVerdict(chance)}`);
  byId('cval').innerHTML = chance >= 1 ? t('deal.agrees') : chance <= 0 ? t('deal.offended') : approx(`${Math.round(chance * 100)}%`);
  byId('cbar').style.width = (chance * 100) + '%';
}

/* =====================================================================
   Deal pane
   ===================================================================== */

function option(action: string, disabled: boolean, title: string, description: string, side: string | number, sideClass = ''): string {
  return `<button class="opt" data-a="${action}" ${disabledIf(disabled)}><div><b>${title}</b><br><span>${description}</span></div><span${sideClass}>${side}</span></button>`;
}

/**
 * Depth as a scale of the visit's digs (task 35, was the noise scale), in the backpack's head row:
 * deeper means rarer finds. Neutral `fg`: depth itself is no risk, the ★ of a find says "rare".
 */
function depthMeter(visit: JunkVisit): string {
  const total = visit.dp + visit.d;
  return `<span class="noise depth"><span>${t('junk.depth')}</span><span class="nbar">${meterCells(total, visit.dp)}</span><b class="nword">${visit.dp}</b></span>`;
}

/** Time before "Копать" (task 16): the last dig before midnight, then each dig costs a customer tomorrow. Time reads as `wear`. */
function junkTimeNote(digsLeft: number): string {
  const lines: string[] = [];
  if (digsLeft > 0 && digIsLate(state)) {
    lines.push(t('junk.pastMidnight'));
  } else if (digsLeft > 0 && state.hours === JUNK.digHours) {
    lines.push(t('junk.lastFree'));
  }
  if (state.late > 0) {
    lines.push(t('junk.lateSoFar', { n: state.late * JUNK.lateCustomerLoss }));
  }
  return lines.map(line => `<div class="hint m-wear">${line}</div>`).join('');
}

/**
 * The backpack (task 35), screen memory only: the find whose card is open, and the finds of the
 * last dig (their frames light once, on the render right after it).
 */
const backpack: { pick: number | null; fresh: number[] } = { pick: null, fresh: [] };

function backpackSlot(slot: BackpackSlot): string {
  if (slot.kind === 'empty') {
    return `<div class="bp-slot" aria-label="${t('junk.slotEmpty')}"></div>`;
  }
  const { item } = slot;
  const fresh = backpack.fresh.includes(item.uid) ? (isRareItem(item) ? 'bp-new-rare' : 'bp-new') : '';
  return itemTile(item, 'pick', backpack.pick === item.uid, `bp-tile ${fresh}`);
}

/** The card of a find (a tap on its tile): name and estimate, what is known; "Выбросить" frees the place. */
function findCard(item: Item): string {
  return `<div class="card bp-card">${tileFace(item, 'midico')}<div class="di-body"><div class="rn">${itemName(item.t)} <span class="tv">${approx(estimatedValue(item))}</span></div>${itemTags(item)}</div></div>
    <div class="acts bp-acts"><button class="btn" data-a="throw" data-v="${item.uid}">${t('junk.throwAway')}</button><button class="btn" data-a="pick" data-v="${item.uid}">${t('junk.keep')}</button></div>`;
}

/** "Рюкзак полон": what did not fit, and the choice — throw something out (opens the cheapest find's card) or leave it. */
function fullNote(waiting: readonly Item[]): string {
  const names = waiting.map(item => itemName(item.t)).join(', ');
  return `<div class="bp-full"><b class="m-wear">${t('junk.packFull')}.</b> <span class="hint">${t('junk.waits', { list: names })}</span></div>
    <div class="acts bp-acts"><button class="btn" data-a="openpack">${t('junk.openPack')}</button><button class="btn" data-a="leavefind">${t('junk.leave')}</button></div>`;
}

/** РЮКЗАК N/8 with the depth scale in one row, and the 4×2 grid of the finds. */
function backpackGrid(visit: JunkVisit): string {
  const count = backpackFinds(visit, state.inv).length;
  const cells = backpackSlots(visit, state.inv).map(backpackSlot).join('');
  backpack.fresh = []; // the frames light once, on the render right after the dig
  return `<div class="bp"><div class="bp-head"><small>${t('junk.backpack')}</small><b class="rn">${count}/${JUNK.backpackSize}</b>${depthMeter(visit)}</div><div class="bp-grid">${cells}</div></div>`;
}

/**
 * The junkyard (task 35): the backpack grid with the depth, then one of — the card of a find,
 * "Рюкзак полон", or the time notes and "Вернуться домой". One at a time: an iPhone SE shows it all without scrolling.
 */
function junkyardPane(): string {
  const visit = state.junk;
  if (!visit) {
    return '';
  }
  if (backpack.pick !== null && !visit.f.includes(backpack.pick)) {
    backpack.pick = null;
  }
  const picked = backpack.pick === null ? undefined : findItem(state, backpack.pick);
  const waiting = waitingFinds(state);
  // "Копать" is the main action (the action bar), "Вернуться домой" is here until the digs run out — then it goes to the bar
  const homeButton = visit.d > 0 ? `<button class="btn bp-home" data-a="home">${t('action.home')}</button>` : '';
  const below = picked ? findCard(picked) : waiting.length ? fullNote(waiting) : junkTimeNote(visit.d) + homeButton;
  return `${backpackGrid(visit)}
      ${below}`;
}

function eveningPane(): string {
  return `<div class="hint" style="margin-bottom:8px">${t('evening.closed', { hours: `<b>${state.hours}</b>` })}</div>
    <div class="opts">
      ${option('junk', !canGoToJunkyard(state), t('junk.title'), t('junk.about', { hours: junkVisitHours(), dig: JUNK.digHours, size: JUNK.backpackSize }), '→')}
      ${option('market', !canVisitMarket(state), t('evening.market'), t('evening.marketAbout', { hours: MARKET.hours, parts: MARKET.parts, price: MARKET.price }), MARKET.price)}
    </div>
    <div class="hint note">${t('evening.sleepNote')}</div>`;
}

function emptyCounterPane(): string {
  if (actor.phase === 'in') {
    return `<div class="hint">${t('action.approaching')}</div>`;
  }
  if (actor.phase === 'out') {
    return `<div class="hint">${t('action.leaving')}</div>`;
  }
  if (state.over) {
    return `<div class="hint">${t('deal.sealed')}</div>`;
  }
  if (state.slot >= state.cn && !isLandlordDue(state)) {
    return `<div class="hint">${t('deal.queueOver')}</div>`;
  }
  return `<div class="hint">${t('deal.free')}</div>`;
}

function collateralDescription(plan: CollateralPlan): string {
  if (!plan.ok) {
    return t('rent.short');
  }
  const goods = plan.items.length ? t('rent.andGoods', { items: plan.items.map(item => itemName(item.t)).join(', ') }) : '';
  const heat = plan.hot ? ` <span class="m-action">${t('rent.heatRelief', { n: collateralHeatRelief(state, plan) })}</span>` : '';
  return t('rent.takes', { cash: plan.cash, goods, heat });
}

function rentPane(customer: RentCustomer): string {
  const plan = planCollateral(state);
  const canPay = state.credits >= state.owed;
  const deferText = state.deferred
    ? t('rent.noSecondDefer')
    : t('debt.deferOption', { days: tx('plural.days', { n: RENT.deferDays }), amount: deferredDebt(state) });
  const payText = t('debt.paymentOption', {
    debt: state.debt - state.owed,
    next: Math.min(nextRent(state), Math.max(0, state.debt - state.owed)),
    period: tx('plural.days', { n: DEBT.periodDays }),
  });
  let html = `<div class="thead"><div><span class="cname">${customerName(customer)}</span><span class="kind m-risk">${t('rent.forPayment')}</span></div></div>
    <div class="card" style="flex-direction:column;gap:2px"><div class="rows">
      <span>${t('rent.due')}</span><span class="price"><b>${money(state.owed)}</b>${state.deferred ? ` <span class="m-risk">${t('rent.fine')}</span>` : ''}</span>
      <span>${t('debt.debtLeft')}</span><span class="price">${money(state.debt)}</span>
      <span>${t('debt.youHave')}</span><span class="price ${canPay ? 'm-action' : 'm-risk'}">${money(state.credits)}</span></div></div>
    <div class="opts" style="margin-top:8px">${rentOptions([
      ['rentpay', t('rent.pay'), option('rentpay', !canPay, t('rent.pay'), payText, state.owed, ' class="price"'), payText],
      ['rentdefer', t('action.defer'), option('rentdefer', state.deferred, t('action.defer'), deferText, '⧗'), deferText],
      ['rentitems', t('action.collateral'), option('rentitems', !(plan.ok && plan.items.length), t('action.collateral'), collateralDescription(plan), '⚖'), collateralDescription(plan)],
    ])}</div>`;
  return html;
}

/**
 * Grobov's options. The one the action bar shows (pay / defer / goods) leaves the list,
 * its explanation stays as a line on top; "Нечем платить" is only in the bar.
 */
function rentOptions(options: [action: string, title: string, html: string, description: string][]): string {
  const main = barAction(state, actor, 'deal', barContext());
  const chosen = options.find(([action]) => action === main);
  const note = chosen ? `<div class="hint note">${t('rent.barNote', { action: chosen[1], text: chosen[3] })}</div>` : '';
  return note + options.filter(([action]) => action !== main).map(([, , html]) => html).join('');
}

function customerHeader(customer: SellerCustomer | BuyerCustomer): string {
  // V2.5: patience lives over the customer's head on the scene, not here
  return `<div class="thead"><div><span class="cname">${customerName(customer)}</span><span class="kind ${customer.kind}">${t(customer.kind === 'sell' ? 'deal.sells' : 'deal.buys')}</span></div></div>`;
}

/**
 * One inspection fact of the seller's item (V1.6, compact for iPhone SE): until the check is done
 * it is the inspect button itself ("Сост. ?"), after that the result in its meaning color.
 */
function fact(customer: SellerCustomer, check: InspectCheck, label: string, title: string, result: string): string {
  if (!customer.done[check]) {
    return `<button class="btn fact" data-a="insp" data-v="${check}" title="${title}">${label} ${UNKNOWN}</button>`;
  }
  return `<span class="fact">${label} ${result}</span>`;
}

function sellerPane(customer: SellerCustomer): string {
  const item = customer.item;
  const condition = `<span class="${item.cond < 40 ? 'm-wear' : ''}">${item.cond}%</span>`;
  const serial = item.stolen ? `<span class="m-risk">${t('deal.filed')}</span>` : `<span class="m-action">${t('deal.clean')}</span>`;
  const insides = item.infected ? `<span class="m-risk">${t('deal.ai')}</span>` : item.defect ? `<span class="m-wear">${t('deal.defect')}</span>` : `<span class="m-action">${t('deal.ok')}</span>`;
  const defaultOffer = Math.min(state.credits, roundTo10(customer.ask * HAGGLE.sellerDefaultOfferShare));
  return `<div class="card deal-item">${tileFace(item, 'midico')}<div class="di-body"><div class="rn">${itemName(item.t)}</div>
      <div class="facts">${fact(customer, 'cond', t('deal.cond'), t('deal.condTitle'), condition)}${fact(customer, 'serial', t('deal.serial'), t('deal.serialTitle'), serial)}${fact(customer, 'flaw', t('deal.insides'), t('deal.insidesTitle'), insides)}</div></div></div>
    <div class="deal"><div class="ask">${t('deal.asks', { ask: `<b class="price">${customer.ask}</b>`, estimate: approx(estimatedValue(item)) })}</div>
      ${priceRow(defaultOffer)}
      <div class="acts"><button class="btn alt" data-a="accept" ${disabledIf(customer.ask > state.credits)}>${t('deal.for', { n: customer.ask })}</button>
      <button class="btn" data-a="refuse">${t('deal.refuse')}</button></div></div>`;
}

function buyerPane(customer: BuyerCustomer): string {
  const matching = state.inv.filter(item => item.t === customer.want);
  let html = `<div class="ask want">${t('deal.needs', { item: `<b>${itemName(customer.want)}</b>` })}</div>`;
  if (!matching.length) {
    return html + `<div class="hint">${t('deal.noStock')}</div>`;
  }
  const tiles = matching.map(item => {
    const shown = customer.item && customer.item.uid === item.uid;
    return `<button class="tile ${shown ? 'on' : ''}" data-a="show" data-v="${item.uid}">${tileFace(item)}<span class="tv">${approx(estimatedValue(item))}</span></button>`;
  }).join('');
  // compact row tiles (V1.6): the price and the gut feeling fit an iPhone SE without scrolling
  html += `<div class="shelf pick">${tiles}</div>`;
  if (!isPresentedBuyer(customer)) {
    return html + `<div class="hint" style="margin:8px 0">${t('deal.showItem')}</div><button class="btn" data-a="refuse" style="width:100%">${t('deal.refuse')}</button>`;
  }
  return html + `<div class="deal"><div class="ask">${t('deal.offers', { n: `<b class="price">${customer.offer}</b>` })}</div>${priceRow(roundTo10(customer.offer * HAGGLE.buyerDefaultAskShare))}
        <div class="acts"><button class="btn alt" data-a="take">${t('deal.for', { n: customer.offer })}</button>
        <button class="btn" data-a="refuse">${t('deal.refuse')}</button></div></div>`;
}

/** A tile of the wholesaler's grid: the one item tile with his price under it; in the basket — the `action` frame. */
function bulkTile(customer: WholesaleCustomer, item: Item): string {
  const inCart = customer.cart.includes(item.uid);
  const fits = inCart || fitsCart(state, customer, item);
  const label = `${itemName(item.t)}, ${conditionText(item)}, ${money(bulkPrice(item))}`;
  return `<button class="tile stile ${inCart ? 'on' : ''} ${fits ? '' : 'nofit'}" data-a="cart" data-v="${item.uid}" aria-pressed="${inCart}" aria-label="${label}">${tileFace(item)}<span class="tv">${bulkPrice(item)}</span></button>`;
}

/**
 * The wholesaler (task 36, screen variant A "the stock in pick mode"): the request in one line, the grid of
 * the stocked items of his group (a tap — into the basket, again — out), "Итого X / N" with the heat the known
 * stolen and AI items will bring, −10% / −20% and "Отказать". "Продать" is the main action of the bar.
 */
function bulkPane(customer: WholesaleCustomer): string {
  const items = bulkStock(state, customer);
  const head = `<div class="thead"><div><span class="cname">${customerName(customer)}</span><span class="kind bulk">${t('bulk.head', { group: t(`bulk.groups.${customer.grp}`), n: `<b class="price">${customer.bud}</b>` })}</span></div></div>`;
  if (!items.length) {
    return head + `<div class="hint">${t('bulk.noStock')}</div>`;
  }
  const cart = cartItems(state, customer);
  const total = cartTotal(cart, customer.off);
  const heat = cart.filter(item => item.k.serial && item.stolen).length + 2 * cart.filter(showsInfection).length;
  const discounts = WHOLESALE.discounts.map(off => {
    const on = customer.off === off;
    return `<button class="btn disc ${on ? 'on' : ''}" data-a="disc" data-v="${off}" aria-pressed="${on}" ${disabledIf(!canSetDiscount(state, customer, on ? 0 : off))}>−${off}%</button>`;
  }).join('');
  const refuse = barAction(state, actor, 'deal', barContext()) === 'refuse' ? '' : `<button class="btn" data-a="refuse">${t('bulk.refuse')}</button>`;
  return head + `<div class="shelf stock bulk-grid">${items.map(item => bulkTile(customer, item)).join('')}</div>
    <div class="bulk-total"><span class="hint">${t('bulk.total', { x: `<b class="price ${cart.length ? 'm-action' : ''}">${total}</b>`, n: `<b class="price">${customer.bud}</b>` })}</span>${heat ? `<span class="m-risk">${t('bulk.heat', { n: heat })}</span>` : ''}</div>
    <div class="acts bulk-acts">${discounts}${refuse}</div>
    <div class="hint note">${t('bulk.asIs', { share: Math.round(WHOLESALE.priceShare * 100), max: WHOLESALE.maxItems })}</div>`;
}

function dealPane(): string {
  if (state.phase === 'evening') {
    return state.where === 'junk' ? junkyardPane() : eveningPane();
  }
  const customer = state.cust;
  if (!customer || actor.phase !== 'idle') {
    return emptyCounterPane();
  }
  if (customer.kind === 'rent') {
    return rentPane(customer);
  }
  if (customer.kind === 'bulk') {
    return bulkPane(customer);
  }
  const body = customer.kind === 'sell' ? sellerPane(customer) : buyerPane(customer);
  return customerHeader(customer) + body;
}

/* =====================================================================
   Stock (pane) and the workbench window (V2.3)
   ===================================================================== */

const isStockFilter = (value: string | undefined): value is StockFilter => (STOCK_FILTERS as readonly (string | undefined)[]).includes(value);

/** Filter chips: one tap, the chosen one lit; an empty category is dim but stays where it is. */
function filterChips(): string {
  const chips = STOCK_FILTERS.map(filter => {
    const count = filterStock(state.inv, filter).length;
    const on = ui.filter === filter;
    const tone = filter === 'stolen' ? 'm-risk' : '';
    return `<button class="fchip ${on ? 'on' : ''} ${count ? tone : 'm-inactive'}" data-a="filter" data-v="${filter}" aria-pressed="${on}" ${disabledIf(!count && !on)}>${t(`stock.filters.${filter}`)} <span class="cnt hint">${count}</span></button>`;
  }).join('');
  return `<div class="chips" role="group" aria-label="${t('stock.filtersLabel')}">${chips}</div>`;
}

/** A shelf tile: the one item tile (task 35), a tap opens the workbench. */
const stockTile = (item: Item): string => itemTile(item, 'sel', ui.sel === item.uid);

function inventoryPane(): string {
  if (!state.inv.length) {
    return `<div class="hint">${t('stock.empty')}</div>`;
  }
  const items = filterStock(state.inv, ui.filter);
  const shelf = items.length ? `<div class="shelf stock">${items.map(stockTile).join('')}</div>` : `<div class="hint">${t('stock.emptyFilter')}</div>`;
  return `${filterChips()}${shelf}${stockLegend(state.inv)}`;
}

function benchButton(action: keyof typeof RU.stock.actions, enabled: boolean): string {
  const cost = BENCH_COST[action];
  return `<button class="btn" data-a="bench" data-v="${action}" ${enabled && state.parts >= cost ? '' : 'disabled'}><span>${t(`stock.actions.${action}`)}</span><span class="price">${cost}⚙</span></button>`;
}

/** The customer at the counter, on top of the bench: mini portrait and the request in one line. */
function benchCustomer(): string {
  const customer = state.cust;
  if (!customer || actor.phase !== 'idle' || state.phase !== 'shop') {
    return '';
  }
  let line: string;
  if (customer.kind === 'buy') {
    line = t('stock.wants', { item: `<b>${itemName(customer.want)}</b>` });
  } else if (customer.kind === 'sell') {
    line = t('stock.sells', { item: itemName(customer.item.t), ask: customer.ask });
  } else if (customer.kind === 'bulk') {
    line = t('bulk.wants', { group: t(`bulk.groups.${customer.grp}`), n: customer.bud });
  } else {
    line = t('stock.collects', { amount: state.owed });
  }
  return `<div class="bench-cust"><canvas class="face" width="24" height="24" data-face="${customer.seed}" aria-hidden="true"></canvas><div class="bc-text"><span class="cname">${customerName(customer)}</span><span class="bc-line">${line}</span></div></div>`;
}

function benchOfferButton(item: Item): string {
  const offer = benchOffer(state, item, actor.phase === 'idle');
  if (offer === 'none') {
    return '';
  }
  return offer === 'ready'
    ? `<button class="btn pri bench-offer" data-a="offerbench" data-v="${item.uid}">${t('stock.offer')}</button>`
    : `<button class="btn bench-offer" disabled>${t('stock.shown')}</button>`;
}

function benchBody(item: Item): string {
  return `${benchCustomer()}
    <div class="card bench-card">${iconCanvas(item.t, 'bigico', showsInfection(item))}<div class="bench-info"><div class="hint">${t('stock.estimate')} ${approx(estimatedValue(item))} ${t('unit.cr')}</div>${itemTags(item)}</div></div>
    ${benchOfferButton(item)}
    <div class="bgrid">${benchButton('diag', !isFullyKnown(item))}${benchButton('repair', item.cond < 100)}
    ${benchButton('fix', item.k.flaw && item.defect)}${benchButton('purge', item.k.flaw && item.infected)}
    ${benchButton('wipe', item.k.serial && item.stolen)}
    <button class="btn" data-a="bench" data-v="scrap" ${disabledIf(isOnCounter(state, item))}><span>${t('stock.actions.scrap')}</span><span class="price">+${scrapValue(item)}⚙</span></button></div>
    <div class="hint note">${t('stock.wipeNote')}</div>`;
}

/** ‹ n of total ›: pages through the filtered stock without closing the window. */
function benchArrows(order: number[], uid: number): string {
  const nav = benchNav(order, uid);
  const arrow = (target: number | null, glyph: string, label: string): string =>
    `<button class="btn bench-arrow" data-a="benchnav" data-v="${target ?? ''}" aria-label="${label}" ${disabledIf(target === null)}>${glyph}</button>`;
  return `${arrow(nav.prev, '‹', t('stock.prev'))}<span class="bench-pos hint">${t('stock.position', { n: nav.n, total: nav.total })}</span>${arrow(nav.next, '›', t('stock.next'))}`;
}

/** What the open bench shows: the item and the order it pages through (to find the next one when the item is gone). */
const bench = { uid: null as number | null, order: [] as number[] };

function benchSpec(item: Item): WindowSpec {
  bench.uid = item.uid;
  bench.order = benchOrder(state.inv, ui.filter, item.uid);
  return {
    id: 'bench',
    // the item's name is the title: one line less on an iPhone SE
    title: itemName(item.t),
    cover: true,
    // Mac: the bench took the stock's place in the window, the game goes on under it
    modal: !isDesk(),
    body: benchBody(item),
    buttons: (isDesk() ? `<button class="btn bench-back" data-a="benchback">${t('stock.back')}</button>` : '') + benchArrows(bench.order, item.uid),
    onClose: reason => {
      ui.sel = null;
      bench.uid = null;
      // closed by the player: the tile loses its highlight (a close by code is followed by a render anyway)
      if (reason === 'close' || reason === 'outside' || reason === 'escape') {
        renderPane();
      }
    },
  };
}

function openBench(uid: number): void {
  const item = findItem(state, uid);
  if (!item) {
    return;
  }
  showWindow(benchSpec(item));
  // after showWindow: the bench it replaces clears the selection as it closes
  ui.sel = uid;
}

/**
 * Keeps the open bench in step with the game after any action: the same item redrawn in place,
 * or, if it is gone, the next one of the order it showed (else the previous one), or the window closes.
 */
function refreshBench(): void {
  if (!isWindowOpen('bench')) {
    return;
  }
  let item = findItem(state, ui.sel);
  if (!item && bench.uid !== null) {
    const next = successor(bench.order, bench.uid, state.inv);
    item = next === null ? undefined : findItem(state, next);
  }
  if (!item) {
    closeWindow('code');
    return;
  }
  ui.sel = item.uid;
  updateWindow(benchSpec(item));
}

/* =====================================================================
   Craft pane
   ===================================================================== */

function recipeRow(recipe: Recipe, index: number): string {
  const parts = recipeNeeds(recipe)
    .map(([type, count]) => `<span class="${availableOfType(state, type).length >= count ? 'm-ok' : 'm-inactive'}">${itemName(type)} ×${count}</span>`)
    .join(' + ');
  const partsClass = state.parts >= recipe.parts ? 'm-ok' : 'm-inactive';
  return `<div class="recipe">${iconCanvas(recipe.out)}<div class="rb"><div class="rn">${itemName(recipe.out)}</div><div class="need">${parts} + <span class="${partsClass}">${recipe.parts}⚙</span> · ${approx(ITEM_TYPES[recipe.out].basePrice)} ${t('unit.cr')}</div></div>
    <button class="btn" data-a="craft" data-v="${index}" ${canCraft(state, recipe) ? '' : 'disabled'}>${t('craft.build')}</button></div>`;
}

function craftPane(): string {
  return `<div class="recipes">${RECIPES.map(recipeRow).join('')}</div>
    <div class="hint note" style="margin:8px 0">${t('craft.note')}</div>
    <button class="btn" data-a="parts" ${state.credits >= SUPPLIER.price ? '' : 'disabled'} style="width:100%">${t('craft.order', { n: SUPPLIER.parts, price: SUPPLIER.price })}</button>`;
}

/* =====================================================================
   Render
   ===================================================================== */

const PANES: Record<Tab, () => string> = { deal: dealPane, inv: inventoryPane, craft: craftPane };

/* ---------- the Mac layout (V2.4): no pane, its tabs open as mini windows over the scene ---------- */

/** html.desk: a mouse and a wide window (DESK_QUERY); set by trackDesk(). */
const isDesk = (): boolean => document.documentElement.classList.contains('desk');

/** A move asked for the pane window to open (a tab, a hotspot, a customer called): renderPane opens it. */
let wantPane = false;

/** Goes to a tab: on a phone the pane switches, on a Mac its window opens (or shows the tab). */
function showTab(tab: Tab): void {
  ui.tab = tab;
  if (isDesk()) {
    wantPane = true;
  }
}

/** The tab the action bar follows: on a Mac with no tab window open the scene itself is the counter. */
const viewTab = (): Tab => (isDesk() && !isWindowOpen('pane') ? 'deal' : ui.tab);

function paneSpec(html: string): WindowSpec {
  return {
    id: 'pane',
    title: tabLabels().find(([tab]) => tab === ui.tab)?.[1] ?? '',
    body: `<div class="pane-body">${html}</div>`,
    modal: false,
    // closed by the player: the action bar is back to the counter (viewTab)
    onClose: reason => {
      if (reason === 'close' || reason === 'outside' || reason === 'escape') {
        renderActionBar();
      }
    },
  };
}

export function renderPane(): void {
  const pane = byId('pane');
  const scrollTop = pane.scrollTop;
  // the bench first: when its item is gone it moves on (ui.sel), and the shelf lights the new tile
  refreshBench();
  const html = (PANES[ui.tab] || dealPane)();
  if (isDesk()) {
    pane.innerHTML = '';
    if (isWindowOpen('pane')) {
      updateWindow(paneSpec(html));
    } else if (wantPane) {
      showWindow(paneSpec(html));
    }
  } else {
    pane.innerHTML = html;
    pane.scrollTop = scrollTop;
  }
  wantPane = false;
  renderActionBar();
  paintIcons();
  updateChanceMeter();
}

/** What the action bar rules need from the screen: the morning, the Mac layout. */
const barContext = (): BarContext => ({ morning: ui.morning, desk: isDesk() });

/** Main actions that read the price box. */
const PRICE_ACTIONS = new Set(['offer', 'ask']);

/** The action bar above the HUD: the screen's one main button, a dim hint, or nothing after the end. */
function renderActionBar(): void {
  const bar = byId('actionbar');
  const main = mainAction(state, actor, viewTab(), barContext());
  bar.hidden = main.kind === 'none';
  if (main.kind === 'button') {
    let action = main.action;
    let value = main.value !== undefined ? ` data-v="${main.value}"` : '';
    // Mac: the price is typed in the counter window; with it closed the button opens it first
    if (PRICE_ACTIONS.has(action) && !maybeById('offer')) {
      action = 'tab';
      value = ' data-v="deal"';
    }
    bar.innerHTML = `<button class="btn pri act-main ${main.tone === 'risk' ? 'act-risk' : ''}" data-a="${action}"${value}>${main.label}</button>`;
  } else if (main.kind === 'hint') {
    bar.innerHTML = `<div class="act-hint m-inactive">${main.text}</div>`;
  }
}

export function render(): void {
  renderHud();
  renderSceneOverlay();
  renderTabs();
  renderPane();
  // junkyard v3 has no drone: the ticking of the noise stays silent (the drone moves to patch C1)
  setJunkAmbience(0);
  saveGame();
  noteProgress();
}

/* =====================================================================
   Floating numbers and modals
   ===================================================================== */

/** Floating "+120" style number over the scene. */
function showFloatingText(text: string | Tx, color: string, star?: StarKind): void {
  const element = document.createElement('div');
  element.className = 'fx';
  element.textContent = textOf(text);
  if (star) {
    element.insertAdjacentHTML('afterbegin', starSvg(star, 4)); // 20×20 px, the size of the 16 px numbers
  }
  element.style.color = color;
  byId('stage').appendChild(element);
  setTimeout(() => element.remove(), FLOATING_TEXT_LIFETIME_MS);
}

/** Shows floating numbers queued by the game rules. */
function flushFeedback(): void {
  feedback.floats.splice(0).forEach(({ text, color, star }) => showFloatingText(text, color, star));
}

/** One window at a time; the Mac tab window (non-modal, the game itself) stays under a modal. */
function closeWindowForModal(): void {
  if (!isWindowOpen('pane')) {
    closeWindow('replaced');
  }
}

function openModal(title: string, body: string, buttons: string, footer = ''): void {
  closeWindowForModal();
  byId('mbox').innerHTML = `<h2>${title}</h2>${body}<div class="mbtns">${buttons}</div>${footer}`;
  byId('modal').classList.remove('sheet');
  byId('modal').hidden = false;
}

/** RU / EN in the ☰ menu (task 34): two buttons, the current one pressed. */
function langRow(): string {
  const buttons = LANGS.map(lang => `<button class="btn lang-btn" data-a="lang" data-v="${lang}" aria-pressed="${getLang() === lang}">${lang.toUpperCase()}</button>`).join('');
  return `<div class="menu-item lang-row" role="group" aria-label="${t('hud.lang')}"><span>${t('hud.lang')}</span>${buttons}</div>`;
}

/** ☰ menu: a sheet over the HUD with the current mode on top, the debt, modes (a new game starts there), music, sounds, the language and save. */
function openMenu(): void {
  byId('mbox').innerHTML = `<h2>${t(`mode.names.${state.mode}`)}</h2>
    <button class="btn menu-item" data-a="debt">${t('debt.menuDebt', { debt: state.debt })}</button>
    <button class="btn menu-item" data-a="modes">${t('mode.menuModes')}</button>
    <button class="btn menu-item" data-a="music" aria-pressed="${audio.on}">${t('hud.music')}: ${audio.on ? t('hud.on') : t('hud.off')}</button>
    <button class="btn menu-item" data-a="sounds" aria-pressed="${audio.sfx}">${t('hud.sounds')}: ${audio.sfx ? t('hud.on') : t('hud.off')}</button>
    ${langRow()}
    <button class="btn menu-item" data-a="savemenu">${t('hud.save')}</button>
    <div class="mbtns"><button class="btn" data-a="close">${t('hud.close')}</button></div>`;
  closeWindowForModal();
  byId('modal').classList.add('sheet');
  byId('modal').hidden = false;
}

/**
 * Opens a window of the component (V2.2). One window at a time: the modal closes and is emptied,
 * so no stale content (the save window's fields) stays in the hidden markup.
 */
function showWindow(spec: WindowSpec): void {
  closeModal();
  byId('mbox').innerHTML = '';
  openWindow(spec);
}

function closeModal(): void {
  byId('modal').hidden = true;
}

/** The final window: the ending's title and line, the totals; after it only a new game. */
export function showEnding(): void {
  if (!state.over) {
    return;
  }
  const ending = state.ending ?? 'evicted';
  const totals = t('debt.totals', { day: state.day, credits: state.credits, debt: state.debt });
  openModal(t(`ending.${ending}.title`), `<p>${t(`ending.${ending}.line`)}</p><p class="hint">${totals}</p>`,
    `<button class="btn pri" data-a="newgame-yes">${t('debt.newGame')}</button>`);
}

/** "+4" / "−2" with a real minus sign. */
const signed = (n: number): string => (n > 0 ? '+' : '−') + Math.abs(n);

/** Morning window (task 16): "Ожидается клиентов: N" and the reasons it differs from a usual day, in `wear`. */
function expectedCustomers(): string {
  const today = customersToday(state);
  const time = formatHour(openingHour(state));
  const reasons = today.reasons
    .map(reason => `<li class="m-wear">${t(`day.reasons.${reason.key}`, { time })} (${signed(reason.n)})</li>`)
    .join('');
  return `<p class="expect">${t('day.expected', { n: `<b class="rn">${today.count}</b>` })}</p>${reasons ? `<ul class="reasons">${reasons}</ul>` : ''}`;
}

function showMorningReport(report: MorningReport): void {
  if (state.over) {
    showEnding();
    return;
  }
  const lines = report.events.map(event => `<li>${textOf(event)}</li>`);
  if (report.expenses) {
    const bills = expenseLines(report.expenses, state.debt);
    lines.push(`<li>${textOf(bills.paid)}</li>`);
    if (bills.shortfall && report.expenses.toDebt) {
      lines.push(`<li class="m-risk">${textOf(bills.shortfall)}</li>`); // short of money: onto the debt
    } else if (bills.shortfall) {
      lines.push(`<li>${textOf(bills.shortfall)}</li>`); // the seat is bought: nothing onto the debt
    }
  }
  const body = `${expectedCustomers()}<ul>${lines.join('')}</ul>`;
  // task 29: one button for the morning, "Открыть лавку" in the action bar (it closes the window and
  // calls the first customer); the window has only ✕, a tap past it only hides it
  ui.morning = true;
  // V2.2: the first window on the window component (a sheet on a phone, a mini window on a Mac)
  showWindow({
    id: 'morning',
    title: t('day.morningTitle', { day: state.day }),
    body,
    liveBar: true,
  });
}

/** Early payment buttons: the fixed steps and "everything you have" (up to the debt). */
function earlyButtons(): string {
  const all = Math.min(state.credits, state.debt);
  const steps = DEBT.earlySteps
    .map(step => `<button class="btn" data-a="early" data-v="${step}" ${disabledIf(state.over || state.debt === 0 || state.credits < Math.min(step, state.debt))}>+${step}</button>`)
    .join('');
  return `${steps}<button class="btn" data-a="early" data-v="all" ${disabledIf(state.over || all <= 0)}>${t('debt.everything')} · ${all}</button>`;
}

function seatBlock(): string {
  if (state.seat) {
    return `<p class="m-ok">${t('debt.seatOwned', { shuttle: state.shuttleDay })}</p>`;
  }
  const price = seatPrice(state.day);
  const note = state.debt > 0 ? `<p class="hint m-inactive">${t('debt.seatNeedsZero')}</p>` : '';
  return `<p class="hint">${t('debt.seatPrice', { price, perDay: DEBT.seatPerDay, shuttle: state.shuttleDay })}</p>${note}
    <button class="btn pri" data-a="seat" style="width:100%" ${disabledIf(!canBuySeat(state))}>${t('debt.seatBuy')} · ${money(price)}</button>`;
}

/** Debt window (HUD payment stat or ☰): the debt left, the next payment, early payments, the shuttle seat. */
function openDebt(): void {
  const payment = state.debt > 0
    ? `<span>${t('debt.nextPayment')}</span><span class="price">${money(state.owed)}</span>
      <span>${t('debt.when')}</span><span>${t('debt.paymentDay', { day: state.nextDue, days: tx('plural.days', { n: Math.max(0, state.nextDue - state.day) }) })}</span>`
    : `<span>${t('debt.nextPayment')}</span><span>${t('debt.noPayments')}</span>`;
  openModal(t('debt.windowTitle'), `<div class="debt"><div class="rows">
      <span>${t('debt.debtLeft')}</span><span class="price"><b>${money(state.debt)}</b></span>
      ${payment}
      <span>${t('debt.youHave')}</span><span class="price">${money(state.credits)}</span></div>
    ${state.debt > 0 ? `<h3>${t('debt.early')}</h3><p class="hint">${t('debt.earlyHint')}</p><div class="early">${earlyButtons()}</div>` : ''}
    ${hasShuttle(state) ? `<h3>${t('debt.seatTitle')}</h3>${seatBlock()}` : ''}</div>`, closeButton());
}

/** Buying the seat cannot be undone: ask first. */
function confirmSeat(): void {
  openModal(t('debt.seatConfirmTitle'), `<p>${t('debt.seatConfirmText', { price: seatPrice(state.day) })}</p>`,
    `<button class="btn pri" data-a="seat-yes">${t('debt.seatConfirmYes')}</button><button class="btn" data-a="debt">${t('debt.seatConfirmNo')}</button>`);
}

function openSaveMenu(): void {
  openModal(t('hud.save'), `<p class="hint" style="margin:0">${t('save.about')}</p>
      <label for="savecode">${t('mode.saveCode', { mode: t(`mode.names.${state.mode}`), day: state.day, credits: state.credits })}</label><textarea id="savecode" readonly placeholder="${t('save.preparing')}"></textarea>
      <div class="mbtns"><button class="btn pri" data-a="copysave">${t('save.copy')}</button><button class="btn" data-a="savefile">${t('save.download')}</button></div>
      <label for="loadcode">${t('save.loadLabel')}</label><textarea id="loadcode" placeholder="${t('save.loadPlaceholder')}"></textarea>
      <div class="mbtns"><button class="btn" data-a="loadfile">${t('save.upload')}</button></div>
      <input type="file" id="loadfilepick" accept=".txt,text/plain" hidden>
      <div id="savemsg" class="hint"></div>`,
    `<button class="btn alt" data-a="loadsave">${t('save.load')}</button><button class="btn" data-a="close">${t('hud.close')}</button>`,
    `<div class="version">${VERSION_LABEL}</div>`,
  );
  // DC2 is compressed asynchronously: the code arrives a moment after the window
  const game = state;
  void exportSaveCode(game).then(code => {
    const textarea = maybeById<HTMLTextAreaElement>('savecode');
    if (textarea && state === game) {
      textarea.value = code;
    }
  });
}

/** "Скачать файлом": the save code as a .txt file (the same code as in the box). */
async function downloadSaveFile(): Promise<void> {
  const code = await exportSaveCode(state);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
  link.download = `dark-counter-${state.mode}-day${state.day}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** "Загрузить из файла": the chosen file's text goes into the load box and is loaded. */
async function loadSaveFile(file: File | undefined): Promise<void> {
  try {
    byId<HTMLTextAreaElement>('loadcode').value = file ? (await file.text()).trim() : '';
  } catch {
    showSaveError(t('save.fileUnread'));
    return;
  }
  await loadSaveCode();
}

function showSaveError(text: string): void {
  byId('savemsg').textContent = text;
  byId('savemsg').classList.add('m-risk');
}

function copySaveCode(): void {
  const textarea = byId<HTMLTextAreaElement>('savecode');
  const selectForManualCopy = () => {
    textarea.focus();
    textarea.select();
    byId('savemsg').textContent = t('save.selectManually');
  };
  try {
    navigator.clipboard.writeText(textarea.value).then(() => {
      byId('savemsg').textContent = t('save.copied');
    }, selectForManualCopy);
  } catch (err) {
    selectForManualCopy();
  }
}

/** Loads the code from the load box (DC2 or DC1); a rejected code keeps the window open. */
async function loadSaveCode(): Promise<void> {
  const loaded = await importSaveCode(byId<HTMLTextAreaElement>('loadcode').value);
  if (!loaded) {
    showSaveError(t('save.badCode'));
    return;
  }
  // the current game is already in its slot (render saves after every action);
  // the code goes into the slot of its own mode, and the game switches to that mode
  enterGame(loaded);
  addLog(state, tx('log.loaded', { day: state.day, credits: state.credits }));
  closeModal();
  render();
}

function openLog(): void {
  openModal(t('log.title'), `<ul>${state.log.map(line => `<li>${logLine(line)}</li>`).join('')}</ul>`, closeButton());
}

/* =====================================================================
   Game modes: the mode screen, slots, the player profile
   ===================================================================== */

/** Player profile; loaded by startGame(). */
let profile: Profile = loadProfile(null);

/** Puts the actor where the loaded game has it. */
function syncActor(): void {
  if (state.cust) {
    actorAtCounter(state.cust.seed);
  } else {
    actorReset();
  }
}

/** Makes a game the current one: its mode becomes "last" in the profile. */
function enterGame(game: GameState): void {
  setState(game);
  persistence.enabled = true;
  ui.sel = null;
  ui.tab = 'deal';
  syncActor();
  rememberMode();
}

function rememberMode(): void {
  if (profile.last !== state.mode) {
    profile.last = state.mode;
    saveProfile(profile);
  }
}

/** Endings go into the profile; a closed debt in calm counts as 'paid'. */
function noteProgress(): void {
  if (!persistence.enabled) {
    return;
  }
  const fresh = (state.ending && recordEnding(profile, state.mode, state.ending))
    || (isDebtClosed(state) && recordEnding(profile, state.mode, 'paid'));
  if (fresh) {
    saveProfile(profile);
  }
}

/** The game in a mode's slot; the current game is read live (its slot may lag a render behind). */
function gameIn(mode: Mode): GameState | null {
  if (mode === state.mode) {
    return persistence.enabled ? state : null;
  }
  return readSlot(mode);
}

function modeStatus(game: GameState | null): string {
  if (!game) {
    return '';
  }
  if (game.over) {
    return t('mode.finished', { ending: t(`ending.${game.ending ?? 'evicted'}.title`), day: game.day });
  }
  if (game.mode === 'calm' && game.debt === 0) {
    return t('mode.paidOff', { day: game.day });
  }
  return t('mode.progress', { day: game.day, debt: game.debt });
}

function modeCard(mode: Mode): string {
  const name = `<span class="mode-name">${t(`mode.names.${mode}`)}</span>`;
  const about = `<p class="hint">${t(`mode.about.${mode}`)}</p>`;
  if (!isPlayable(profile, mode)) {
    return `<div class="mode-card m-inactive">${name}${about}<p class="mode-lock">${iconSvg('lock')}${t('mode.locked')}</p></div>`;
  }
  const game = gameIn(mode);
  const current = mode === state.mode && persistence.enabled ? ` <span class="tag">${t('mode.current')}</span>` : '';
  let buttons: string;
  if (!game) {
    buttons = `<button class="btn pri" data-a="mode-go" data-v="${mode}">${t('mode.start')}</button>`;
  } else if (game.over) {
    buttons = `<button class="btn pri" data-a="mode-reset" data-v="${mode}">${t('mode.restart')}</button>`;
  } else {
    buttons = `<button class="btn pri" data-a="mode-go" data-v="${mode}">${t('mode.continue')}</button>`
      + `<button class="btn" data-a="mode-reset" data-v="${mode}">${t('mode.restart')}</button>`;
  }
  const status = game ? `<p class="mode-status">${modeStatus(game)}</p>` : '';
  return `<div class="mode-card"><div>${name}${current}</div>${about}${status}<div class="mode-btns">${buttons}</div></div>`;
}

/** Mode screen: on the first launch (no close button) and from ☰ "Режимы" (a new game starts there). */
function openModes(): void {
  const close = persistence.enabled ? `<button class="btn" data-a="close">${t('mode.close')}</button>` : '';
  openModal(t('mode.screenTitle'), `<div class="modes">${MODES.map(modeCard).join('')}</div>`, close);
}

const isMode = (value: string | undefined): value is Mode => (MODES as readonly (string | undefined)[]).includes(value);

/** "Продолжить" / "Начать": switch to the mode's game, or start one there. */
function goToMode(mode: Mode): void {
  if (!isPlayable(profile, mode)) {
    return;
  }
  if (!persistence.enabled) {
    // first launch: the provisional story game behind the screen becomes the real one
    persistence.enabled = true;
    if (mode !== state.mode) {
      newGame(mode);
    }
    rememberMode();
  } else if (mode !== state.mode) {
    saveGame();
    const saved = readSlot(mode);
    if (saved) {
      enterGame(saved);
    } else {
      newGame(mode);
      rememberMode();
    }
  }
  closeModal();
  showEnding();
}

/** "Начать заново": a finished game restarts at once, a running one asks first. */
function askResetMode(mode: Mode): void {
  const game = gameIn(mode);
  if (!game || game.over) {
    resetMode(mode);
    return;
  }
  openModal(t('mode.resetTitle'), `<p>${t('mode.resetText', { mode: t(`mode.names.${mode}`) })}</p>`,
    `<button class="btn pri" data-a="mode-reset-yes" data-v="${mode}">${t('mode.resetYes')}</button>`
    + `<button class="btn" data-a="modes">${t('mode.resetNo')}</button>`);
}

function resetMode(mode: Mode): void {
  if (!isPlayable(profile, mode)) {
    return;
  }
  if (mode !== state.mode) {
    saveGame();
  }
  persistence.enabled = true;
  ui.sel = null;
  newGame(mode);
  rememberMode();
  closeModal();
}

/** calm: the debt has just been closed. "Продолжить" keeps the shop going without payments. */
function showDebtClosed(): void {
  const totals = t('debt.totals', { day: state.day, credits: state.credits, debt: state.debt });
  openModal(t('mode.paidTitle'), `<p>${t('mode.paidLine')}</p><p class="hint">${totals}</p>`,
    `<button class="btn pri" data-a="close">${t('mode.paidContinue')}</button><button class="btn" data-a="newgame-yes">${t('mode.paidNewGame')}</button>`);
}

/** The interface language: the profile's choice, else the system language. */
const wantedLang = (): Lang => profile.lang ?? detectLang(typeof navigator === 'undefined' ? undefined : navigator.language);

/** Switches the screen's language: the texts outside the render (page title, scene label, window frame); render() does the rest. */
function applyLang(lang: Lang): void {
  setLang(lang);
  document.documentElement.lang = lang;
  document.title = t('app.title');
  byId('scn').setAttribute('aria-label', t('app.scene'));
  labelWindowFrame();
}

/**
 * Launch: continue the last played mode (or any mode with a save) right away;
 * with no save at all, show the mode screen over a provisional story game.
 */
export function startGame(): void {
  profile = loadProfile();
  applyLang(wantedLang());
  setHotspotHints(!profile.tapped);
  const order: Mode[] = [profile.last, ...PLAYABLE_MODES.filter(mode => mode !== profile.last)];
  for (const mode of order) {
    const saved = isPlayable(profile, mode) ? readSlot(mode) : null;
    if (saved) {
      enterGame(saved);
      render();
      // a finished game opens on its final window
      showEnding();
      return;
    }
  }
  persistence.enabled = false;
  newGame('story');
  render();
  openModes();
}

/* =====================================================================
   Event handling
   ===================================================================== */

/** Returned by a handler when the screen must not be re-rendered. */
const NO_RENDER: unique symbol = Symbol('no-render');

type ActionHandler = (value: string | undefined) => void | typeof NO_RENDER;

const isTab = (value: string | undefined): value is Tab => value === 'deal' || value === 'inv' || value === 'craft';

const offerValue = (): number => {
  const input = maybeById<HTMLInputElement>('offer');
  return input ? readOffer(input) : 0;
};

/** data-a → handler(value). Every handler re-renders unless it returns NO_RENDER. */
const ACTIONS: Record<string, ActionHandler> = {
  // counter
  adj: value => {
    const input = byId<HTMLInputElement>('offer');
    input.value = String(Math.max(0, offerValue() + Number(value)));
    updateChanceMeter();
    return NO_RENDER;
  },
  call: () => {
    // the next one waits until the last figure has left the scene
    if (actor.phase === 'empty' && callNextCustomer(state, gameRng) && state.cust) {
      ui.morning = false;
      actorEnter(state.cust.seed);
      showTab('deal');
    }
  },
  insp: value => {
    if (isInspectCheck(value) && inspect(state, value)) {
      actor.scanStart = performance.now();
    }
  },
  offer: () => {
    selectItem(offerToSeller(state, offerValue(), gameRng));
  },
  accept: () => {
    selectItem(buyFromSeller(state));
  },
  refuse: () => customerLeaves(state),
  show: value => presentItem(state, Number(value)),
  ask: () => askBuyer(state, offerValue(), gameRng),
  take: () => sellToBuyer(state),
  // the wholesaler (task 36): the basket, the discount, the batch sold
  cart: value => {
    toggleCart(state, Number(value));
  },
  disc: value => {
    setDiscount(state, Number(value));
  },
  bulksell: () => {
    sellBatch(state);
  },
  closeshop: () => {
    closeShop(state);
    showTab('deal');
  },
  // rent
  rentpay: () => payRent(state),
  rentdefer: () => deferRent(state),
  rentitems: () => payWithCollateral(state),
  evict: () => {
    evict(state);
    showEnding();
  },
  // debt window: early payments (no confirmation, the rest is shown at once) and the shuttle seat
  debt: () => openDebt(),
  early: value => {
    payEarly(state, value === 'all' ? state.credits : Number(value));
    openDebt();
  },
  seat: () => {
    confirmSeat();
    return NO_RENDER;
  },
  'seat-yes': () => {
    buySeat(state);
    openDebt();
  },
  // tabs, inventory, crafting
  tab: value => {
    if (isTab(value)) {
      showTab(value);
    }
  },
  sel: value => openBench(Number(value)),
  filter: value => {
    if (isStockFilter(value)) {
      ui.filter = value;
    }
  },
  benchnav: value => {
    if (value && findItem(state, Number(value))) {
      ui.sel = Number(value);
    }
  },
  bench: value => useWorkbench(state, ui.sel, value ?? ''),
  // Mac: "‹ Склад" — the stock comes back in the window the bench took
  benchback: () => {
    closeWindow('code');
    showTab('inv');
  },
  // the buyer gets the item at once: the bench closes onto the counter, where the haggling is
  offerbench: value => {
    presentItem(state, Number(value));
    closeWindow('code');
    showTab('deal');
  },
  craft: value => {
    const built = craft(state, Number(value), gameRng);
    if (built) {
      ui.tab = 'inv';
      ui.filter = 'all';
      openBench(built.uid);
    }
  },
  parts: () => orderParts(state),
  // evening
  junk: () => {
    goToJunkyard(state, gameRng);
    showTab('deal');
  },
  dig: () => digAndShow(),
  // the backpack (task 35): a tap on a find opens its card, a second tap (or "Оставить") closes it
  pick: value => {
    backpack.pick = backpack.pick === Number(value) ? null : Number(value);
  },
  throw: value => {
    throwAway(state, Number(value));
    backpack.pick = null;
    playSfx('empty');
  },
  openpack: () => {
    const finds = state.junk ? backpackFinds(state.junk, state.inv) : [];
    const cheapest = [...finds].sort((a, b) => estimatedValue(a) - estimatedValue(b))[0];
    backpack.pick = cheapest?.uid ?? null;
  },
  leavefind: () => leaveWaiting(state),
  home: () => {
    backpack.pick = null;
    goHome(state);
    playSfx('home');
  },
  market: () => visitMarket(state),
  sleep: () => showMorningReport(sleepUntilMorning(state, gameRng)),
  // header & modals
  music: () => {
    toggleMusic();
    // the item lives in the menu: show the new state, keep the menu open
    openMenu();
  },
  sounds: () => {
    toggleSfx();
    openMenu();
  },
  // RU / EN (task 34): the choice goes into the profile, the screen is drawn again in the new language
  lang: value => {
    if (isLang(value)) {
      profile.lang = value;
      saveProfile(profile);
      applyLang(value);
    }
    openMenu();
  },
  menu: () => {
    openMenu();
    return NO_RENDER;
  },
  savemenu: () => {
    openSaveMenu();
    return NO_RENDER;
  },
  copysave: () => {
    copySaveCode();
    return NO_RENDER;
  },
  loadsave: () => {
    void loadSaveCode();
    return NO_RENDER;
  },
  savefile: () => {
    void downloadSaveFile();
    return NO_RENDER;
  },
  loadfile: () => {
    maybeById<HTMLInputElement>('loadfilepick')?.click();
    return NO_RENDER;
  },
  // the morning (task 29): the bar button closes the morning window and calls the first customer
  openshop: () => {
    if (isWindowOpen('morning')) {
      closeWindow('close');
    }
    ui.morning = false;
    return ACTIONS.call(undefined);
  },
  log: () => {
    openLog();
    return NO_RENDER;
  },
  // the top layer only: a modal over the Mac tab window leaves the window open
  close: () => {
    if (!byId('modal').hidden) {
      closeModal();
    } else {
      closeWindow('close');
    }
  },
  // after an ending or a closed debt: a new game in the same mode, no questions
  'newgame-yes': () => {
    closeModal();
    ui.sel = null;
    newGame(state.mode);
  },
  // modes
  modes: () => {
    openModes();
    return NO_RENDER;
  },
  'mode-go': value => {
    if (isMode(value)) {
      goToMode(value);
    }
  },
  'mode-reset': value => {
    if (isMode(value)) {
      askResetMode(value);
    }
  },
  'mode-reset-yes': value => {
    if (isMode(value)) {
      resetMode(value);
    }
  },
};

function onClick(event: MouseEvent): void {
  // a tap past the ☰ sheet closes it (other modals wait for their buttons)
  const modal = byId('modal');
  if (event.target === modal && modal.classList.contains('sheet')) {
    closeModal();
    return;
  }
  const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-a]') : null;
  if (!button || (button instanceof HTMLButtonElement && button.disabled)) {
    return;
  }
  runAction(button.dataset.a ?? '', button.dataset.v);
}

/** One action (a button's data-a / data-v, or a scene hotspot): the rule, then the screen follows it. */
function runAction(action: string, value: string | undefined): void {
  const handler = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  const debtBefore = state.debt;
  const modeBefore = state.mode;
  const game = state;
  const visitor = state.cust;
  const result = handler ? handler(value) : undefined;
  followGame(game, visitor);
  flushFeedback();
  if (isDebtClosed(state) && debtBefore > 0 && state.mode === modeBefore && !state.over) {
    showDebtClosed();
  }
  if (result === NO_RENDER) {
    return;
  }
  render();
}

/** Selects a new item on the shelf (a purchase), if there is one. */
function selectItem(item: Item | null): void {
  if (item) {
    ui.sel = item.uid;
  }
}

/**
 * The screen follows what a rule did to the game (the rules never touch the screen):
 * the visitor who left the counter walks out of the scene, an item gone from the shelf
 * (sold, taken by Grobov or the drone, scrapped) is no longer selected.
 * A new or loaded game sets up its own screen.
 */
function followGame(game: GameState, visitor: Customer | null): void {
  if (state !== game) {
    return;
  }
  if (visitor && !state.cust) {
    actor.phase = 'out';
    actor.seed = visitor.seed;
  }
  if (ui.sel !== null && !findItem(state, ui.sel)) {
    ui.sel = null;
  }
}

/** "Копать" (the bar or a tap on the heap): one dig, its sound, the shovel; the new finds light up in the backpack. */
function digAndShow(): void {
  const result = dig(state, gameRng);
  if (!result) {
    return;
  }
  backpack.pick = null;
  backpack.fresh = result.items.map(item => item.uid);
  playSfx('dig');
  playSfx(result.kind);
  playDigFx(result.kind);
}

/**
 * A tap on the scene: in the junkyard the heap digs, like "Копать" in the action bar;
 * in the shop a live hotspot (V2.1) runs the same action as its button.
 */
function onSceneCanvasClick(event: MouseEvent): void {
  if (state.where === 'junk') {
    if (state.junk && isOnHeap(event.clientX, event.clientY)) {
      const game = state;
      digAndShow();
      followGame(game, null);
      flushFeedback();
      render();
    }
    return;
  }
  const { x, y } = scenePoint(event.clientX, event.clientY);
  const spot = hitTest(x, y, state, actor);
  if (!spot?.action) {
    return;
  }
  pressHotspot(spot.id);
  if (spot.id === 'bell') {
    playSfx('bell');
  }
  if (recordHotspotTap(profile)) {
    saveProfile(profile);
    setHotspotHints(false);
  }
  runAction(spot.action.a, spot.action.v);
}

/** Mac: 1 / 2 / 3 open the counter, the stock, the crafting (like the hotspots), unless typing or a modal is up. */
const TAB_KEYS: Record<string, Tab> = { 1: 'deal', 2: 'inv', 3: 'craft' };

function deskTabKey(event: KeyboardEvent): boolean {
  const tab = Object.hasOwn(TAB_KEYS, event.key) ? TAB_KEYS[event.key] : null;
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (!tab || !isDesk() || typing || event.metaKey || event.ctrlKey || event.altKey || !byId('modal').hidden || isWindowOpen('morning')) {
    return false;
  }
  event.preventDefault();
  runAction('tab', tab);
  return true;
}

/** Enter in the price box submits the offer / ask; ← → page the open bench. */
function onKeyDown(event: KeyboardEvent): void {
  if (deskTabKey(event)) {
    return;
  }
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && isWindowOpen('bench')) {
    const arrow = document.querySelectorAll<HTMLButtonElement>('#winbtns .bench-arrow')[event.key === 'ArrowLeft' ? 0 : 1];
    if (arrow && !arrow.disabled) {
      event.preventDefault();
      arrow.click();
    }
    return;
  }
  if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.id === 'offer') {
    const submit = document.querySelector<HTMLElement>('[data-a="offer"],[data-a="ask"]');
    if (submit) {
      submit.click();
    }
  }
}

export function bindEvents(): void {
  initWindows();
  document.addEventListener('click', onClick);
  document.addEventListener('input', event => {
    if (event.target instanceof HTMLElement && event.target.id === 'offer') {
      updateChanceMeter();
    }
  });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('change', event => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'loadfilepick') {
      void loadSaveFile(event.target.files?.[0]);
    }
  });
  onSceneClick(onSceneCanvasClick);
  startSoundOnFirstTouch();
  trackKeyboard();
  trackDesk();
}

/**
 * The Mac layout (V2.4): with a mouse and a wide window the scene takes the whole browser window
 * at the largest whole scale (stageFit), centered; the action bar and the HUD lie over its bottom
 * edge, the pane is gone (its tabs open as mini windows). html.desk switches the CSS, #app gets
 * the box of the scene. Switching live (a window resized past 900px) re-renders the screen.
 */
function trackDesk(): void {
  const query = window.matchMedia(DESK_QUERY);
  const root = document.documentElement;
  const app = byId('app');
  const fit = (initial = false): void => {
    const desk = query.matches;
    const changed = !initial && desk !== root.classList.contains('desk');
    root.classList.toggle('desk', desk);
    if (desk) {
      const box = stageFit({ width: window.innerWidth, height: window.innerHeight });
      app.style.left = `${box.left}px`;
      app.style.top = `${box.top}px`;
      app.style.width = `${box.width}px`;
      app.style.height = `${box.height}px`;
    } else {
      ['left', 'top', 'width', 'height'].forEach(side => app.style.removeProperty(side));
    }
    if (changed) {
      // the tab window belongs to the Mac layout; the bench changes its kind (sheet / non-modal)
      if (isWindowOpen('pane') || isWindowOpen('bench')) {
        closeWindow('code');
      }
      render();
    }
    relayoutWindow();
  };
  // before startGame(): only the class and the box, the first render comes from the game
  fit(true);
  query.addEventListener('change', () => fit());
  window.addEventListener('resize', () => fit());
}

/**
 * Music and sounds are on by default, but browsers start sound only from a user gesture.
 * Listen to the first touches / key presses (pointerdown for a mouse,
 * touchend for iOS Safari) until the sound runs or the player turned both off.
 */
function startSoundOnFirstTouch(): void {
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  const onGesture = (): void => {
    if (startSoundOnGesture()) {
      events.forEach(type => document.removeEventListener(type, onGesture, true));
    }
  };
  events.forEach(type => document.addEventListener(type, onGesture, true));
}

/**
 * While the on-screen keyboard is open (price box): hide the HUD, keep the action bar (V1.6).
 * The page is sized to the visual viewport, so the bar sits right above the keyboard,
 * and the price box is scrolled into view inside the pane.
 */
function trackKeyboard(): void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return;
  }
  const root = document.documentElement;
  const update = (): void => {
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    // the keyboard takes far more than this; pinch zoom alone does not count (scale > 1)
    const keyboardOpen = typing && viewport.scale <= 1 && window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
    const wasOpen = root.classList.contains('kb-open');
    root.classList.toggle('kb-open', keyboardOpen);
    if (keyboardOpen) {
      root.style.setProperty('--kb-height', `${viewport.height}px`);
      root.style.setProperty('--kb-top', `${viewport.offsetTop}px`);
      if (!wasOpen && document.activeElement instanceof HTMLElement) {
        document.activeElement.scrollIntoView({ block: 'nearest' });
      }
    } else {
      root.style.removeProperty('--kb-height');
      root.style.removeProperty('--kb-top');
    }
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => requestAnimationFrame(update));
}
