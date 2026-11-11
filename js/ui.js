// =====================================================================
//  ui.js — HTML rendering of the HUD, scene overlay, tabs and panes,
//  plus all click/keyboard handlers (buttons carry data-a="action").
// =====================================================================
import { BENCH_COST, BUYOUT_GOAL, CUSTOMERS_PER_DAY, HAGGLE, ITEM_TYPES, MARKET, MAX_HEAT, RECIPES, RENT, SUPPLIER } from './data.js';
import {
  actor, actorAtCounter, actorReset, addLog, exportSave, findItem, importSave, newGame, saveGame, setState, state, ui,
} from './state.js';
import {
  askBuyer, availableOfType, buyFromSeller, buyOutShop, callNextCustomer, canCraft, canVisitMarket, closeShop,
  collateralHeatRelief, craft, customerLeaves, feedback, deferredDebt, deferRent, digPile, estimatedValue, evict, goHome,
  goToJunkyard, inspect, isFullyKnown, isLandlordDue, isOnCounter, itemName, nextRent, offerToSeller, orderParts,
  payRent, payWithCollateral, perceivedChance, planCollateral, presentItem, scrapValue, sellToBuyer, showsInfection,
  sleepUntilMorning, useWorkbench, visitMarket,
} from './economy.js';
import { onSceneClick, paintIcons, pileAt } from './scene.js';
import { audio, toggleMusic } from './audio.js';
import { byId, roundTo10 } from './util.js';

/* =====================================================================
   Small HTML helpers
   ===================================================================== */

const UNKNOWN = '<span class="q">?</span>';
const CLOSE_BUTTON = '<button class="btn pri" data-a="close">Закрыть</button>';
const NEW_GAME_BUTTON = '<button class="btn pri" data-a="newgame-yes">Новая игра</button>';
const FLOATING_TEXT_LIFETIME_MS = 1300;
const disabledIf = condition => condition ? 'disabled' : '';
const conditionText = item => item.k.cond ? item.cond + '%' : '?%';

function iconCanvas(type, cssClass = '', infected = 0) {
  return `<canvas class="${cssClass}" width="28" height="16" data-ico="${type}" data-inf="${infected ? 1 : 0}"></canvas>`;
}

function itemTags(item) {
  const tags = [];
  tags.push(item.k.cond ? `<span class="tag ${item.cond < 40 ? 'warn' : ''}">${item.cond}%</span>` : '<span class="tag">сост. ?</span>');
  if (item.k.serial) {
    tags.push(item.stolen ? '<span class="tag bad">краденое</span>' : '<span class="tag ok">чистый №</span>');
  } else {
    tags.push('<span class="tag">№ ?</span>');
  }
  if (item.k.flaw) {
    if (item.defect) {
      tags.push('<span class="tag warn">дефект</span>');
    }
    if (item.infected) {
      tags.push('<span class="tag bad">ИИ</span>');
    }
    if (!item.defect && !item.infected) {
      tags.push('<span class="tag ok">начинка ок</span>');
    }
  } else {
    tags.push('<span class="tag">начинка ?</span>');
  }
  return `<div class="tags">${tags.join('')}</div>`;
}

/** Colored corner dots on an inventory tile. */
function itemDots(item) {
  const dots = [];
  if (!isFullyKnown(item)) {
    dots.push('d-q');
  }
  if (item.k.serial && item.stolen) {
    dots.push('d-red');
  }
  if (item.k.flaw && item.infected) {
    dots.push('d-red');
  }
  if (item.k.flaw && item.defect) {
    dots.push('d-amb');
  }
  return `<span class="dots">${dots.map(cls => `<i class="${cls}"></i>`).join('')}</span>`;
}

/** Row of cells, the first `filled` of them lit (heat bar, patience pips). */
function meterCells(total, filled) {
  return Array.from({ length: total }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
}

/* =====================================================================
   HUD, scene overlay, tabs
   ===================================================================== */

const hudStat = (label, valueHtml) => `<span class="st"><small>${label}</small>${valueHtml}</span>`;

function rentStat() {
  const daysLeft = state.nextDue - state.day;
  const urgent = state.credits < state.owed && daysLeft <= 1 || state.deferred;
  const value = state.won ? '—' : state.owed + '/' + (daysLeft <= 0 ? 'сег.' : daysLeft + 'д');
  return hudStat(state.deferred ? 'долг' : 'аренда', `<b class="${urgent ? 'bad' : ''}">${value}</b>`);
}

function renderHud() {
  const phaseLabel = state.phase === 'shop' ? 'смена' : state.where === 'junk' ? 'свалка' : 'вечер';
  const buyoutButton = state.credits >= BUYOUT_GOAL && !state.won
    ? '<button class="hb" data-a="buyout" style="border-color:var(--cyan);color:var(--cyan)">Выкупить</button>'
    : '';
  byId('hud').innerHTML = [
    '<span class="logo">ТЁМНЫЙ ПРИЛАВОК</span>',
    hudStat('кр', `<b>${state.credits}</b>`),
    hudStat('день', `<b>${state.day}·${phaseLabel}</b>`),
    rentStat(),
    hudStat('зап', `<b>${state.parts}</b>`),
    hudStat('розыск', `<span class="heat">${meterCells(MAX_HEAT, state.heat)}</span>`),
    buyoutButton,
    `<button class="hb" data-a="music">${audio.on ? '♪ выкл' : '♪ лофи'}</button>`,
    '<button class="hb" data-a="savemenu">сейв</button>',
    '<button class="hb" data-a="newgame">⟲</button>',
  ].join('\n');
}

function chipText() {
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
export function renderSceneOverlay() {
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
}

function renderTabs() {
  const firstTab = state.phase === 'shop' ? 'ПРИЛАВОК' : state.where === 'junk' ? 'СВАЛКА' : 'ВЕЧЕР';
  const tabs = [['deal', firstTab], ['inv', `СКЛАД · ${state.inv.length}`], ['craft', 'СБОРКА']];
  byId('tabs').innerHTML = tabs
    .map(([key, label]) => `<button class="tab ${ui.tab === key ? 'on' : ''}" data-a="tab" data-v="${key}">${label}</button>`)
    .join('');
}

/* =====================================================================
   Price input and chance meter
   ===================================================================== */

function priceRow(defaultPrice) {
  return `<div class="pr"><button class="btn" data-a="adj" data-v="-50">−50</button><button class="btn" data-a="adj" data-v="-10">−10</button>
  <input id="offer" type="number" inputmode="numeric" min="0" step="10" value="${defaultPrice}" aria-label="Цена">
  <button class="btn" data-a="adj" data-v="10">+10</button><button class="btn" data-a="adj" data-v="50">+50</button></div>
  <div class="chance"><span>Чуйка</span><div class="cbar"><i id="cbar"></i></div><b id="cval">—</b></div>`;
}

const readOffer = input => Math.max(0, parseInt(input.value) || 0);

function chanceColor(chance) {
  if (chance >= 0.6) {
    return 'var(--green)';
  }
  return chance >= 0.3 ? 'var(--amber)' : 'var(--red)';
}

function updateChanceMeter() {
  const customer = state.cust;
  const input = byId('offer');
  if (!customer || !input || !byId('cval')) {
    return;
  }
  const chance = perceivedChance(customer, readOffer(input));
  byId('cval').textContent = chance >= 1 ? 'согласится' : chance <= 0 ? 'обидится' : `~${Math.round(chance * 100)}%`;
  byId('cbar').style.width = (chance * 100) + '%';
  byId('cbar').style.background = chanceColor(chance);
}

/* =====================================================================
   Deal pane
   ===================================================================== */

function option(action, disabled, title, description, side, sideClass = '') {
  return `<button class="opt" data-a="${action}" ${disabledIf(disabled)}><div><b>${title}</b><br><span>${description}</span></div><span${sideClass}>${side}</span></button>`;
}

function junkyardPane() {
  const pileButtons = state.junk.piles
    .map((pile, i) => `<button class="btn" data-a="dig" data-v="${i}" ${disabledIf(pile.dug || state.hours < 1)}>Куча ${i + 1}</button>`)
    .join('');
  return `<div class="hint">Нажмите на кучу хлама на сцене или выберите номер. Осталось часов: <b>${state.hours}</b>.</div>
      <div class="piles">${pileButtons}</div>
      <button class="btn pri" data-a="home" style="width:100%">Вернуться домой</button>`;
}

function eveningPane() {
  return `<div class="hint" style="margin-bottom:8px">Лавка закрыта. Осталось часов: <b>${state.hours}</b>. Верстак и сборка работают бесплатно.</div>
    <div class="opts">
      ${option('junk', state.hours < 2, 'Свалка «Кольцо Б»', 'Дорога 1 ч, каждая куча 1 ч. Запчасти, сломанные вещи, редкие находки. Иногда сторожевые дроны.', '→')}
      ${option('market', !canVisitMarket(), 'Барахолка у шлюза', `${MARKET.hours} ч. ${MARKET.parts} запчастей за ${MARKET.price} кр. Раз за вечер.`, MARKET.price)}
      ${option('sleep', false, 'Спать', 'Закончить день. Ночью: аренда, рейды, заражение склада.', '☾')}
    </div>`;
}

function emptyCounterPane() {
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

function collateralDescription(plan) {
  if (!plan.ok) {
    return 'Даже со всем складом не хватает.';
  }
  const goods = plan.items.length ? ' и ' + plan.items.map(item => itemName(item.t)).join(', ') : '';
  const heatNote = plan.hot ? ` <span class="ok">Розыск −${collateralHeatRelief(plan)}.</span>` : '';
  return `Заберёт ${plan.cash} кр.${goods}. Сначала берёт краденое (за 50%), остальное за 60%, сдачи не даёт.${heatNote}`;
}

function rentPane(customer) {
  const plan = planCollateral();
  const canPay = state.credits >= state.owed;
  const deferText = state.deferred ? 'Вторую отсрочку Гробов не даст.' : `Придёт через ${RENT.deferDays} дня, долг +20%: ${deferredDebt()} кр.`;
  let html = `<div class="thead"><div><span class="cname">${customer.name}</span><span class="kind" style="color:var(--red)">за арендой</span></div></div>
    <div class="card" style="flex-direction:column;gap:2px"><div class="rows">
      <span>К оплате</span><span class="price"><b>${state.owed} кр.</b>${state.deferred ? ' <span class="bad">с пеней</span>' : ''}</span>
      <span>У вас</span><span class="price ${canPay ? 'ok' : 'bad'}">${state.credits} кр.</span></div></div>
    <div class="opts" style="margin-top:8px">
      ${option('rentpay', !canPay, 'Заплатить', `Следующая аренда ${nextRent()} кр. через ${RENT.periodDays} дня.`, state.owed, ' class="price"')}
      ${option('rentdefer', state.deferred, 'Попросить отсрочку', deferText, '⧗')}
      ${option('rentitems', !(plan.ok && plan.items.length), 'Отдать деньги и товар', collateralDescription(plan), '⚖')}
    </div>`;
  if (!canPay && state.deferred && !plan.ok) {
    html += '<button class="btn" data-a="evict" style="width:100%;margin-top:8px;border-color:var(--red);color:var(--red)">Нечем платить</button>';
  }
  return html;
}

function customerHeader(customer) {
  return `<div class="thead"><div><span class="cname">${customer.name}</span><span class="kind ${customer.kind}">${customer.kind === 'sell' ? 'продаёт' : 'покупает'}</span></div>
  <div class="pips" title="Терпение">${meterCells(customer.max, customer.pat)}</div></div>`;
}

function knownFact(known, html) {
  return known ? html : UNKNOWN;
}

function sellerPane(customer) {
  const item = customer.item;
  const condition = `<span class="${item.cond < 40 ? 'warn' : ''}">${item.cond}%</span>`;
  const serial = item.stolen ? '<span class="bad">спилен</span>' : '<span class="ok">чистый</span>';
  const insides = item.infected ? '<span class="bad">ИИ-вирус</span>' : item.defect ? '<span class="warn">дефект</span>' : '<span class="ok">ок</span>';
  const defaultOffer = Math.min(state.credits, roundTo10(customer.ask * HAGGLE.sellerDefaultOfferShare));
  return `<div class="card">${iconCanvas(item.t, 'bigico', showsInfection(item))}<div style="min-width:0"><div class="rn">${itemName(item.t)}</div><div class="rows">
      <span>Состояние</span><span>${knownFact(item.k.cond, condition)}</span>
      <span>Серийник</span><span>${knownFact(item.k.serial, serial)}</span>
      <span>Начинка</span><span>${knownFact(item.k.flaw, insides)}</span>
      <span>Оценка</span><span class="price">~${estimatedValue(item)} кр.</span></div></div></div>
      <div class="tools"><button class="btn" data-a="insp" data-v="cond" ${disabledIf(customer.done.cond)}>Сканер</button>
      <button class="btn" data-a="insp" data-v="serial" ${disabledIf(customer.done.serial)}>Серийник</button>
      <button class="btn" data-a="insp" data-v="flaw" ${disabledIf(customer.done.flaw)}>Диагностика</button></div>
    <div class="deal"><div class="ask">Просит: <b class="price">${customer.ask}</b> кр. · у вас ${state.credits}</div>
      ${priceRow(defaultOffer)}
      <div class="acts"><button class="btn pri" data-a="offer">Предложить</button>
      <button class="btn amb" data-a="accept" ${disabledIf(customer.ask > state.credits)}>За ${customer.ask}</button>
      <button class="btn" data-a="refuse">Отпустить</button></div></div>`;
}

function buyerPane(customer) {
  const matching = state.inv.filter(item => item.t === customer.want);
  let html = `<div class="ask" style="margin-bottom:6px">Нужно: <b>${itemName(customer.want)}</b></div>`;
  if (!matching.length) {
    return html + '<div class="hint" style="margin-bottom:8px">На складе такого нет.</div><button class="btn" data-a="refuse" style="width:100%">Нет такого, до свидания</button>';
  }
  const tiles = matching.map(item => {
    const shown = customer.item && customer.item.uid === item.uid;
    return `<button class="tile ${shown ? 'on' : ''}" data-a="show" data-v="${item.uid}">${itemDots(item)}${iconCanvas(item.t, '', showsInfection(item))}<span>${conditionText(item)}</span><span class="tv">~${estimatedValue(item)}</span></button>`;
  }).join('');
  html += `<div class="shelf">${tiles}</div>`;
  if (!customer.item) {
    return html + '<div class="hint" style="margin:8px 0">Выложите товар на прилавок.</div><button class="btn" data-a="refuse" style="width:100%">Отпустить</button>';
  }
  return html + `<div class="deal"><div class="ask">Предлагает: <b class="price">${customer.offer}</b> кр.</div>${priceRow(roundTo10(customer.offer * HAGGLE.buyerDefaultAskShare))}
        <div class="acts"><button class="btn pri" data-a="ask">Назвать цену</button>
        <button class="btn amb" data-a="take">За ${customer.offer}</button>
        <button class="btn" data-a="refuse">Отпустить</button></div></div>`;
}

function dealPane() {
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

function benchButton(action, label, enabled) {
  const cost = BENCH_COST[action];
  return `<button class="btn" data-a="bench" data-v="${action}" ${enabled && state.parts >= cost ? '' : 'disabled'}><span>${label}</span><span class="price">${cost}⚙</span></button>`;
}

function workbench(item) {
  return `<div class="bench"><div class="card">${iconCanvas(item.t, 'bigico', showsInfection(item))}<div style="min-width:0"><div class="rn">${itemName(item.t)}</div><div class="hint">Оценка ~${estimatedValue(item)} кр.</div>${itemTags(item)}</div></div>
    <div class="bgrid">${benchButton('diag', 'Диагностика', !isFullyKnown(item))}${benchButton('repair', 'Ремонт +25%', item.cond < 100)}
    ${benchButton('fix', 'Убрать дефект', item.k.flaw && item.defect)}${benchButton('purge', 'Вычистить ИИ', item.k.flaw && item.infected)}
    ${benchButton('wipe', 'Перебить №', item.k.serial && item.stolen)}
    <button class="btn" data-a="bench" data-v="scrap" ${disabledIf(isOnCounter(item))}><span>Разобрать</span><span class="price">+${scrapValue(item)}⚙</span></button></div>
    <div class="hint" style="font-size:11px">Перебитый серийник: +1 к розыску.</div></div>`;
}

function inventoryPane() {
  if (!state.inv.length) {
    return '<div class="hint">Склад пуст. Покупайте у клиентов или копайте на свалке.</div>';
  }
  const tiles = state.inv
    .map(item => `<button class="tile ${ui.sel === item.uid ? 'on' : ''}" data-a="sel" data-v="${item.uid}">${itemDots(item)}${iconCanvas(item.t, '', showsInfection(item))}<span>${itemName(item.t)}</span><span class="tv">${conditionText(item)} · ~${estimatedValue(item)}</span></button>`)
    .join('');
  const html = `<div class="shelf">${tiles}</div>
  <div class="legend"><span><i class="d-q"></i>не проверено</span><span><i class="d-red"></i>краденое / ИИ</span><span><i class="d-amb"></i>дефект</span></div>`;
  const selected = findItem(ui.sel);
  return html + (selected ? workbench(selected) : '<div class="hint">Нажмите на предмет, чтобы открыть верстак.</div>');
}

/* =====================================================================
   Craft pane
   ===================================================================== */

function recipeRow(recipe, index) {
  const parts = Object.entries(recipe.need)
    .map(([type, count]) => `<span class="${availableOfType(type).length >= count ? 'have' : 'miss'}">${itemName(type)} ×${count}</span>`)
    .join(' + ');
  const partsClass = state.parts >= recipe.parts ? 'have' : 'miss';
  return `<div class="recipe">${iconCanvas(recipe.out)}<div class="rb"><div class="rn">${itemName(recipe.out)}</div><div class="need">${parts} + <span class="${partsClass}">${recipe.parts}⚙</span> · ~${ITEM_TYPES[recipe.out].basePrice} кр.</div></div>
    <button class="btn" data-a="craft" data-v="${index}" ${canCraft(recipe) ? '' : 'disabled'}>Собрать</button></div>`;
}

function craftPane() {
  return `<div class="recipes">${RECIPES.map(recipeRow).join('')}</div>
    <div class="hint" style="font-size:11px;margin:8px 0">Сборка даёт новый серийник: краденые детали становятся чистыми. ИИ-заражение переносится.</div>
    <button class="btn" data-a="parts" ${state.credits >= SUPPLIER.price ? '' : 'disabled'} style="width:100%">Заказать ${SUPPLIER.parts} запчастей · ${SUPPLIER.price} кр.</button>`;
}

/* =====================================================================
   Render
   ===================================================================== */

const PANES = { deal: dealPane, inv: inventoryPane, craft: craftPane };

export function renderPane() {
  const pane = byId('pane');
  const scrollTop = pane.scrollTop;
  pane.innerHTML = (PANES[ui.tab] || dealPane)();
  pane.scrollTop = scrollTop;
  paintIcons();
  updateChanceMeter();
}

export function render() {
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
function showFloatingText(text, color) {
  const element = document.createElement('div');
  element.className = 'fx';
  element.textContent = text;
  element.style.color = color;
  byId('stage').appendChild(element);
  setTimeout(() => element.remove(), FLOATING_TEXT_LIFETIME_MS);
}

/** Shows floating numbers queued by the game rules. */
function flushFeedback() {
  feedback.floats.splice(0).forEach(({ text, color }) => showFloatingText(text, color));
}

function openModal(title, body, buttons) {
  byId('mbox').innerHTML = `<h2>${title}</h2>${body}<div class="mbtns">${buttons}</div>`;
  byId('modal').hidden = false;
}

function closeModal() {
  byId('modal').hidden = true;
}

function showEviction() {
  openModal('Выселение', `<p>${state.over}</p>`, NEW_GAME_BUTTON);
}

function showMorningReport(events) {
  const title = state.over ? 'Выселение' : `Утро. День ${state.day}`;
  const body = `<ul>${events.map(event => `<li>${event}</li>`).join('')}</ul>`;
  const buttons = state.over ? NEW_GAME_BUTTON : '<button class="btn pri" data-a="close">Открыть лавку</button>';
  openModal(title, body, buttons);
}

function showBuyout() {
  openModal(
    'Лавка ваша',
    `<p>Выкуплено на ${state.day}-й день. Можно торговать дальше без аренды или начать заново.</p>`,
    '<button class="btn pri" data-a="close">Продолжить</button><button class="btn" data-a="newgame-yes">Новая лавка</button>',
  );
}

function openSaveMenu() {
  openModal('Сохранение', `<p class="hint" style="margin:0">Скопируйте код и сохраните в заметки. На другом устройстве или в другой версии игры вставьте его в поле загрузки.</p>
      <label for="savecode">Код текущей игры · день ${state.day}, ${state.credits} кр.</label><textarea id="savecode" readonly>${exportSave()}</textarea>
      <div class="mbtns"><button class="btn pri" data-a="copysave">Скопировать</button></div>
      <label for="loadcode">Загрузить сейв</label><textarea id="loadcode" placeholder="Вставьте код"></textarea>
      <div id="savemsg" class="hint"></div>`, '<button class="btn amb" data-a="loadsave">Загрузить</button><button class="btn" data-a="close">Закрыть</button>');
}

function copySaveCode() {
  const textarea = byId('savecode');
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
function loadSaveCode() {
  const loaded = importSave(byId('loadcode').value);
  if (!loaded) {
    byId('savemsg').textContent = 'Код не распознан. Проверьте, что скопирован весь код целиком.';
    byId('savemsg').style.color = 'var(--red)';
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

function openLog() {
  openModal('Лента', `<ul>${state.log.map(line => `<li>${line}</li>`).join('')}</ul>`, CLOSE_BUTTON);
}

function confirmNewGame() {
  openModal('Начать заново?', '<p>Текущая лавка будет потеряна.</p>', '<button class="btn pri" data-a="newgame-yes">Да, заново</button><button class="btn" data-a="close">Отмена</button>');
}

/* =====================================================================
   Event handling
   ===================================================================== */

/** Returned by a handler when the screen must not be re-rendered. */
const NO_RENDER = Symbol('no-render');

const offerValue = () => {
  const input = byId('offer');
  return input ? readOffer(input) : 0;
};

/** data-a → handler(value). Every handler re-renders unless it returns NO_RENDER. */
const ACTIONS = {
  // counter
  adj: value => {
    const input = byId('offer');
    input.value = Math.max(0, offerValue() + +value);
    updateChanceMeter();
    return NO_RENDER;
  },
  call: () => callNextCustomer(),
  insp: value => inspect(value),
  offer: () => offerToSeller(offerValue()),
  accept: () => buyFromSeller(state.cust.ask),
  refuse: () => customerLeaves(),
  show: value => presentItem(+value),
  ask: () => askBuyer(offerValue()),
  take: () => sellToBuyer(state.cust.offer),
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
    ui.tab = value;
  },
  sel: value => {
    ui.sel = ui.sel === +value ? null : +value;
  },
  bench: value => useWorkbench(value),
  craft: value => craft(+value),
  parts: () => orderParts(),
  // evening
  junk: () => {
    goToJunkyard();
    ui.tab = 'deal';
  },
  dig: value => digPile(+value),
  home: () => goHome(),
  market: () => visitMarket(),
  sleep: () => showMorningReport(sleepUntilMorning()),
  // header & modals
  music: () => toggleMusic(),
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

function onClick(event) {
  const button = event.target.closest('[data-a]');
  if (!button || button.disabled) {
    return;
  }
  const handler = Object.hasOwn(ACTIONS, button.dataset.a) ? ACTIONS[button.dataset.a] : null;
  const result = handler ? handler(button.dataset.v) : undefined;
  flushFeedback();
  if (result === NO_RENDER) {
    return;
  }
  render();
}

function onSceneCanvasClick(event) {
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
function onKeyDown(event) {
  if (event.key === 'Enter' && event.target.id === 'offer') {
    const submit = document.querySelector('[data-a="offer"],[data-a="ask"]');
    if (submit) {
      submit.click();
    }
  }
}

export function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', event => {
    if (event.target.id === 'offer') {
      updateChanceMeter();
    }
  });
  document.addEventListener('keydown', onKeyDown);
  onSceneClick(onSceneCanvasClick);
}
