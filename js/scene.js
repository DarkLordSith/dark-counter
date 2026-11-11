// =====================================================================
//  scene.js — the 160×100 pixel scene: shop, junkyard, customers,
//  item icons and the animation loop. Everything is drawn with plain
//  rectangles; sprites are lists of [x, y, w, h, color] relative to an
//  anchor point.
// =====================================================================
import { COLOR, CUSTOMERS_PER_DAY, JUNK_PILES, LANDLORD_SEED } from './data.js';
import { actor, COUNTER_X, DOOR_X, state } from './state.js';
import { byId } from './util.js';

/* ---------- config ---------- */
const SCENE_W = 160;
const SCENE_H = 100;
const ICON_W = 28;
const ICON_H = 16;
const WALK_SPEED = 46; // px per second
const MAX_FRAME_DT = 0.05; // s, avoids jumps after a background tab
const DOOR_OPENS_AT_X = 104;
const DOOR_SPEED = 8;
const DOORWAY_LEFT_X = 118; // actor is clipped by the door frame beyond this x
const EXIT_MARGIN = 4;
const SCAN_DURATION_MS = 700;
const SIGN_FLICKER_CHANCE = 0.015;
const LAMP_FLICKER_CHANCE = 0.04;

const SHADE = {
  shadow13: 'rgba(0,0,0,.13)',
  shadow15: 'rgba(0,0,0,.15)',
  shadow18: 'rgba(0,0,0,.18)',
  shadow20: 'rgba(0,0,0,.2)',
  shadow25: 'rgba(0,0,0,.25)',
  closedEye: 'rgba(0,0,0,.35)',
  shine20: 'rgba(255,255,255,.2)',
};
const LANDLORD_RED = '#8a1f2e';
const HUMAN_EYE_WHITE = '#e8e8f0';
const PUPIL = '#14121c';
const SCREEN_DARK = '#06201f';
const WALL = '#232a45';
const PANEL_DOOR = '#2a3152';
const PANEL_EDGE = '#3a4370';

/* ---------- drawing primitives ---------- */
const sceneCanvas = byId('scn');
let ctx = sceneCanvas.getContext('2d');

function fillRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function fillRects(originX, originY, rects) {
  for (const [x, y, w, h, color] of rects) {
    fillRect(originX + x, originY + y, w, h, color);
  }
}

function fillPolygon(color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  points.slice(1).forEach(point => ctx.lineTo(...point));
  ctx.closePath();
  ctx.fill();
}

function fillCircle(color, x, y, radius) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 7);
  ctx.fill();
}

function withClip(x, y, w, h, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  draw();
  ctx.restore();
}

/** 0/1 square wave with the given period. */
const flicker = (now, periodMs) => (now / periodMs | 0) % 2;

/* ---------- appearance ---------- */

/** Deterministic PRNG (Park–Miller) so a seed always gives the same face. */
function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

const pickSeeded = (random, list) => list[Math.floor(random() * list.length)];

const LANDLORD_LOOK = { kind: 'landlord', skin: '#d9a07a', jacket: '#1d1a26', jdark: '#0e0c14', metal: COLOR.dim, metal2: COLOR.steel, eye: COLOR.red };

/** Customer look from a seed: kind 'human' | 'android' | 'box' | 'dome' | 'landlord'. */
export function appearanceFor(seed) {
  if (seed === LANDLORD_SEED) {
    return LANDLORD_LOOK;
  }
  const random = seededRandom(seed);
  const kindRoll = random();
  const hue = Math.floor(random() * 360);
  return {
    kind: kindRoll < 0.6 ? 'human' : kindRoll < 0.74 ? 'android' : kindRoll < 0.88 ? 'box' : 'dome',
    skin: pickSeeded(random, ['#f1c7a3', '#d9a07a', '#a8714f', '#6e4a35', '#e3b48f']),
    hair: pickSeeded(random, ['#2a2233', '#d94f8a', '#46d3c9', '#f0a33e', '#e8e8f0', '#5b3b2a', '#7a5cff']),
    style: Math.floor(random() * 6),
    jacket: `hsl(${hue} 30% 34%)`,
    jdark: `hsl(${hue} 30% 22%)`,
    shirt: `hsl(${(hue + 40) % 360} 15% 70%)`,
    trim: `hsl(${(hue + 150) % 360} 65% 60%)`,
    eye: pickSeeded(random, ['#46d3c9', '#ff6372', '#f0a33e', '#7fd98e', '#ffffff']),
    acc: Math.floor(random() * 5),
    pads: random() < 0.45,
    metal: pickSeeded(random, ['#8b92b5', '#a8925a', '#6f7a8c', '#b5beca', '#8a5f55']),
    metal2: pickSeeded(random, ['#5a6080', '#4a5266', '#6e5a3a']),
  };
}

/* ---------- customer sprites (anchor: horizontal center, top of scene + bob) ---------- */

function landlordSprite(look, now, blink) {
  return [
    // coat
    [-13, 40, 26, 31, look.jacket],
    [-15, 43, 30, 28, look.jacket],
    [5, 40, 10, 31, 'rgba(0,0,0,.22)'],
    // shirt and tie
    [-3, 39, 6, 9, '#c9ccd8'],
    [-1, 40, 2, 10, LANDLORD_RED],
    // lapels
    [-7, 40, 4, 12, '#2a2636'],
    [3, 40, 4, 12, '#2a2636'],
    // gold chain
    [-9, 53, 18, 1, COLOR.gold],
    [-7, 54, 14, 1, COLOR.gold],
    [-1, 55, 2, 2, COLOR.gold],
    [-9, 58, 3, 1, COLOR.dim],
    // neck and head
    [-3, 35, 6, 4, look.skin],
    [-6, 22, 12, 13, look.skin],
    [-5, 35, 10, 1, look.skin],
    [-7, 31, 1, 3, look.skin],
    [6, 31, 1, 3, look.skin],
    [3, 22, 3, 13, SHADE.shadow13],
    // eye and cyber monocle
    [-4, 28, 2, 1, blink ? SHADE.closedEye : PUPIL],
    [1, 27, 4, 3, COLOR.steel],
    [2, 28, 2, 1, flicker(now, 600) ? look.eye : LANDLORD_RED],
    // moustache
    [-4, 31, 8, 2, '#3a2a2a'],
    [-5, 32, 2, 1, '#3a2a2a'],
    [3, 32, 2, 1, '#3a2a2a'],
    // hat
    [-10, 20, 20, 2, '#0e0c14'],
    [-6, 12, 12, 8, '#0e0c14'],
    [-6, 18, 12, 1, LANDLORD_RED],
  ];
}

const HAIR_STYLES = [
  look => [[-5, 21, 10, 3, look.hair], [-6, 22, 1, 5, look.hair], [5, 22, 1, 5, look.hair]],
  look => [[-1, 17, 2, 6, look.hair], [-2, 19, 4, 3, look.hair]],
  look => [[-5, 21, 10, 3, look.hair], [-6, 22, 2, 4, look.hair], [4, 22, 2, 4, look.hair]],
  look => [[-7, 20, 14, 3, look.jdark], [-7, 23, 2, 13, look.jdark], [5, 23, 2, 13, look.jdark]], // hood
  look => [[-5, 21, 10, 3, look.hair], [-2, 18, 4, 3, look.hair]],
  look => [[-6, 20, 12, 4, look.trim], [-6, 23, 9, 1, COLOR.ink]], // cap
];

const ACCESSORIES = [
  () => [],
  look => [[-5, 27, 10, 2, look.eye], [-5, 27, 10, 1, 'rgba(255,255,255,.35)']], // visor
  () => [[-5, 30, 10, 5, COLOR.line], [-4, 32, 8, 1, COLOR.sceneBg]], // mask
  look => [[0, 26, 4, 4, COLOR.line], [1, 28, 2, 1, look.eye]], // eyepiece
  () => [],
];

function humanoidSprite(look, blink) {
  const android = look.kind === 'android';
  const human = look.kind === 'human';
  const skin = android ? look.metal : look.skin;
  const collar = android ? look.metal2 : look.shirt;
  const rects = [];
  // back layer: hood or long hair
  if (human && look.style === 3) {
    rects.push([-8, 20, 16, 18, look.jdark]);
  }
  if (human && look.style === 2) {
    rects.push([-7, 22, 3, 15, look.hair], [4, 22, 3, 15, look.hair]);
  }
  // body
  rects.push(
    [-9, 39, 18, 1, look.jacket],
    [-11, 40, 22, 1, look.jacket],
    [-12, 41, 24, 30, look.jacket],
    [4, 41, 8, 30, 'rgba(0,0,0,.16)'],
    [-8, 45, 1, 24, look.jdark],
    [7, 45, 1, 24, look.jdark],
    [-3, 39, 6, 4, collar],
    [-2, 43, 4, 1, collar],
    [0, 44, 1, 26, look.jdark],
  );
  if (look.pads) {
    rects.push([-12, 40, 5, 3, look.trim], [7, 40, 5, 3, look.trim]);
  }
  // neck and head
  rects.push(
    [-2, 35, 4, 4, skin],
    [-2, 35, 4, 1, SHADE.shadow25],
    [-4, 22, 8, 1, skin],
    [-5, 23, 10, 11, skin],
    [-4, 34, 8, 1, skin],
    [-6, 27, 1, 3, skin],
    [5, 27, 1, 3, skin],
    [3, 23, 2, 11, SHADE.shadow13],
  );
  if (android) {
    const eye = blink ? 'rgba(0,0,0,.4)' : look.eye;
    rects.push(
      [-5, 30, 10, 1, 'rgba(0,0,0,.3)'],
      [0, 23, 1, 4, SHADE.shadow25],
      [-7, 26, 2, 5, look.metal2],
      [5, 26, 2, 5, look.metal2],
      [-3, 28, 2, 1, eye],
      [1, 28, 2, 1, eye],
      [-2, 32, 4, 1, COLOR.line],
      [-5, 23, 10, 1, SHADE.shine20],
    );
    return rects;
  }
  if (blink) {
    rects.push([-3, 28, 2, 1, SHADE.closedEye], [1, 28, 2, 1, SHADE.closedEye]);
  } else {
    rects.push([-3, 28, 2, 1, HUMAN_EYE_WHITE], [-2, 28, 1, 1, PUPIL], [1, 28, 2, 1, HUMAN_EYE_WHITE], [1, 28, 1, 1, PUPIL]);
  }
  rects.push(
    [-3, 26, 2, 1, look.hair], // brows
    [1, 26, 2, 1, look.hair],
    [0, 29, 1, 2, 'rgba(0,0,0,.18)'], // nose
    [-1, 32, 3, 1, 'rgba(110,40,50,.7)'], // mouth
  );
  rects.push(...HAIR_STYLES[look.style](look));
  rects.push(...ACCESSORIES[look.acc](look));
  return rects;
}

function boxBotSprite(look, now, blink) {
  return [
    // body and shoulders
    [-11, 39, 22, 32, look.metal],
    [4, 39, 7, 32, SHADE.shadow18],
    [-14, 39, 5, 5, look.metal2],
    [9, 39, 5, 5, look.metal2],
    [-12, 41, 1, 1, COLOR.ink],
    [11, 41, 1, 1, COLOR.ink],
    // chest panel
    [-6, 44, 12, 9, COLOR.ink],
    [-4, 46, 2, 2, flicker(now, 500) ? COLOR.cyan : '#1d4a47'],
    [0, 46, 2, 2, COLOR.amber],
    [-4, 50, 8, 1, COLOR.green],
    [-9, 56, 1, 1, look.metal2],
    [8, 56, 1, 1, look.metal2],
    // neck
    [-3, 34, 2, 5, look.metal2],
    [1, 34, 2, 5, look.metal2],
    // head and screen face
    [-7, 21, 14, 13, look.metal],
    [-7, 21, 14, 1, 'rgba(255,255,255,.25)'],
    [3, 22, 4, 12, SHADE.shadow15],
    [-5, 24, 10, 6, SCREEN_DARK],
    blink ? [-4, 27, 3, 1, look.eye] : [-4, 26, 3, 2, look.eye],
    blink ? [1, 27, 3, 1, look.eye] : [1, 26, 3, 2, look.eye],
    // grille mouth
    [-4, 31, 8, 1, COLOR.ink],
    [-3, 32, 1, 1, COLOR.ink],
    [0, 32, 1, 1, COLOR.ink],
    [3, 32, 1, 1, COLOR.ink],
    // ears and antenna
    [-8, 25, 1, 5, look.metal2],
    [7, 25, 1, 5, look.metal2],
    [0, 16, 1, 5, look.metal2],
    [-1, 15, 3, 2, flicker(now, 700) ? look.eye : COLOR.line],
  ];
}

function domeBotSprite(look, now) {
  const rects = [
    // arms
    [-13, 42, 3, 26, look.metal2],
    [10, 42, 3, 26, look.metal2],
    // body
    [-9, 40, 18, 31, look.metal],
    [-10, 44, 20, 24, look.metal],
    [3, 40, 7, 31, SHADE.shadow18],
  ];
  for (let x = -9; x < 9; x += 4) {
    rects.push([x, 53, 2, 2, COLOR.amber]);
  }
  const eyeShift = Math.round(Math.sin(now / 700) * 3);
  rects.push(
    [-4, 37, 8, 3, look.metal2],
    // dome head
    [-3, 19, 6, 1, look.metal],
    [-5, 20, 10, 1, look.metal],
    [-6, 21, 12, 2, look.metal],
    [-7, 23, 14, 14, look.metal],
    [-4, 21, 3, 1, 'rgba(255,255,255,.4)'],
    [3, 23, 4, 14, SHADE.shadow15],
    // scanning eye
    [-6, 27, 12, 4, COLOR.ink],
    [-1 + eyeShift, 28, 3, 2, look.eye],
    [-5, 33, 10, 1, look.metal2],
  );
  return rects;
}

function drawCustomer(centerX, bob, look, now) {
  const blink = (now % 4200) < 140;
  let rects;
  if (look.kind === 'landlord') {
    rects = landlordSprite(look, now, blink);
  } else if (look.kind === 'human' || look.kind === 'android') {
    rects = humanoidSprite(look, blink);
  } else if (look.kind === 'box') {
    rects = boxBotSprite(look, now, blink);
  } else {
    rects = domeBotSprite(look, now);
  }
  fillRects(centerX, bob, rects);
}

/** Hands resting on the counter, drawn over the item. */
function drawHands(centerX, look) {
  const rects = [];
  const handXs = [-18, 11];
  if (look.kind === 'human' || look.kind === 'landlord') {
    if (look.kind === 'landlord') {
      rects.push([-17, 69, 4, 1, COLOR.gold]); // ring
    }
    handXs.forEach(x => rects.push(
      [x, 64, 7, 3, look.jacket],
      [x, 67, 7, 3, look.skin],
      [x + 1, 66, 6, 1, look.skin],
      [x + 2, 68, 1, 2, SHADE.shadow20],
      [x + 4, 68, 1, 2, SHADE.shadow20],
    ));
  } else {
    const metal = look.kind === 'android' ? look.metal : look.metal2;
    handXs.forEach(x => rects.push(
      [x + 1, 63, 5, 4, look.kind === 'android' ? look.jacket : metal],
      [x, 67, 7, 3, metal],
      [x, 69, 1, 1, COLOR.ink],
      [x + 3, 69, 1, 1, COLOR.ink],
      [x + 6, 69, 1, 1, COLOR.ink],
      [x + 1, 67, 5, 1, SHADE.shine20],
    ));
  }
  fillRects(centerX, 0, rects);
}

/* ---------- pixel font for the shop sign ---------- */
const GLYPHS = {
  'Л': ['011', '101', '101', '101', '101'],
  'А': ['010', '101', '111', '101', '101'],
  'В': ['110', '101', '110', '101', '110'],
  'К': ['101', '110', '100', '110', '101'],
  '7': ['111', '001', '010', '010', '010'],
  'Б': ['111', '100', '110', '101', '110'],
  ' ': ['000', '000', '000', '000', '000'],
};
const GLYPH_ADVANCE = 4;

function drawPixelText(text, x, y, color) {
  [...text].forEach((char, index) => {
    const glyph = GLYPHS[char];
    if (!glyph) {
      return;
    }
    glyph.forEach((row, rowY) => [...row].forEach((bit, colX) => {
      if (bit === '1') {
        fillRect(x + index * GLYPH_ADVANCE + colX, y + rowY, 1, 1, color);
      }
    }));
  });
}

/* ---------- item sprites (anchor: horizontal center, bottom) ---------- */
const ITEM_TONE = { mid: COLOR.steel, light: COLOR.dim, dark: COLOR.line };

const ITEM_SPRITES = {
  comm: () => [
    [-3, -10, 6, 10, '#2a2f4a'],
    [-2, -9, 4, 6, COLOR.cyan],
    [-2, -9, 4, 1, '#a5f0ea'],
    [-1, -2, 2, 1, ITEM_TONE.light],
    [2, -12, 1, 2, ITEM_TONE.light],
  ],
  battery: now => [
    [-6, -6, 12, 6, '#2f6a42'],
    [6, -4, 1, 2, '#c9ccd8'],
    [-5, -5, Math.max(1, Math.floor((now / 400) % 5) + 1) * 2, 4, COLOR.green], // charge level
    [-6, -6, 12, 1, SHADE.shine20],
  ],
  servo: () => [
    [-5, -7, 10, 7, ITEM_TONE.mid],
    [-2, -9, 4, 2, ITEM_TONE.light],
    [-1, -5, 2, 2, COLOR.amber],
    [3, -7, 2, 7, SHADE.shadow20],
    [-7, -3, 2, 2, ITEM_TONE.dark],
    [5, -3, 2, 2, ITEM_TONE.dark],
  ],
  cutter: now => [
    [-9, -4, 13, 4, ITEM_TONE.mid],
    [-8, -1, 3, 1, ITEM_TONE.dark],
    [-7, 0, 2, 0, ITEM_TONE.dark],
    [4, -3, 4, 2, ITEM_TONE.dark],
    [8, -3, 1, 2, flicker(now, 200) ? COLOR.red : '#ff9aa3'],
    [-9, -4, 13, 1, SHADE.shine20],
  ],
  visor: () => [
    [-8, -3, 1, 2, ITEM_TONE.dark],
    [7, -3, 1, 2, ITEM_TONE.dark],
    [-7, -4, 14, 3, ITEM_TONE.dark],
    [-6, -4, 12, 2, COLOR.cyan],
    [-6, -4, 5, 1, '#a5f0ea'],
  ],
  drone: () => [
    [-3, -4, 6, 4, ITEM_TONE.mid],
    [-9, -6, 6, 1, ITEM_TONE.light],
    [3, -6, 6, 1, ITEM_TONE.light],
    [-7, -5, 1, 3, ITEM_TONE.dark],
    [6, -5, 1, 3, ITEM_TONE.dark],
    [-1, -3, 2, 1, COLOR.red],
  ],
  chip: now => {
    const rects = [
      [-4, -6, 8, 6, '#1f6b4f'],
      [-2, -4, 4, 2, '#0d0f18'],
    ];
    for (let pin = 0; pin < 4; pin++) {
      rects.push([-4 + pin * 2 + 1, -7, 1, 1, COLOR.gold], [-4 + pin * 2 + 1, 0, 1, 0, COLOR.gold]);
    }
    rects.push([2, -2, 1, 1, flicker(now, 300) ? COLOR.green : '#1f6b4f']);
    return rects;
  },
  arm: () => [
    [-11, -4, 8, 4, ITEM_TONE.light],
    [-3, -4, 6, 3, ITEM_TONE.mid],
    [-3, -3, 1, 1, COLOR.cyan],
    [3, -5, 3, 5, ITEM_TONE.light],
    [6, -5, 2, 1, ITEM_TONE.light],
    [6, -2, 2, 1, ITEM_TONE.light],
    [-11, -1, 8, 1, SHADE.shadow25],
  ],
};

function drawItem(type, centerX, bottomY, now, infected) {
  const sprite = ITEM_SPRITES[type];
  if (sprite) {
    fillRects(centerX, bottomY, sprite(now));
  }
  if (infected && flicker(now, 250)) {
    fillRect(centerX - 1, bottomY - 12, 2, 2, COLOR.red);
  }
}

/** Draws every <canvas data-ico> icon currently in the DOM. */
export function paintIcons() {
  document.querySelectorAll('canvas[data-ico]').forEach(canvas => {
    const sceneCtx = ctx;
    ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, ICON_W, ICON_H);
    drawItem(canvas.dataset.ico, ICON_W / 2, ICON_H - 2, 0, canvas.dataset.inf === '1');
    ctx = sceneCtx;
  });
}

/* ---------- shop ---------- */
const STARS = Array.from({ length: 26 }, () => ({
  x: Math.random() * 48,
  y: Math.random() * 28,
  speed: 0.6 + Math.random() * 2.2,
  bright: Math.random() < 0.25,
}));

function drawBackWall() {
  fillRect(0, 0, SCENE_W, SCENE_H, COLOR.sceneBg);
  for (let x = 0; x < SCENE_W; x += 20) {
    fillRect(x, 0, 1, 68, '#1b2034');
  }
  fillRect(0, 46, SCENE_W, 1, '#1b2034');
  for (let x = 10; x < SCENE_W; x += 20) {
    fillRect(x, 3, 1, 1, '#262c46');
    fillRect(x, 43, 1, 1, '#262c46');
  }
}

/** Porthole with drifting stars, a planet and a passing ship. */
function drawWindow(seconds) {
  fillRect(5, 7, 54, 34, WALL);
  fillRect(7, 9, 50, 30, '#05070f');
  withClip(7, 9, 50, 30, () => {
    STARS.forEach(star => {
      const x = ((star.x - seconds * star.speed) % 50 + 50) % 50;
      fillRect(7 + x, 9 + star.y, 1, 1, star.bright ? COLOR.fg : '#5b6288');
    });
    fillCircle('#3a2a52', 52, 44, 15);
    fillCircle('#4e3a6e', 50, 46, 13);
    fillRect(34, 34, 26, 1, 'rgba(240,163,62,.55)');
    const shipProgress = (seconds % 15) / 15;
    if (shipProgress < 0.6) {
      const x = shipProgress / 0.6 * 66 - 8;
      fillRect(7 + x, 17, 6, 1, COLOR.dim);
      fillRect(7 + x + 2, 16, 2, 1, COLOR.dim);
      fillRect(7 + x - 1, 17, 1, 1, COLOR.amber);
    }
  });
  fillRect(9, 11, 1, 7, 'rgba(255,255,255,.07)');
}

function drawShelves(seconds) {
  fillRect(5, 50, 54, 2, COLOR.line);
  [[7, '#3c4466', 8, 6], [17, '#5a3f2e', 6, 8], [25, '#2f6a42', 10, 5], [38, '#4a2f55', 7, 7], [47, '#3c4466', 9, 4]]
    .forEach(([x, color, w, h]) => fillRect(x, 50 - h, w, h, color));
  fillRect(27, 46, 2, 1, (seconds * 2 | 0) % 3 ? COLOR.green : '#244a2f');
  fillRect(49, 47, 1, 1, (seconds * 1.3 | 0) % 2 ? COLOR.red : '#4a1f26');
  fillRect(5, 60, 54, 2, COLOR.line);
  [[9, COLOR.line, 12, 5], [24, '#3c4466', 6, 7], [34, COLOR.steel, 14, 4], [50, '#4a2f55', 6, 6]]
    .forEach(([x, color, w, h]) => fillRect(x, 60 - h, w, h, color));
}

function drawDoorway() {
  fillRect(118, 8, 40, 60, WALL);
  fillRect(122, 12, 32, 56, '#090b16');
  fillRect(122, 12, 32, 2, 'rgba(70,211,201,.25)');
}

/** Neon "ЛАВКА 7Б" sign and the ceiling lamp. Off at night, flickers by day. */
function drawSignAndLamp(night) {
  const brightness = night ? 0 : (Math.random() < SIGN_FLICKER_CHANCE ? 0.3 : 1);
  fillRect(59, 3, 42, 11, COLOR.ink);
  fillRect(60, 4, 40, 9, 'rgba(70,211,201,' + (0.10 * brightness) + ')');
  drawPixelText('ЛАВКА 7Б', 65, 6, night ? '#1f3b3c' : brightness < 1 ? '#2a7f79' : COLOR.cyan);
  fillRect(77, 0, 6, 2, COLOR.line);
  if (!night) {
    fillPolygon('rgba(240,163,62,.06)', [[78, 2], [82, 2], [112, 68], [48, 68]]);
  }
}

function drawWalkingActor(look, now) {
  const walking = actor.phase === 'in' || actor.phase === 'out';
  const bob = walking ? flicker(now, 140) : flicker(now, 900);
  ctx.save();
  if (actor.x > DOORWAY_LEFT_X) {
    ctx.beginPath();
    ctx.rect(122, 0, 38, SCENE_H);
    ctx.clip();
  }
  drawCustomer(Math.round(actor.x), bob, look, now);
  ctx.restore();
}

function doorLightColor() {
  if (actor.phase === 'in' || actor.phase === 'out') {
    return COLOR.green;
  }
  return state.phase === 'shop' && state.slot < CUSTOMERS_PER_DAY && !state.over ? COLOR.amber : COLOR.red;
}

function drawSlidingDoor() {
  const panelWidth = 16 * (1 - actor.doorOpen);
  fillRect(122, 12, panelWidth, 56, PANEL_DOOR);
  fillRect(154 - panelWidth, 12, panelWidth, 56, PANEL_DOOR);
  if (panelWidth > 1) {
    fillRect(122 + panelWidth - 1, 12, 1, 56, PANEL_EDGE);
    fillRect(154 - panelWidth, 12, 1, 56, PANEL_EDGE);
  }
  fillRect(118, 8, 4, 60, WALL);
  fillRect(154, 8, 4, 60, WALL);
  fillRect(132, 9, 12, 2, doorLightColor());
}

function drawCounter(seconds) {
  fillRect(0, 68, SCENE_W, 32, '#1f2440');
  fillRect(0, 68, SCENE_W, 2, PANEL_EDGE);
  fillRect(0, 68, SCENE_W, 1, '#4f5d94');
  for (let x = 4; x < SCENE_W; x += 26) {
    fillRect(x, 75, 22, 20, '#1a1e36');
    fillRect(x, 75, 22, 1, '#262c4a');
  }
  fillRect(0, 97, SCENE_W, 3, '#171b2d');
  for (let x = 0; x < SCENE_W; x += 8) {
    fillRect(x, 97, 4, 1, 'rgba(240,163,62,.35)');
  }
  // card reader
  fillRect(18, 64, 12, 4, COLOR.line);
  fillRect(19, 65, 3, 2, COLOR.cyan);
  fillRect(26, 63, 2, 1, COLOR.steel);
  // terminal with scrolling lines
  fillRect(112, 52, 24, 15, COLOR.line);
  fillRect(114, 54, 20, 11, SCREEN_DARK);
  for (let line = 0; line < 3; line++) {
    fillRect(116, 56 + line * 3, 6 + ((seconds * 3 + line * 5) | 0) % 10, 1, COLOR.cyan);
  }
  fillRect(122, 67, 4, 1, COLOR.line);
}

function drawScanLine(now) {
  const progress = (now - actor.scanStart) / SCAN_DURATION_MS;
  if (progress >= 0 && progress < 1) {
    const y = 56 + progress * 12;
    fillRect(66, y, 28, 1, COLOR.cyan);
    fillRect(66, y - 1, 28, 1, 'rgba(70,211,201,.35)');
    fillRect(66, y + 1, 28, 1, 'rgba(70,211,201,.35)');
  }
}

function drawShop(now) {
  const seconds = now / 1000;
  const night = state.phase === 'evening';
  drawBackWall();
  drawWindow(seconds);
  drawShelves(seconds);
  drawDoorway();
  drawSignAndLamp(night);
  const look = actor.phase !== 'empty' ? appearanceFor(actor.seed) : null;
  if (look) {
    drawWalkingActor(look, now);
  }
  drawSlidingDoor();
  drawCounter(seconds);
  if (look && actor.phase === 'idle') {
    drawHands(Math.round(actor.x), look);
    const customer = state.cust;
    if (customer && customer.item) {
      drawItem(customer.item.t, COUNTER_X, 68, now, customer.item.k.flaw && customer.item.infected);
      drawScanLine(now);
    }
  }
  if (night) {
    fillRect(0, 0, SCENE_W, SCENE_H, 'rgba(4,5,16,.5)');
  }
}

/* ---------- junkyard ---------- */

function drawPile(index, now) {
  const pile = JUNK_PILES[index];
  const pileState = state.junk.piles[index];
  const random = seededRandom(pileState.seed);
  const height = pileState.dug ? 5 : pile.h;
  const half = pile.w / 2;
  // mound silhouette
  for (let dx = -half; dx < half; dx += 2) {
    const k = dx / half;
    const columnHeight = Math.max(1, Math.round(height * (1 - k * k) + random() * 3));
    const color = pileState.dug ? '#1c2035' : ((dx / 2) % 2 ? '#2a2f4a' : '#252a42');
    fillRect(pile.x + dx, pile.y - columnHeight, 2, columnHeight, color);
  }
  if (pileState.dug) {
    fillRect(pile.x - 3, pile.y - 6, 1, 1, '#5b6288');
    fillRect(pile.x + 2, pile.y - 5, 1, 1, '#5b6288');
    return;
  }
  // scattered junk
  for (let j = 0; j < 5; j++) {
    const px = pile.x - half * 0.6 + random() * pile.w * 0.6;
    const py = pile.y - height * 0.7 + random() * height * 0.5;
    const kind = Math.floor(random() * 4);
    if (kind === 0) {
      fillRect(px, py, 4, 3, PANEL_EDGE);
      fillRect(px + 1, py + 1, 2, 1, 'rgba(70,211,201,.5)');
    }
    if (kind === 1) {
      fillRect(px, py, 7, 1, COLOR.steel);
    }
    if (kind === 2) {
      fillRect(px, py, 3, 3, COLOR.sceneBg);
      fillRect(px + 1, py + 1, 1, 1, COLOR.steel);
    }
    if (kind === 3) {
      fillRect(px, py, 2, 4, '#4a2f2a');
      fillRect(px, py, 2, 1, '#8a5f55');
    }
  }
  // occasional glint
  if (((now / 1000 + index * 0.7) % 3.2) < 0.15) {
    fillRect(pile.x - 4 + (pileState.seed % 9), pile.y - height + 2, 1, 1, '#ffffff');
  }
}

function drawJunkyard(now) {
  const seconds = now / 1000;
  fillRect(0, 0, SCENE_W, SCENE_H, '#0a0c17');
  for (let i = 0; i < 20; i++) {
    fillRect((i * 37) % SCENE_W, (i * 13) % 30, 1, 1, i % 3 ? '#3a3f62' : COLOR.dim);
  }
  // ceiling girders
  fillRect(0, 0, SCENE_W, 6, COLOR.sceneBg);
  for (let x = 0; x < SCENE_W; x += 16) {
    fillRect(x, 6, 2, 10, COLOR.sceneBg);
    fillRect(x + 2, 14, 12, 1, COLOR.sceneBg);
  }
  // distant junk hills
  for (let x = 0; x < SCENE_W; x += 4) {
    const h = 10 + Math.round(Math.sin(x * 0.13) * 6 + Math.sin(x * 0.37) * 4);
    fillRect(x, 52 - h, 4, h + 12, '#121527');
  }
  // street lamp
  const brightness = Math.random() < LAMP_FLICKER_CHANCE ? 0.3 : 1;
  fillRect(12, 20, 2, 44, COLOR.line);
  fillRect(10, 19, 8, 2, COLOR.line);
  fillRect(15, 21, 2, 1, brightness < 1 ? '#7a5320' : COLOR.amber);
  fillPolygon(`rgba(240,163,62,${0.07 * brightness})`, [[14, 22], [18, 22], [50, 70], [0, 70]]);
  // ground and guard post
  fillRect(0, 60, SCENE_W, 40, '#15182a');
  fillRect(0, 60, SCENE_W, 1, '#1f2440');
  fillRect(146, 40, 10, 20, '#1c2035');
  fillRect(147, 42, 8, 3, COLOR.ink);
  fillRect(148, 43, 2, 1, (seconds | 0) % 2 ? COLOR.red : '#4a1f26');
  JUNK_PILES.forEach((_, index) => drawPile(index, now));
}

/** Index of the junk pile under a click, or -1. */
export function pileAt(clientX, clientY) {
  const rect = sceneCanvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width * SCENE_W;
  const y = (clientY - rect.top) / rect.height * SCENE_H;
  return JUNK_PILES.findIndex(pile => Math.abs(x - pile.x) < pile.w / 2 && y > pile.y - pile.h - 6 && y < pile.y + 3);
}

export function onSceneClick(handler) {
  sceneCanvas.addEventListener('click', handler);
}

/* ---------- animation loop ---------- */
let lastFrameTime = performance.now();
let onActorSettled = () => {};

/** Moves the actor; returns true when it reached the counter or left. */
function stepActor(dt) {
  if (actor.phase === 'in') {
    actor.x -= WALK_SPEED * dt;
    if (actor.x <= COUNTER_X) {
      actor.x = COUNTER_X;
      actor.phase = 'idle';
      return true;
    }
  } else if (actor.phase === 'out') {
    actor.x += WALK_SPEED * dt;
    if (actor.x >= DOOR_X + EXIT_MARGIN) {
      actor.phase = 'empty';
      return true;
    }
  }
  return false;
}

function stepDoor(dt) {
  const target = (actor.phase === 'in' || actor.phase === 'out') && actor.x > DOOR_OPENS_AT_X ? 1 : 0;
  actor.doorOpen += (target - actor.doorOpen) * Math.min(1, dt * DOOR_SPEED);
}

function frame(now) {
  const dt = Math.min(MAX_FRAME_DT, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if (stepActor(dt)) {
    onActorSettled();
  }
  stepDoor(dt);
  if (state.where === 'junk' && state.junk) {
    drawJunkyard(now);
  } else {
    drawShop(now);
  }
  requestAnimationFrame(frame);
}

/** Starts the loop; `settled` is called when a customer arrives or leaves. */
export function startScene(settled) {
  onActorSettled = settled;
  requestAnimationFrame(frame);
}
