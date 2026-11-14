// =====================================================================
//  ui.ts — HTML rendering of the HUD, scene overlay, tabs and panes,
//  plus all click/keyboard handlers (buttons carry data-a="action").
// =====================================================================
import { audio, startMusicOnGesture, toggleMusic } from './audio';
import { BENCH_COST, BUYOUT_GOAL, CUSTOMERS_PER_DAY, HAGGLE, HUD_TEXT, HUNCH_VERDICT_TEXT, ITEM_TYPES, MARKET, MAX_HEAT, RECIPES, RENT, SUPPLIER } from './data';
import { byId, maybeById } from './dom';
import { iconSvg } from './icons';
import {
  askBuyer, availableOfType, buyFromSeller, buyOutShop, callNextCustomer, canCraft, canVisitMarket, closeShop,
  collateralHeatRelief, craft, customerLeaves, deferredDebt, deferRent, digPile, estimatedValue, evict, feedback,
  goHome, goToJunkyard, hunchVerdict, inspect, isFullyKnown, isInspectCheck, isLandlordDue, isOnCounter, isPresentedBuyer, itemName,
  nextRent, offerToSeller, orderParts, payRent, payWithCollateral, perceivedChance, planCollateral, presentItem,
  recipeNeeds, scrapValue, sellToBuyer, showsInfection, sleepUntilMorning, useWorkbench, visitMarket,
} from './economy';
import type { CollateralPlan } from './economy';
import { onSceneClick, paintIcons, pileAt } from './scene';
import {
  actor, actorAtCounter, actorReset, addLog, exportSave, findItem, importSave, newGame, saveGame, setState, state, ui,
} from './state';
import type { BuyerCustomer, Item, ItemType, Recipe, RentCustomer, SellerCustomer, Tab } from './types';
import { daysRu, roundTo10 } from './util';
import { VERSION_LABEL } from './version';

/* =====================================================================
   Small HTML helpers
   ===================================================================== */

// Colors carry meaning only through the m-* classes (style.css → --m-* → MEANING in palette.ts).
const UNKNOWN = '<span class="m-unknown">?</span>';
const CLOSE_BUTTON = '<button class="btn pri" data-a="close">Закрыть</button>';
const NEW_GAME_BUTTON = '<button class="btn pri" data-a="newgame-yes">Новая игра</button>';
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

/** Rent: days left go into the label ("аренда·3д"), so the number column stays narrow. */
function rentStat(): string {
  if (state.won) {
    return hudStat(HUD.rent, '<b>—</b>');
  }
  const daysLeft = state.nextDue - state.day;
  const urgent = state.credits < state.owed && daysLeft <= 1 || state.deferred;
  // due today = "0д": same width as "6д" (the scene chip says "+АРЕНДА" on that day)
  const when = Math.max(0, daysLeft) + HUD.daysShort;
  return hudStat(`${state.deferred ? HUD.debt : HUD.rent}·${when}`, `<b>${state.owed}</b>`, urgent ? 'm-risk' : '');
}

/** Credits; once the shop can be bought out, the stat itself is the "buy out" button. */
function creditsStat(): string {
  if (state.credits >= BUYOUT_GOAL && !state.won) {
    return `<button class="st st-btn m-action" data-a="buyout"><small>${HUD.buyout}</small><b>${state.credits}</b></button>`;
  }
  return hudStat(HUD.credits, `<b>${state.credits}</b>`);
}

/** Bottom bar: кр · день · аренда · зап, then ☰. The wanted level is on the scene wall, music in the menu. */
function renderHud(): void {
  const menu = `<button class="ib" data-a="menu" aria-haspopup="dialog" aria-label="${HUD.menu}">${iconSvg('menu')}</button>`;
  byId('hud').innerHTML = `<div class="stats">${[
    creditsStat(),
    hudStat(HUD.day, `<b>${state.day}</b>`),
    rentStat(),
    hudStat(HUD.parts, `<b>${state.parts}</b>`),
  ].join('')}</div>${menu}`;
}

/** Screen-reader text of the wanted-level meter drawn on the scene ("розыск 3 из 10"). */
const heatText = (): string => `${HUD.heat} ${state.heat} ${HUD.of} ${MAX_HEAT}`;

function chipText(): string {
  if (state.over) {
    return 'ЗАКРЫТО';
  }
  if (state.phase === 'evening') {
    return `${state.where === 'junk' ? 'СВАЛКА' : 'ВЕЧЕР'} · ${state.hours} Ч`;
  }
  const queue = CUSTOMERS_PER_DAY - state.slot - (state.cust ? 1 : 0);
  const landlordDue = isLandlordDue();
  const queueText = queue > 0 ? `ОЧЕРЕДЬ: ${queue}` : landlordDue ? 'ОЧЕРЕДЬ: 0' : 'СМЕНА ОКОНЧЕНА';
  return queueText + (landlordDue ? ' +АРЕНДА' : '');
}

/** Speech bubble, queue chip, "call next" button and the log ticker. */
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
  byId('chip').textContent = chipText();
  const canCall = state.phase === 'shop' && actor.phase === 'empty' && !customer && !state.over
    && (state.slot < CUSTOMERS_PER_DAY || isLandlordDue());
  byId('callBtn').hidden = !canCall;
  byId('ticker').innerHTML = `<b>›</b> ${state.log[0] || ''}`;
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

function junkyardPane(): string {
  const pileButtons = (state.junk?.piles ?? [])
    .map((pile, i) => `<button class="btn" data-a="dig" data-v="${i}" ${disabledIf(pile.dug || state.hours < 1)}>Куча ${i + 1}</button>`)
    .join('');
  return `<div class="hint">Нажмите на кучу хлама на сцене или выберите номер. Осталось часов: <b>${state.hours}</b>.</div>
      <div class="piles">${pileButtons}</div>
      <button class="btn pri" data-a="home" style="width:100%">Вернуться домой</button>`;
}

function eveningPane(): string {
  return `<div class="hint" style="margin-bottom:8px">Лавка закрыта. Осталось часов: <b>${state.hours}</b>. Верстак и сборка работают бесплатно.</div>
    <div class="opts">
      ${option('junk', state.hours < 2, 'Свалка «Кольцо Б»', 'Дорога 1 ч, каждая куча 1 ч. Запчасти, сломанные вещи, редкие находки. Иногда сторожевые дроны.', '→')}
      ${option('market', !canVisitMarket(), 'Барахолка у шлюза', `${MARKET.hours} ч. ${MARKET.parts} запчастей за ${MARKET.price} кр. Раз за вечер.`, MARKET.price)}
      ${option('sleep', false, 'Спать', 'Закончить день. Ночью: аренда, рейды, заражение склада.', '☾')}
    </div>`;
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
  if (state.slot >= CUSTOMERS_PER_DAY && !isLandlordDue()) {
    return '<div class="hint" style="margin-bottom:8px">Очередь кончилась. Пора закрываться.</div><button class="btn pri" data-a="closeshop" style="width:100%">Закрыть лавку</button>';
  }
  return '<div class="hint">Прилавок свободен. Зовите следующего, когда будете готовы. Пока можно разобрать склад.</div>';
}

function collateralDescription(plan: CollateralPlan): string {
  if (!plan.ok) {
    return 'Даже со всем складом не хватает.';
  }
  const goods = plan.items.length ? ' и ' + plan.items.map(item => itemName(item.t)).join(', ') : '';
  const heatNote = plan.hot ? ` <span class="m-action">Розыск −${collateralHeatRelief(plan)}.</span>` : '';
  return `Заберёт ${plan.cash} кр.${goods}. Сначала берёт краденое (за 50%), остальное за 60%, сдачи не даёт.${heatNote}`;
}

function rentPane(customer: RentCustomer): string {
  const plan = planCollateral();
  const canPay = state.credits >= state.owed;
  const deferText = state.deferred ? 'Вторую отсрочку Гробов не даст.' : `Придёт через ${daysRu(RENT.deferDays)}, долг +20%: ${deferredDebt()} кр.`;
  let html = `<div class="thead"><div><span class="cname">${customer.name}</span><span class="kind m-risk">за арендой</span></div></div>
    <div class="card" style="flex-direction:column;gap:2px"><div class="rows">
      <span>К оплате</span><span class="price"><b>${state.owed} кр.</b>${state.deferred ? ' <span class="m-risk">с пеней</span>' : ''}</span>
      <span>У вас</span><span class="price ${canPay ? 'm-action' : 'm-risk'}">${state.credits} кр.</span></div></div>
    <div class="opts" style="margin-top:8px">
      ${option('rentpay', !canPay, 'Заплатить', `Следующая аренда ${nextRent()} кр. через ${daysRu(RENT.periodDays)}.`, state.owed, ' class="price"')}
      ${option('rentdefer', state.deferred, 'Попросить отсрочку', deferText, '⧗')}
      ${option('rentitems', !(plan.ok && plan.items.length), 'Отдать деньги и товар', collateralDescription(plan), '⚖')}
    </div>`;
  if (!canPay && state.deferred && !plan.ok) {
    html += '<button class="btn m-risk" data-a="evict" style="width:100%;margin-top:8px">Нечем платить</button>';
  }
  return html;
}

function customerHeader(customer: SellerCustomer | BuyerCustomer): string {
  return `<div class="thead"><div><span class="cname">${customer.name}</span><span class="kind ${customer.kind}">${customer.kind === 'sell' ? 'продаёт' : 'покупает'}</span></div>
  <div class="pips" title="Терпение">${meterCells(customer.max, customer.pat)}</div></div>`;
}

function knownFact(known: boolean, html: string): string {
  return known ? html : UNKNOWN;
}

function sellerPane(customer: SellerCustomer): string {
  const item = customer.item;
  const condition = `<span class="${item.cond < 40 ? 'm-wear' : ''}">${item.cond}%</span>`;
  const serial = item.stolen ? '<span class="m-risk">спилен</span>' : '<span class="m-action">чистый</span>';
  const insides = item.infected ? '<span class="m-risk">ИИ-вирус</span>' : item.defect ? '<span class="m-wear">дефект</span>' : '<span class="m-action">ок</span>';
  const defaultOffer = Math.min(state.credits, roundTo10(customer.ask * HAGGLE.sellerDefaultOfferShare));
  return `<div class="card">${iconCanvas(item.t, 'bigico', showsInfection(item))}<div style="min-width:0"><div class="rn">${itemName(item.t)}</div><div class="rows">
      <span>Состояние</span><span>${knownFact(item.k.cond, condition)}</span>
      <span>Серийник</span><span>${knownFact(item.k.serial, serial)}</span>
      <span>Начинка</span><span>${knownFact(item.k.flaw, insides)}</span>
      <span>Оценка</span><span class="price">${approx(estimatedValue(item))} кр.</span></div></div></div>
      <div class="tools"><button class="btn" data-a="insp" data-v="cond" ${disabledIf(customer.done.cond)}>Сканер</button>
      <button class="btn" data-a="insp" data-v="serial" ${disabledIf(customer.done.serial)}>Серийник</button>
      <button class="btn" data-a="insp" data-v="flaw" ${disabledIf(customer.done.flaw)}>Диагностика</button></div>
    <div class="deal"><div class="ask">Просит: <b class="price">${customer.ask}</b> кр. · у вас ${state.credits}</div>
      ${priceRow(defaultOffer)}
      <div class="acts"><button class="btn pri" data-a="offer">Предложить</button>
      <button class="btn alt" data-a="accept" ${disabledIf(customer.ask > state.credits)}>За ${customer.ask}</button>
      <button class="btn" data-a="refuse">Отпустить</button></div></div>`;
}

function buyerPane(customer: BuyerCustomer): string {
  const matching = state.inv.filter(item => item.t === customer.want);
  let html = `<div class="ask" style="margin-bottom:6px">Нужно: <b>${itemName(customer.want)}</b></div>`;
  if (!matching.length) {
    return html + '<div class="hint" style="margin-bottom:8px">На складе такого нет.</div><button class="btn" data-a="refuse" style="width:100%">Нет такого, до свидания</button>';
  }
  const tiles = matching.map(item => {
    const shown = customer.item && customer.item.uid === item.uid;
    return `<button class="tile ${shown ? 'on' : ''}" data-a="show" data-v="${item.uid}">${itemDots(item)}${iconCanvas(item.t, '', showsInfection(item))}<span>${conditionText(item)}</span><span class="tv">${approx(estimatedValue(item))}</span></button>`;
  }).join('');
  html += `<div class="shelf">${tiles}</div>`;
  if (!isPresentedBuyer(customer)) {
    return html + '<div class="hint" style="margin:8px 0">Выложите товар на прилавок.</div><button class="btn" data-a="refuse" style="width:100%">Отпустить</button>';
  }
  return html + `<div class="deal"><div class="ask">Предлагает: <b class="price">${customer.offer}</b> кр.</div>${priceRow(roundTo10(customer.offer * HAGGLE.buyerDefaultAskShare))}
        <div class="acts"><button class="btn pri" data-a="ask">Назвать цену</button>
        <button class="btn alt" data-a="take">За ${customer.offer}</button>
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
    <button class="btn" data-a="bench" data-v="scrap" ${disabledIf(isOnCounter(item))}><span>Разобрать</span><span class="price">+${scrapValue(item)}⚙</span></button></div>
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
  const selected = findItem(ui.sel);
  return html + (selected ? workbench(selected) : '<div class="hint">Нажмите на предмет, чтобы открыть верстак.</div>');
}

/* =====================================================================
   Craft pane
   ===================================================================== */

function recipeRow(recipe: Recipe, index: number): string {
  const parts = recipeNeeds(recipe)
    .map(([type, count]) => `<span class="${availableOfType(type).length >= count ? 'm-ok' : 'm-inactive'}">${itemName(type)} ×${count}</span>`)
    .join(' + ');
  const partsClass = state.parts >= recipe.parts ? 'm-ok' : 'm-inactive';
  return `<div class="recipe">${iconCanvas(recipe.out)}<div class="rb"><div class="rn">${itemName(recipe.out)}</div><div class="need">${parts} + <span class="${partsClass}">${recipe.parts}⚙</span> · ${approx(ITEM_TYPES[recipe.out].basePrice)} кр.</div></div>
    <button class="btn" data-a="craft" data-v="${index}" ${canCraft(recipe) ? '' : 'disabled'}>Собрать</button></div>`;
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
  paintIcons();
  updateChanceMeter();
}

export function render(): void {
  renderHud();
  renderSceneOverlay();
  renderTabs();
  renderPane();
  saveGame();
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
  byId('mbox').innerHTML = `<h2>${title}</h2>${body}<div class="mbtns">${buttons}</div>${footer}`;
  byId('modal').classList.remove('sheet');
  byId('modal').hidden = false;
}

/** ☰ menu: a sheet under the HUD with the game title, save and new game (later: RU/EN). */
function openMenu(): void {
  byId('mbox').innerHTML = `<h2>${HUD.gameTitle}</h2>
    <button class="btn menu-item" data-a="music" aria-pressed="${audio.on}">${HUD.music}: ${audio.on ? HUD.on : HUD.off}</button>
    <button class="btn menu-item" data-a="savemenu">${HUD.save}</button>
    <button class="btn menu-item" data-a="newgame">${HUD.newGame}</button>
    <div class="mbtns"><button class="btn" data-a="close">${HUD.close}</button></div>`;
  byId('modal').classList.add('sheet');
  byId('modal').hidden = false;
}

function closeModal(): void {
  byId('modal').hidden = true;
}

function showEviction(): void {
  openModal('Выселение', `<p>${state.over}</p>`, NEW_GAME_BUTTON);
}

function showMorningReport(events: string[]): void {
  const title = state.over ? 'Выселение' : `Утро. День ${state.day}`;
  const body = `<ul>${events.map(event => `<li>${event}</li>`).join('')}</ul>`;
  const buttons = state.over ? NEW_GAME_BUTTON : '<button class="btn pri" data-a="close">Открыть лавку</button>';
  openModal(title, body, buttons);
}

function showBuyout(): void {
  openModal(
    'Лавка ваша',
    `<p>Выкуплено на ${state.day}-й день. Можно торговать дальше без аренды или начать заново.</p>`,
    '<button class="btn pri" data-a="close">Продолжить</button><button class="btn" data-a="newgame-yes">Новая лавка</button>',
  );
}

function openSaveMenu(): void {
  openModal('Сохранение', `<p class="hint" style="margin:0">Скопируйте код и сохраните в заметки. На другом устройстве или в другой версии игры вставьте его в поле загрузки.</p>
      <label for="savecode">Код текущей игры · день ${state.day}, ${state.credits} кр.</label><textarea id="savecode" readonly>${exportSave()}</textarea>
      <div class="mbtns"><button class="btn pri" data-a="copysave">Скопировать</button></div>
      <label for="loadcode">Загрузить сейв</label><textarea id="loadcode" placeholder="Вставьте код"></textarea>
      <div id="savemsg" class="hint"></div>`,
    '<button class="btn alt" data-a="loadsave">Загрузить</button><button class="btn" data-a="close">Закрыть</button>',
    `<div class="version">${VERSION_LABEL}</div>`,
  );
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

/** Returns false if the code was rejected (the modal stays open). */
function loadSaveCode(): boolean {
  const loaded = importSave(byId<HTMLTextAreaElement>('loadcode').value);
  if (!loaded) {
    byId('savemsg').textContent = 'Код не распознан. Проверьте, что скопирован весь код целиком.';
    byId('savemsg').classList.add('m-risk');
    return false;
  }
  setState(loaded);
  ui.sel = null;
  ui.tab = 'deal';
  if (state.cust) {
    actorAtCounter(state.cust.seed);
  } else {
    actorReset();
  }
  addLog(`Сейв загружен: день ${state.day}, ${state.credits} кр.`);
  closeModal();
  return true;
}

function openLog(): void {
  openModal('Лента', `<ul>${state.log.map(line => `<li>${line}</li>`).join('')}</ul>`, CLOSE_BUTTON);
}

function confirmNewGame(): void {
  openModal(HUD.confirmTitle, `<p>${HUD.confirmText}</p>`,
    `<button class="btn pri" data-a="newgame-yes">${HUD.confirmYes}</button><button class="btn" data-a="close">${HUD.confirmNo}</button>`);
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
  call: () => callNextCustomer(),
  insp: value => {
    if (isInspectCheck(value)) {
      inspect(value);
    }
  },
  offer: () => offerToSeller(offerValue()),
  accept: () => buyFromSeller(),
  refuse: () => customerLeaves(),
  show: value => presentItem(Number(value)),
  ask: () => askBuyer(offerValue()),
  take: () => sellToBuyer(),
  closeshop: () => closeShop(),
  // rent
  rentpay: () => payRent(),
  rentdefer: () => deferRent(),
  rentitems: () => payWithCollateral(),
  evict: () => {
    evict();
    showEviction();
  },
  buyout: () => {
    buyOutShop();
    showBuyout();
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
  bench: value => useWorkbench(value ?? ''),
  craft: value => craft(Number(value)),
  parts: () => orderParts(),
  // evening
  junk: () => {
    goToJunkyard();
    ui.tab = 'deal';
  },
  dig: value => digPile(Number(value)),
  home: () => goHome(),
  market: () => visitMarket(),
  sleep: () => showMorningReport(sleepUntilMorning()),
  // header & modals
  music: () => {
    toggleMusic();
    // the item lives in the menu: show the new state, keep the menu open
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
  loadsave: () => loadSaveCode() ? undefined : NO_RENDER,
  log: () => {
    openLog();
    return NO_RENDER;
  },
  close: () => closeModal(),
  newgame: () => {
    confirmNewGame();
    return NO_RENDER;
  },
  'newgame-yes': () => {
    closeModal();
    ui.sel = null;
    newGame();
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
  const result = handler ? handler(button.dataset.v) : undefined;
  flushFeedback();
  if (result === NO_RENDER) {
    return;
  }
  render();
}

function onSceneCanvasClick(event: MouseEvent): void {
  if (state.where !== 'junk' || !state.junk) {
    return;
  }
  const index = pileAt(event.clientX, event.clientY);
  if (index >= 0) {
    digPile(index);
    flushFeedback();
    render();
  }
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
  document.addEventListener('click', onClick);
  document.addEventListener('input', event => {
    if (event.target instanceof HTMLElement && event.target.id === 'offer') {
      updateChanceMeter();
    }
  });
  document.addEventListener('keydown', onKeyDown);
  onSceneClick(onSceneCanvasClick);
  startMusicOnFirstTouch();
  trackKeyboard();
}

/**
 * Music is on by default, but browsers start sound only from a user gesture.
 * Listen to the first touches / key presses (pointerdown for a mouse,
 * touchend for iOS Safari) until the music runs or the player turned it off.
 */
function startMusicOnFirstTouch(): void {
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  const onGesture = (): void => {
    if (startMusicOnGesture()) {
      events.forEach(type => document.removeEventListener(type, onGesture, true));
    }
  };
  events.forEach(type => document.addEventListener(type, onGesture, true));
}

/** Hides the bottom bar while the on-screen keyboard is open, so it does not cover the price box. */
function trackKeyboard(): void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return;
  }
  const update = (): void => {
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    // the keyboard takes far more than this; pinch zoom alone does not count (scale > 1)
    const keyboardOpen = typing && viewport.scale <= 1 && window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
    document.documentElement.classList.toggle('kb-open', keyboardOpen);
  };
  viewport.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => requestAnimationFrame(update));
}
