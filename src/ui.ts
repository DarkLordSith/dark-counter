// =====================================================================
//  ui.ts — HTML rendering of the HUD, scene overlay, tabs and panes,
//  plus all click/keyboard handlers (buttons carry data-a="action").
// =====================================================================
import { barAction, chipIsNight, chipLines, mainAction } from './actionbar';
import { customersToday, formatHour, openingHour } from './day';
import { audio, playSfx, setJunkAmbience, startSoundOnGesture, toggleMusic, toggleSfx } from './audio';
import {
  ACTION_TEXT, BENCH_COST, DAY_TEXT, DEBT, JUNK, DEBT_TEXT, ENDING_TEXT, HAGGLE, HUD_TEXT, HUNCH_VERDICT_TEXT, ITEM_TYPES, JUNK_TEXT, MARKET, MAX_HEAT, MODES, MODE_TEXT,
  PLAYABLE_MODES, RECIPES, RENT, SAVE_TEXT, SUPPLIER,
} from './data';
import { byId, maybeById } from './dom';
import { iconSvg } from './icons';
import { closeWindow, initWindows, openWindow } from './window';
import type { WindowSpec } from './window';
import {
  askBuyer, availableOfType, buyFromSeller, buySeat, callNextCustomer, canBuySeat, canCraft, hasShuttle, isDebtClosed, canVisitMarket, closeShop,
  collateralHeatRelief, craft, customerLeaves, deferredDebt, deferRent, dig, digsPerVisit, estimatedValue, evict, feedback,
  canGoToJunkyard, digIsLate, goHome, goToJunkyard, hunchVerdict, junkVisitHours, noiseLevel, inspect, isFullyKnown, isInspectCheck, isLandlordDue, isOnCounter, isPresentedBuyer, itemName,
  nextRent, offerToSeller, orderParts, payEarly, payRent, payWithCollateral, perceivedChance, planCollateral, presentItem,
  expenseLines, recipeNeeds, scrapValue, seatPrice, sellToBuyer, showsInfection, sleepUntilMorning, useWorkbench, visitMarket,
} from './economy';
import type { CollateralPlan, MorningReport } from './economy';
import { isPlayable, loadProfile, recordEnding, saveProfile } from './profile';
import { isOnHeap, onSceneClick, paintIcons, playDigFx } from './scene';
import {
  actor, actorAtCounter, actorEnter, actorReset, addLog, exportSaveCode, findItem, importSaveCode, newGame, persistence, readSlot, saveGame, setState, state, ui,
} from './state';
import type { BuyerCustomer, Customer, GameState, InspectCheck, Item, ItemType, Mode, Profile, Recipe, RentCustomer, SellerCustomer, Tab } from './types';
import { daysRu, fill, roundTo10 } from './util';
import { VERSION_LABEL } from './version';
import { gameRng } from './rng';

/* =====================================================================
   Small HTML helpers
   ===================================================================== */

// Colors carry meaning only through the m-* classes (style.css → --m-* → MEANING in palette.ts).
const UNKNOWN = '<span class="m-unknown">?</span>';
const CLOSE_BUTTON = '<button class="btn pri" data-a="close">Закрыть</button>';
const FLOATING_TEXT_LIFETIME_MS = 1300;
/** Viewport shrink that means an on-screen keyboard, not a browser bar. */
const KEYBOARD_MIN_PX = 150;
const disabledIf = (condition: unknown): string => condition ? 'disabled' : '';

/**
 * "About N": the one place that writes the approximation sign. Public Pixel draws "~" as "∾"
 * and its "≈" is unreadable, so the sign is set in mono (.approx) and the number keeps its font.
 */
const approx = (value: string | number): string => `<span class="approx">~</span>${value}`;
const conditionText = (item: Item): string => item.k.cond ? item.cond + '%' : '?%';

function iconCanvas(type: ItemType, cssClass = '', infected = false): string {
  return `<canvas class="${cssClass}" width="28" height="16" data-ico="${type}" data-inf="${infected ? 1 : 0}"></canvas>`;
}

function itemTags(item: Item): string {
  const tags: string[] = [];
  tags.push(item.k.cond ? `<span class="tag ${item.cond < 40 ? 'm-wear' : ''}">${item.cond}%</span>` : '<span class="tag m-unknown">сост. ?</span>');
  if (item.k.serial) {
    tags.push(item.stolen ? '<span class="tag m-risk">краденое</span>' : '<span class="tag m-action">чистый №</span>');
  } else {
    tags.push('<span class="tag m-unknown">№ ?</span>');
  }
  if (item.k.flaw) {
    if (item.defect) {
      tags.push('<span class="tag m-wear">дефект</span>');
    }
    if (item.infected) {
      tags.push('<span class="tag m-risk">ИИ</span>');
    }
    if (!item.defect && !item.infected) {
      tags.push('<span class="tag m-action">начинка ок</span>');
    }
  } else {
    tags.push('<span class="tag m-unknown">начинка ?</span>');
  }
  return `<div class="tags">${tags.join('')}</div>`;
}

/** Colored corner dots on an inventory tile. */
/** Status marks on a shelf tile; the legend under the shelf uses the same ones. */
const DOT = {
  unknown: '<i class="d-unknown">?</i>',
  risk: '<i class="d-risk"></i>',
  wear: '<i class="d-wear"></i>',
};

function itemDots(item: Item): string {
  const dots: string[] = [];
  if (!isFullyKnown(item)) {
    dots.push(DOT.unknown);
  }
  if (item.k.serial && item.stolen) {
    dots.push(DOT.risk);
  }
  if (item.k.flaw && item.infected) {
    dots.push(DOT.risk);
  }
  if (item.k.flaw && item.defect) {
    dots.push(DOT.wear);
  }
  return `<span class="dots">${dots.join('')}</span>`;
}

/** Row of cells, the first `filled` of them lit (heat bar, patience pips). */
function meterCells(total: number, filled: number): string {
  return Array.from({ length: total }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
}

/* =====================================================================
   HUD, scene overlay, tabs
   ===================================================================== */

/** Interface language; the game is Russian for now, the strings are ready for RU/EN. */
const HUD = HUD_TEXT.ru;

/** One HUD stat: a small mono label above a pixel-font number (V1.4: one row on a 375 pt screen). */
const hudStat = (label: string, valueHtml: string, cssClass = ''): string =>
  `<span class="st ${cssClass}"><small>${label}</small>${valueHtml}</span>`;

/** Debt strings in the interface language. */
const DEBT_UI = DEBT_TEXT.ru;

/**
 * Weekly payment: days left go into the label ("платёж·3д"), so the number column stays narrow.
 * The stat is a button: it opens the debt window (early payments, the shuttle seat).
 */
function paymentStat(): string {
  const daysLeft = state.nextDue - state.day;
  const paying = state.debt > 0 && !state.over;
  const urgent = paying && (state.credits < state.owed && daysLeft <= 1 || state.deferred);
  // due today = "0д": same width as "6д" (the scene chip says "+ПЛАТЁЖ" on that day)
  const when = paying ? `·${Math.max(0, daysLeft)}${HUD.daysShort}` : '';
  const value = paying ? state.owed : '—';
  return `<button class="st st-btn ${urgent ? 'm-risk' : ''}" data-a="debt" aria-haspopup="dialog"><small>${HUD.payment}${when}</small><b>${value}</b></button>`;
}

/** Bottom bar: кр · день/60 · платёж · зап, then ☰. The wanted level is on the scene wall, music in the menu. */
function renderHud(): void {
  const menu = `<button class="ib" data-a="menu" aria-haspopup="dialog" aria-label="${HUD.menu}">${iconSvg('menu')}</button>`;
  byId('hud').innerHTML = `<div class="stats">${[
    hudStat(HUD.credits, `<b>${state.credits}</b>`),
    // the shuttle day goes into the label ("день/60"): the number column keeps two digits
    hudStat(hasShuttle(state) ? `${HUD.day}/${state.shuttleDay}` : HUD.day, `<b>${state.day}</b>`),
    paymentStat(),
    hudStat(HUD.parts, `<b>${state.parts}</b>`),
  ].join('')}</div>${menu}`;
}

/** Screen-reader text of the wanted-level meter drawn on the scene ("розыск 3 из 10"). */
const heatText = (): string => `${HUD.heat} ${state.heat} ${HUD.of} ${MAX_HEAT}`;

/** The log the ticker showed last: a different array means a new line (see renderSceneOverlay). */
let shownLog: string[] | null = null;

/** Speech bubble, queue chip and the log ticker ("call next" lives in the action bar since V1.5). */
export function renderSceneOverlay(): void {
  const customer = state.cust;
  const atCounter = actor.phase === 'idle' && customer;
  const bubble = byId('bubble');
  if (state.where === 'junk' && state.jmsg) {
    bubble.hidden = false;
    bubble.textContent = state.jmsg;
    bubble.classList.add('free');
  } else {
    bubble.classList.remove('free');
    bubble.hidden = !atCounter;
    if (atCounter) {
      bubble.textContent = customer.msg;
    }
  }
  // the time comes first; past midnight it reads as `wear` (time)
  const night = chipIsNight(state);
  byId('chip').innerHTML = chipLines(state).map((line, i) => `<span${i === 0 && night ? ' class="m-wear"' : ''}>${line}</span>`).join('');
  const ticker = byId('ticker');
  ticker.innerHTML = `<b>›</b> ${state.log[0] || ''}`;
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

function renderTabs(): void {
  const firstTab = state.phase === 'shop' ? 'ПРИЛАВОК' : state.where === 'junk' ? 'СВАЛКА' : 'ВЕЧЕР';
  const tabs: [Tab, string][] = [['deal', firstTab], ['inv', `СКЛАД · ${state.inv.length}`], ['craft', 'СБОРКА']];
  byId('tabs').innerHTML = tabs
    .map(([key, label]) => `<button class="tab ${ui.tab === key ? 'on' : ''}" data-a="tab" data-v="${key}">${label}</button>`)
    .join('');
}

/* =====================================================================
   Price input and chance meter
   ===================================================================== */

function priceRow(defaultPrice: number): string {
  return `<div class="pr"><button class="btn" data-a="adj" data-v="-50">−50</button><button class="btn" data-a="adj" data-v="-10">−10</button>
  <input id="offer" type="number" inputmode="numeric" min="0" step="10" value="${defaultPrice}" aria-label="Цена">
  <button class="btn" data-a="adj" data-v="10">+10</button><button class="btn" data-a="adj" data-v="50">+50</button></div>
  <div class="chance"><span>Чуйка</span><div class="cbar"><i id="cbar"></i></div><b id="cverdict" class="verdict">—</b><small id="cval">—</small></div>`;
}

const readOffer = (input: HTMLInputElement): number => Math.max(0, parseInt(input.value) || 0);

function updateChanceMeter(): void {
  const customer = state.cust;
  const input = maybeById<HTMLInputElement>('offer');
  if (!customer || !input || !maybeById('cval')) {
    return;
  }
  // the price box exists only for a seller or a buyer who was shown an item
  if (customer.kind === 'rent' || (customer.kind === 'buy' && !isPresentedBuyer(customer))) {
    return;
  }
  const chance = perceivedChance(customer, readOffer(input));
  byId('cverdict').textContent = HUNCH_VERDICT_TEXT.ru[hunchVerdict(chance)];
  byId('cval').innerHTML = chance >= 1 ? 'согласится' : chance <= 0 ? 'обидится' : approx(`${Math.round(chance * 100)}%`);
  byId('cbar').style.width = (chance * 100) + '%';
}

/* =====================================================================
   Deal pane
   ===================================================================== */

function option(action: string, disabled: boolean, title: string, description: string, side: string | number, sideClass = ''): string {
  return `<button class="opt" data-a="${action}" ${disabledIf(disabled)}><div><b>${title}</b><br><span>${description}</span></div><span${sideClass}>${side}</span></button>`;
}

/** Junkyard words (v2): the noise scale, the panel, the messages. */
const JUNK_UI = JUNK_TEXT.ru;
const DAY_UI = DAY_TEXT.ru;
const ACTION_UI = ACTION_TEXT.ru;
/** Cells of the noise scale: 10 cells for 0…100. */
const NOISE_CELLS = 10;

/** Noise as a scale plus a word, like the hunch verdict: тихо / слышно / громко / дрон рядом. From "громко" on it reads as risk. */
function noiseMeter(noise: number): string {
  const level = noiseLevel(noise);
  const word = JUNK_UI.levels[level];
  const filled = Math.round(noise / 100 * NOISE_CELLS);
  return `<div class="noise${level >= 2 ? ' loud' : ''}"><span>${JUNK_UI.noise}</span><div class="nbar">${meterCells(NOISE_CELLS, filled)}</div><b class="nword${level >= 2 ? ' m-risk' : ''}">${word}</b></div>`;
}

/** Time before "Копать" (task 16): the last dig before midnight, then each dig costs a customer tomorrow. Time reads as `wear`. */
function junkTimeNote(digsLeft: number): string {
  const lines: string[] = [];
  if (digsLeft > 0 && digIsLate(state)) {
    lines.push(JUNK_UI.pastMidnight);
  } else if (digsLeft > 0 && state.hours === JUNK.digHours) {
    lines.push(JUNK_UI.lastFree);
  }
  if (state.late > 0) {
    lines.push(fill(JUNK_UI.lateSoFar, { n: state.late * JUNK.lateCustomerLoss }));
  }
  return lines.map(line => `<div class="hint m-wear">${line}</div>`).join('');
}

function junkyardPane(): string {
  const visit = state.junk;
  if (!visit) {
    return '';
  }
  const total = visit.dp + visit.d;
  // "Копать" is the main action (the action bar), "Вернуться домой" is here until the digs run out — then it goes to the bar
  const homeButton = visit.d > 0 ? `<button class="btn" data-a="home">${ACTION_UI.home}</button>` : '';
  const homeHint = visit.d > 0 ? `<div class="hint">${JUNK_UI.homeHint}</div>` : '';
  return `${junkTimeNote(visit.d)}<div class="junk-stats"><span>${JUNK_UI.digsLeft}: <b class="rn">${visit.d}</b> ${HUD.of} ${total}</span><span>${JUNK_UI.depth} <b class="rn">${visit.dp}</b></span></div>
      ${noiseMeter(visit.n)}
      ${homeHint}
      ${homeButton}`;
}

function eveningPane(): string {
  return `<div class="hint" style="margin-bottom:8px">Лавка закрыта. Осталось часов: <b>${state.hours}</b>. Верстак и сборка работают бесплатно.</div>
    <div class="opts">
      ${option('junk', !canGoToJunkyard(state), JUNK_UI.title, fill(JUNK_UI.about, { hours: junkVisitHours(), dig: JUNK.digHours, digs: digsPerVisit(state) }), '→')}
      ${option('market', !canVisitMarket(state), 'Барахолка у шлюза', `${MARKET.hours} ч. ${MARKET.parts} запчастей за ${MARKET.price} кр. Раз за вечер.`, MARKET.price)}
    </div>
    <div class="hint note">«Спать» — кнопка внизу: закончить день. Ночью: платёж, рейды, заражение склада.</div>`;
}

function emptyCounterPane(): string {
  if (actor.phase === 'in') {
    return '<div class="hint">Подходит к прилавку…</div>';
  }
  if (actor.phase === 'out') {
    return '<div class="hint">Уходит…</div>';
  }
  if (state.over) {
    return '<div class="hint">Лавка опечатана.</div>';
  }
  if (state.slot >= state.cn && !isLandlordDue(state)) {
    return '<div class="hint">Очередь кончилась. Пора закрываться.</div>';
  }
  return '<div class="hint">Прилавок свободен. Зовите следующего, когда будете готовы. Пока можно разобрать склад.</div>';
}

function collateralDescription(plan: CollateralPlan): string {
  if (!plan.ok) {
    return 'Даже со всем складом не хватает.';
  }
  const goods = plan.items.length ? ' и ' + plan.items.map(item => itemName(item.t)).join(', ') : '';
  const heatNote = plan.hot ? ` <span class="m-action">Розыск −${collateralHeatRelief(state, plan)}.</span>` : '';
  return `Заберёт ${plan.cash} кр.${goods}. Сначала берёт краденое (за 50%), остальное за 60%, сдачи не даёт.${heatNote}`;
}

function rentPane(customer: RentCustomer): string {
  const plan = planCollateral(state);
  const canPay = state.credits >= state.owed;
  const deferText = state.deferred
    ? 'Вторую отсрочку Гробов не даст.'
    : fill(DEBT_UI.deferOption, { days: daysRu(RENT.deferDays), amount: deferredDebt(state) });
  const payText = fill(DEBT_UI.paymentOption, {
    debt: state.debt - state.owed,
    next: Math.min(nextRent(state), Math.max(0, state.debt - state.owed)),
    period: daysRu(DEBT.periodDays),
  });
  let html = `<div class="thead"><div><span class="cname">${customer.name}</span><span class="kind m-risk">за платежом</span></div></div>
    <div class="card" style="flex-direction:column;gap:2px"><div class="rows">
      <span>К оплате</span><span class="price"><b>${state.owed} кр.</b>${state.deferred ? ' <span class="m-risk">с пеней</span>' : ''}</span>
      <span>${DEBT_UI.debtLeft}</span><span class="price">${state.debt} кр.</span>
      <span>У вас</span><span class="price ${canPay ? 'm-action' : 'm-risk'}">${state.credits} кр.</span></div></div>
    <div class="opts" style="margin-top:8px">${rentOptions([
      ['rentpay', 'Заплатить', option('rentpay', !canPay, 'Заплатить', payText, state.owed, ' class="price"'), payText],
      ['rentdefer', 'Попросить отсрочку', option('rentdefer', state.deferred, 'Попросить отсрочку', deferText, '⧗'), deferText],
      ['rentitems', 'Отдать деньги и товар', option('rentitems', !(plan.ok && plan.items.length), 'Отдать деньги и товар', collateralDescription(plan), '⚖'), collateralDescription(plan)],
    ])}</div>`;
  return html;
}

/**
 * Grobov's options. The one the action bar shows (pay / defer / goods) leaves the list,
 * its explanation stays as a line on top; "Нечем платить" is only in the bar.
 */
function rentOptions(options: [action: string, title: string, html: string, description: string][]): string {
  const main = barAction(state, actor, 'deal');
  const chosen = options.find(([action]) => action === main);
  const note = chosen ? `<div class="hint note">«${chosen[1]}» — кнопка внизу. ${chosen[3]}</div>` : '';
  return note + options.filter(([action]) => action !== main).map(([, , html]) => html).join('');
}

function customerHeader(customer: SellerCustomer | BuyerCustomer): string {
  return `<div class="thead"><div><span class="cname">${customer.name}</span><span class="kind ${customer.kind}">${customer.kind === 'sell' ? 'продаёт' : 'покупает'}</span></div>
  <div class="pips" title="Терпение">${meterCells(customer.max, customer.pat)}</div></div>`;
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
  const serial = item.stolen ? '<span class="m-risk">спилен</span>' : '<span class="m-action">чистый</span>';
  const insides = item.infected ? '<span class="m-risk">ИИ</span>' : item.defect ? '<span class="m-wear">дефект</span>' : '<span class="m-action">ок</span>';
  const defaultOffer = Math.min(state.credits, roundTo10(customer.ask * HAGGLE.sellerDefaultOfferShare));
  return `<div class="card deal-item">${iconCanvas(item.t, 'midico', showsInfection(item))}<div class="di-body"><div class="rn">${itemName(item.t)}</div>
      <div class="facts">${fact(customer, 'cond', 'Сост.', 'Сканер: состояние', condition)}${fact(customer, 'serial', '№', 'Серийник: краденое или чистое', serial)}${fact(customer, 'flaw', 'Начинка', 'Диагностика: дефект, ИИ', insides)}</div></div></div>
    <div class="deal"><div class="ask">Просит <b class="price">${customer.ask}</b> кр. · оценка ${approx(estimatedValue(item))}</div>
      ${priceRow(defaultOffer)}
      <div class="acts"><button class="btn alt" data-a="accept" ${disabledIf(customer.ask > state.credits)}>За ${customer.ask}</button>
      <button class="btn" data-a="refuse">Отпустить</button></div></div>`;
}

function buyerPane(customer: BuyerCustomer): string {
  const matching = state.inv.filter(item => item.t === customer.want);
  let html = `<div class="ask want">Нужно: <b>${itemName(customer.want)}</b></div>`;
  if (!matching.length) {
    return html + '<div class="hint">На складе такого нет.</div>';
  }
  const tiles = matching.map(item => {
    const shown = customer.item && customer.item.uid === item.uid;
    return `<button class="tile ${shown ? 'on' : ''}" data-a="show" data-v="${item.uid}">${itemDots(item)}${iconCanvas(item.t, '', showsInfection(item))}<span>${conditionText(item)} · <span class="tv">${approx(estimatedValue(item))}</span></span></button>`;
  }).join('');
  // compact row tiles (V1.6): the price and the gut feeling fit an iPhone SE without scrolling
  html += `<div class="shelf pick">${tiles}</div>`;
  if (!isPresentedBuyer(customer)) {
    return html + '<div class="hint" style="margin:8px 0">Выложите товар на прилавок.</div><button class="btn" data-a="refuse" style="width:100%">Отпустить</button>';
  }
  return html + `<div class="deal"><div class="ask">Предлагает: <b class="price">${customer.offer}</b> кр.</div>${priceRow(roundTo10(customer.offer * HAGGLE.buyerDefaultAskShare))}
        <div class="acts"><button class="btn alt" data-a="take">За ${customer.offer}</button>
        <button class="btn" data-a="refuse">Отпустить</button></div></div>`;
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
  const body = customer.kind === 'sell' ? sellerPane(customer) : buyerPane(customer);
  return customerHeader(customer) + body;
}

/* =====================================================================
   Inventory pane (shelf + workbench)
   ===================================================================== */

function benchButton(action: string, label: string, enabled: boolean): string {
  const cost = BENCH_COST[action];
  return `<button class="btn" data-a="bench" data-v="${action}" ${enabled && state.parts >= cost ? '' : 'disabled'}><span>${label}</span><span class="price">${cost}⚙</span></button>`;
}

function workbench(item: Item): string {
  return `<div class="bench"><div class="card">${iconCanvas(item.t, 'bigico', showsInfection(item))}<div style="min-width:0"><div class="rn">${itemName(item.t)}</div><div class="hint">Оценка ${approx(estimatedValue(item))} кр.</div>${itemTags(item)}</div></div>
    <div class="bgrid">${benchButton('diag', 'Диагностика', !isFullyKnown(item))}${benchButton('repair', 'Ремонт +25%', item.cond < 100)}
    ${benchButton('fix', 'Убрать дефект', item.k.flaw && item.defect)}${benchButton('purge', 'Вычистить ИИ', item.k.flaw && item.infected)}
    ${benchButton('wipe', 'Перебить №', item.k.serial && item.stolen)}
    <button class="btn" data-a="bench" data-v="scrap" ${disabledIf(isOnCounter(state, item))}><span>Разобрать</span><span class="price">+${scrapValue(item)}⚙</span></button></div>
    <div class="hint note">Перебитый серийник: +1 к розыску.</div></div>`;
}

function inventoryPane(): string {
  if (!state.inv.length) {
    return '<div class="hint">Склад пуст. Покупайте у клиентов или копайте на свалке.</div>';
  }
  const tiles = state.inv
    .map(item => `<button class="tile ${ui.sel === item.uid ? 'on' : ''}" data-a="sel" data-v="${item.uid}">${itemDots(item)}${iconCanvas(item.t, '', showsInfection(item))}<span>${itemName(item.t)}</span><span class="tv">${conditionText(item)} · ${approx(estimatedValue(item))}</span></button>`)
    .join('');
  const html = `<div class="shelf">${tiles}</div>
  <div class="legend"><span>${DOT.unknown}не проверено</span><span>${DOT.risk}краденое / ИИ</span><span>${DOT.wear}дефект</span></div>`;
  const selected = findItem(state, ui.sel);
  return html + (selected ? workbench(selected) : '<div class="hint">Нажмите на предмет, чтобы открыть верстак.</div>');
}

/* =====================================================================
   Craft pane
   ===================================================================== */

function recipeRow(recipe: Recipe, index: number): string {
  const parts = recipeNeeds(recipe)
    .map(([type, count]) => `<span class="${availableOfType(state, type).length >= count ? 'm-ok' : 'm-inactive'}">${itemName(type)} ×${count}</span>`)
    .join(' + ');
  const partsClass = state.parts >= recipe.parts ? 'm-ok' : 'm-inactive';
  return `<div class="recipe">${iconCanvas(recipe.out)}<div class="rb"><div class="rn">${itemName(recipe.out)}</div><div class="need">${parts} + <span class="${partsClass}">${recipe.parts}⚙</span> · ${approx(ITEM_TYPES[recipe.out].basePrice)} кр.</div></div>
    <button class="btn" data-a="craft" data-v="${index}" ${canCraft(state, recipe) ? '' : 'disabled'}>Собрать</button></div>`;
}

function craftPane(): string {
  return `<div class="recipes">${RECIPES.map(recipeRow).join('')}</div>
    <div class="hint note" style="margin:8px 0">Сборка даёт новый серийник: краденые детали становятся чистыми. ИИ-заражение переносится.</div>
    <button class="btn" data-a="parts" ${state.credits >= SUPPLIER.price ? '' : 'disabled'} style="width:100%">Заказать ${SUPPLIER.parts} запчастей · ${SUPPLIER.price} кр.</button>`;
}

/* =====================================================================
   Render
   ===================================================================== */

const PANES: Record<Tab, () => string> = { deal: dealPane, inv: inventoryPane, craft: craftPane };

export function renderPane(): void {
  const pane = byId('pane');
  const scrollTop = pane.scrollTop;
  pane.innerHTML = (PANES[ui.tab] || dealPane)();
  pane.scrollTop = scrollTop;
  renderActionBar();
  paintIcons();
  updateChanceMeter();
}

/** The action bar above the HUD: the screen's one main button, a dim hint, or nothing after the end. */
function renderActionBar(): void {
  const bar = byId('actionbar');
  const main = mainAction(state, actor, ui.tab);
  bar.hidden = main.kind === 'none';
  if (main.kind === 'button') {
    const value = main.value !== undefined ? ` data-v="${main.value}"` : '';
    bar.innerHTML = `<button class="btn pri act-main ${main.tone === 'risk' ? 'act-risk' : ''}" data-a="${main.action}"${value}>${main.label}</button>`;
  } else if (main.kind === 'hint') {
    bar.innerHTML = `<div class="act-hint m-inactive">${main.text}</div>`;
  }
}

export function render(): void {
  renderHud();
  renderSceneOverlay();
  renderTabs();
  renderPane();
  // junkyard ambience follows the state: ticks from "громко" on, silent at home or after the drone
  setJunkAmbience(state.where === 'junk' && state.junk && !state.junk.run ? noiseLevel(state.junk.n) : 0);
  saveGame();
  noteProgress();
}

/* =====================================================================
   Floating numbers and modals
   ===================================================================== */

/** Floating "+120" style number over the scene. */
function showFloatingText(text: string, color: string): void {
  const element = document.createElement('div');
  element.className = 'fx';
  element.textContent = text;
  element.style.color = color;
  byId('stage').appendChild(element);
  setTimeout(() => element.remove(), FLOATING_TEXT_LIFETIME_MS);
}

/** Shows floating numbers queued by the game rules. */
function flushFeedback(): void {
  feedback.floats.splice(0).forEach(({ text, color }) => showFloatingText(text, color));
}

function openModal(title: string, body: string, buttons: string, footer = ''): void {
  closeWindow('replaced'); // one window at a time
  byId('mbox').innerHTML = `<h2>${title}</h2>${body}<div class="mbtns">${buttons}</div>${footer}`;
  byId('modal').classList.remove('sheet');
  byId('modal').hidden = false;
}

/** ☰ menu: a sheet over the HUD with the current mode on top, the debt, modes (a new game starts there), music, sounds and save (later: RU/EN). */
function openMenu(): void {
  byId('mbox').innerHTML = `<h2>${MODE_UI.names[state.mode]}</h2>
    <button class="btn menu-item" data-a="debt">${fill(DEBT_UI.menuDebt, { debt: state.debt })}</button>
    <button class="btn menu-item" data-a="modes">${MODE_UI.menuModes}</button>
    <button class="btn menu-item" data-a="music" aria-pressed="${audio.on}">${HUD.music}: ${audio.on ? HUD.on : HUD.off}</button>
    <button class="btn menu-item" data-a="sounds" aria-pressed="${audio.sfx}">${HUD.sounds}: ${audio.sfx ? HUD.on : HUD.off}</button>
    <button class="btn menu-item" data-a="savemenu">${HUD.save}</button>
    <div class="mbtns"><button class="btn" data-a="close">${HUD.close}</button></div>`;
  closeWindow('replaced'); // one window at a time
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
  const ending = ENDING_TEXT.ru[state.ending ?? 'evicted'];
  const totals = fill(DEBT_UI.totals, { day: state.day, credits: state.credits, debt: state.debt });
  openModal(ending.title, `<p>${ending.line}</p><p class="hint">${totals}</p>`,
    `<button class="btn pri" data-a="newgame-yes">${DEBT_UI.newGame}</button>`);
}

/** "+4" / "−2" with a real minus sign. */
const signed = (n: number): string => (n > 0 ? '+' : '−') + Math.abs(n);

/** Morning window (task 16): "Ожидается клиентов: N" and the reasons it differs from a usual day, in `wear`. */
function expectedCustomers(): string {
  const today = customersToday(state);
  const time = formatHour(openingHour(state));
  const reasons = today.reasons
    .map(reason => `<li class="m-wear">${fill(DAY_UI.reasons[reason.key], { time })} (${signed(reason.n)})</li>`)
    .join('');
  return `<p class="expect">${fill(DAY_UI.expected, { n: `<b class="rn">${today.count}</b>` })}</p>${reasons ? `<ul class="reasons">${reasons}</ul>` : ''}`;
}

function showMorningReport(report: MorningReport): void {
  if (state.over) {
    showEnding();
    return;
  }
  const lines = report.events.map(event => `<li>${event}</li>`);
  if (report.expenses) {
    const bills = expenseLines(report.expenses, state.debt);
    lines.push(`<li>${bills.paid}</li>`);
    if (bills.shortfall && report.expenses.toDebt) {
      lines.push(`<li class="m-risk">${bills.shortfall}</li>`); // short of money: onto the debt
    } else if (bills.shortfall) {
      lines.push(`<li>${bills.shortfall}</li>`); // the seat is bought: nothing onto the debt
    }
  }
  const body = `${expectedCustomers()}<ul>${lines.join('')}</ul>`;
  // V2.2: the first window on the window component (a sheet on a phone, a mini window on a Mac)
  showWindow({
    id: 'morning',
    title: fill(DAY_UI.morningTitle, { day: state.day }),
    body,
    buttons: `<button class="btn pri" data-a="close">${DAY_UI.openShop}</button>`,
  });
}

/** Early payment buttons: the fixed steps and "everything you have" (up to the debt). */
function earlyButtons(): string {
  const all = Math.min(state.credits, state.debt);
  const steps = DEBT.earlySteps
    .map(step => `<button class="btn" data-a="early" data-v="${step}" ${disabledIf(state.over || state.debt === 0 || state.credits < Math.min(step, state.debt))}>+${step}</button>`)
    .join('');
  return `${steps}<button class="btn" data-a="early" data-v="all" ${disabledIf(state.over || all <= 0)}>${DEBT_UI.everything} · ${all}</button>`;
}

function seatBlock(): string {
  if (state.seat) {
    return `<p class="m-ok">${fill(DEBT_UI.seatOwned, { shuttle: state.shuttleDay })}</p>`;
  }
  const price = seatPrice(state.day);
  const note = state.debt > 0 ? `<p class="hint m-inactive">${DEBT_UI.seatNeedsZero}</p>` : '';
  return `<p class="hint">${fill(DEBT_UI.seatPrice, { price, perDay: DEBT.seatPerDay, shuttle: state.shuttleDay })}</p>${note}
    <button class="btn pri" data-a="seat" style="width:100%" ${disabledIf(!canBuySeat(state))}>${DEBT_UI.seatBuy} · ${price} кр.</button>`;
}

/** Debt window (HUD payment stat or ☰): the debt left, the next payment, early payments, the shuttle seat. */
function openDebt(): void {
  const payment = state.debt > 0
    ? `<span>${DEBT_UI.nextPayment}</span><span class="price">${state.owed} кр.</span>
      <span>${DEBT_UI.when}</span><span>${fill(DEBT_UI.paymentDay, { day: state.nextDue, days: daysRu(Math.max(0, state.nextDue - state.day)) })}</span>`
    : `<span>${DEBT_UI.nextPayment}</span><span>${DEBT_UI.noPayments}</span>`;
  openModal(DEBT_UI.windowTitle, `<div class="debt"><div class="rows">
      <span>${DEBT_UI.debtLeft}</span><span class="price"><b>${state.debt} кр.</b></span>
      ${payment}
      <span>${DEBT_UI.youHave}</span><span class="price">${state.credits} кр.</span></div>
    ${state.debt > 0 ? `<h3>${DEBT_UI.early}</h3><p class="hint">${DEBT_UI.earlyHint}</p><div class="early">${earlyButtons()}</div>` : ''}
    ${hasShuttle(state) ? `<h3>${DEBT_UI.seatTitle}</h3>${seatBlock()}` : ''}</div>`, CLOSE_BUTTON);
}

/** Buying the seat cannot be undone: ask first. */
function confirmSeat(): void {
  openModal(DEBT_UI.seatConfirmTitle, `<p>${fill(DEBT_UI.seatConfirmText, { price: seatPrice(state.day) })}</p>`,
    `<button class="btn pri" data-a="seat-yes">${DEBT_UI.seatConfirmYes}</button><button class="btn" data-a="debt">${DEBT_UI.seatConfirmNo}</button>`);
}

function openSaveMenu(): void {
  openModal('Сохранение', `<p class="hint" style="margin:0">Скопируйте код и сохраните в заметки. На другом устройстве или в другой версии игры вставьте его в поле загрузки.</p>
      <label for="savecode">${fill(MODE_UI.saveCode, { mode: MODE_UI.names[state.mode], day: state.day, credits: state.credits })}</label><textarea id="savecode" readonly placeholder="${SAVE_UI.preparing}"></textarea>
      <div class="mbtns"><button class="btn pri" data-a="copysave">Скопировать</button><button class="btn" data-a="savefile">${SAVE_UI.download}</button></div>
      <label for="loadcode">Загрузить сейв</label><textarea id="loadcode" placeholder="Вставьте код"></textarea>
      <div class="mbtns"><button class="btn" data-a="loadfile">${SAVE_UI.upload}</button></div>
      <input type="file" id="loadfilepick" accept=".txt,text/plain" hidden>
      <div id="savemsg" class="hint"></div>`,
    '<button class="btn alt" data-a="loadsave">Загрузить</button><button class="btn" data-a="close">Закрыть</button>',
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
    showSaveError(SAVE_UI.fileUnread);
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
    byId('savemsg').textContent = 'Код выделен, скопируйте вручную.';
  };
  try {
    navigator.clipboard.writeText(textarea.value).then(() => {
      byId('savemsg').textContent = 'Скопировано.';
    }, selectForManualCopy);
  } catch (err) {
    selectForManualCopy();
  }
}

/** Loads the code from the load box (DC2 or DC1); a rejected code keeps the window open. */
async function loadSaveCode(): Promise<void> {
  const loaded = await importSaveCode(byId<HTMLTextAreaElement>('loadcode').value);
  if (!loaded) {
    showSaveError('Код не распознан. Проверьте, что скопирован весь код целиком.');
    return;
  }
  // the current game is already in its slot (render saves after every action);
  // the code goes into the slot of its own mode, and the game switches to that mode
  enterGame(loaded);
  addLog(state, `Сейв загружен: день ${state.day}, ${state.credits} кр.`);
  closeModal();
  render();
}

function openLog(): void {
  openModal('Лента', `<ul>${state.log.map(line => `<li>${line}</li>`).join('')}</ul>`, CLOSE_BUTTON);
}

/* =====================================================================
   Game modes: the mode screen, slots, the player profile
   ===================================================================== */

/** Mode strings in the interface language. */
const MODE_UI = MODE_TEXT.ru;
/** Save window strings (the file buttons). */
const SAVE_UI = SAVE_TEXT.ru;

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
    return fill(MODE_UI.finished, { ending: ENDING_TEXT.ru[game.ending ?? 'evicted'].title, day: game.day });
  }
  if (game.mode === 'calm' && game.debt === 0) {
    return fill(MODE_UI.paidOff, { day: game.day });
  }
  return fill(MODE_UI.progress, { day: game.day, debt: game.debt });
}

function modeCard(mode: Mode): string {
  const name = `<span class="mode-name">${MODE_UI.names[mode]}</span>`;
  const about = `<p class="hint">${MODE_UI.about[mode]}</p>`;
  if (!isPlayable(profile, mode)) {
    return `<div class="mode-card m-inactive">${name}${about}<p class="mode-lock">${iconSvg('lock')}${MODE_UI.locked}</p></div>`;
  }
  const game = gameIn(mode);
  const current = mode === state.mode && persistence.enabled ? ` <span class="tag">${MODE_UI.current}</span>` : '';
  let buttons: string;
  if (!game) {
    buttons = `<button class="btn pri" data-a="mode-go" data-v="${mode}">${MODE_UI.start}</button>`;
  } else if (game.over) {
    buttons = `<button class="btn pri" data-a="mode-reset" data-v="${mode}">${MODE_UI.restart}</button>`;
  } else {
    buttons = `<button class="btn pri" data-a="mode-go" data-v="${mode}">${MODE_UI.continue}</button>`
      + `<button class="btn" data-a="mode-reset" data-v="${mode}">${MODE_UI.restart}</button>`;
  }
  const status = game ? `<p class="mode-status">${modeStatus(game)}</p>` : '';
  return `<div class="mode-card"><div>${name}${current}</div>${about}${status}<div class="mode-btns">${buttons}</div></div>`;
}

/** Mode screen: on the first launch (no close button) and from ☰ "Режимы" (a new game starts there). */
function openModes(): void {
  const close = persistence.enabled ? `<button class="btn" data-a="close">${MODE_UI.close}</button>` : '';
  openModal(MODE_UI.screenTitle, `<div class="modes">${MODES.map(modeCard).join('')}</div>`, close);
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
  openModal(MODE_UI.resetTitle, `<p>${fill(MODE_UI.resetText, { mode: MODE_UI.names[mode] })}</p>`,
    `<button class="btn pri" data-a="mode-reset-yes" data-v="${mode}">${MODE_UI.resetYes}</button>`
    + `<button class="btn" data-a="modes">${MODE_UI.resetNo}</button>`);
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
  const totals = fill(DEBT_UI.totals, { day: state.day, credits: state.credits, debt: state.debt });
  openModal(MODE_UI.paidTitle, `<p>${MODE_UI.paidLine}</p><p class="hint">${totals}</p>`,
    `<button class="btn pri" data-a="close">${MODE_UI.paidContinue}</button><button class="btn" data-a="newgame-yes">${MODE_UI.paidNewGame}</button>`);
}

/**
 * Launch: continue the last played mode (or any mode with a save) right away;
 * with no save at all, show the mode screen over a provisional story game.
 */
export function startGame(): void {
  profile = loadProfile();
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
      actorEnter(state.cust.seed);
      ui.tab = 'deal';
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
  closeshop: () => {
    closeShop(state);
    ui.tab = 'deal';
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
      ui.tab = value;
    }
  },
  sel: value => {
    const uid = Number(value);
    ui.sel = ui.sel === uid ? null : uid;
  },
  bench: value => useWorkbench(state, ui.sel, value ?? ''),
  craft: value => {
    const built = craft(state, Number(value), gameRng);
    if (built) {
      ui.sel = built.uid;
      ui.tab = 'inv';
    }
  },
  parts: () => orderParts(state),
  // evening
  junk: () => {
    goToJunkyard(state, gameRng);
    ui.tab = 'deal';
  },
  dig: () => digAndShow(),
  home: () => {
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
  log: () => {
    openLog();
    return NO_RENDER;
  },
  close: () => {
    closeModal();
    closeWindow('close');
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
  const action = button.dataset.a ?? '';
  const handler = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  const debtBefore = state.debt;
  const modeBefore = state.mode;
  const game = state;
  const visitor = state.cust;
  const result = handler ? handler(button.dataset.v) : undefined;
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

/** "Копать" (the bar or a tap on the heap): one dig, its sound, the shovel and the ambience of the new noise. */
function digAndShow(): void {
  const result = dig(state, gameRng);
  if (!result) {
    return;
  }
  playSfx('dig');
  playSfx(result.kind);
  playDigFx(result.kind);
}

/** A tap on the junk heap digs, like "Копать" in the action bar. */
function onSceneCanvasClick(event: MouseEvent): void {
  if (state.where !== 'junk' || !state.junk || !isOnHeap(event.clientX, event.clientY)) {
    return;
  }
  const game = state;
  digAndShow();
  followGame(game, null);
  flushFeedback();
  render();
}

/** Enter in the price box submits the offer / ask. */
function onKeyDown(event: KeyboardEvent): void {
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
