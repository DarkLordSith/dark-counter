// =====================================================================
//  lang/names.ts — customer names, one list per language (task 35; were
//  the same in every language in task 34). Not a transliteration: each
//  language has its own name of the same customer, by index. The save
//  keeps the Russian name (an older build shows it as it is); the screen
//  and the log translate it by its place in the list (i18n.ts → nameRef).
//  Allowed to hold Cyrillic (tests/unit/i18n.test.ts → the exceptions).
// =====================================================================

/** Russian names: the ones the save keeps (cust.name). */
export const HUMAN_NAMES = ['Рыжий Вик', 'Тётя Ома', 'Борн', 'Лиса из шлюза', 'Механик Ду', 'Стас «Провод»', 'Мира Кейн', 'Тихий Йоэль', 'Нана Рокет', 'Гарри Шов', 'Курт Дымов', 'Пак'];
export const ROBOT_NAMES = ['Кси-9', 'Офелия-3', 'ТР-404', 'Болт', 'Юнит-7', 'Мама-Кран', 'Р-Скрип', 'Ось'];

// draft: English names, wait for the scriptwriter (same order as above)
export const HUMAN_NAMES_EN = ['Red Vic', 'Auntie Oma', 'Born', 'Airlock Fox', 'Du the Mechanic', 'Stas "Wire"', 'Mira Kane', 'Quiet Yoel', 'Nana Rocket', 'Harry Stitch', 'Kurt Dymov', 'Pak'];
export const ROBOT_NAMES_EN = ['Xi-9', 'Ophelia-3', 'TR-404', 'Bolt', 'Unit-7', 'Mama Crane', 'R-Squeak', 'Axle'];
