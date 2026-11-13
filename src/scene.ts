// =====================================================================
//  scene.ts — the 160×100 pixel scene: shop, junkyard, customers,
//  item icons and the animation loop. Everything is drawn with plain
//  rectangles; sprites are lists of [x, y, w, h, color] relative to an
//  anchor point.
// =====================================================================
import { appearanceFor, seededRandom } from './appearance';
import { CUSTOMERS_PER_DAY, JUNK_PILES } from './data';
import { CHARACTER, COLOR, GLOW, ITEM_COLORS, JUNKYARD, SHADE, SHOP } from './palette';
import { byId } from './dom';
import { actor, COUNTER_X, DOOR_X, state } from './state';
import type { Appearance, CustomerLook, ItemType, LandlordLook } from './types';

/** A filled rectangle relative to a sprite's anchor: [x, y, width, height, color]. */
type Rect = [number, number, number, number, string];

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

/* ---------- drawing primitives ---------- */
const sceneCanvas = byId<HTMLCanvasElement>('scn');
let ctx = context2d(sceneCanvas);

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D is not supported');
  }
  return context;
}

function fillRect(x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function fillRects(originX: number, originY: number, rects: Rect[]): void {
  for (const [x, y, w, h, color] of rects) {
    fillRect(originX + x, originY + y, w, h, color);
  }
}

function fillPolygon(color: string, points: [number, number][]): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  points.slice(1).forEach(point => ctx.lineTo(...point));
  ctx.closePath();
  ctx.fill();
}

function fillCircle(color: string, x: number, y: number, radius: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 7);
  ctx.fill();
}

function withClip(x: number, y: number, w: number, h: number, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  draw();
  ctx.restore();
}

/** 0/1 square wave with the given period. */
const flicker = (now: number, periodMs: number): number => (now / periodMs | 0) % 2;

/* ---------- customer sprites (anchor: horizontal center, top of scene + bob) ---------- */

function landlordSprite(look: LandlordLook, now: number, blink: boolean): Rect[] {
  return [
    // coat
    [-13, 40, 26, 31, look.jacket],
    [-15, 43, 30, 28, look.jacket],
    [5, 40, 10, 31, SHADE.shadow22],
    // shirt and tie
    [-3, 39, 6, 9, CHARACTER.landlordShirt],
    [-1, 40, 2, 10, CHARACTER.landlordRed],
    // lapels
    [-7, 40, 4, 12, CHARACTER.landlordLapel],
    [3, 40, 4, 12, CHARACTER.landlordLapel],
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
    [-4, 28, 2, 1, blink ? SHADE.closedEye : CHARACTER.pupil],
    [1, 27, 4, 3, COLOR.steel],
    [2, 28, 2, 1, flicker(now, 600) ? look.eye : CHARACTER.landlordRed],
    // moustache
    [-4, 31, 8, 2, CHARACTER.landlordMoustache],
    [-5, 32, 2, 1, CHARACTER.landlordMoustache],
    [3, 32, 2, 1, CHARACTER.landlordMoustache],
    // hat
    [-10, 20, 20, 2, CHARACTER.landlordHat],
    [-6, 12, 12, 8, CHARACTER.landlordHat],
    [-6, 18, 12, 1, CHARACTER.landlordRed],
  ];
}

const HAIR_STYLES: ((look: CustomerLook) => Rect[])[] = [
  look => [[-5, 21, 10, 3, look.hair], [-6, 22, 1, 5, look.hair], [5, 22, 1, 5, look.hair]],
  look => [[-1, 17, 2, 6, look.hair], [-2, 19, 4, 3, look.hair]],
  look => [[-5, 21, 10, 3, look.hair], [-6, 22, 2, 4, look.hair], [4, 22, 2, 4, look.hair]],
  look => [[-7, 20, 14, 3, look.jdark], [-7, 23, 2, 13, look.jdark], [5, 23, 2, 13, look.jdark]], // hood
  look => [[-5, 21, 10, 3, look.hair], [-2, 18, 4, 3, look.hair]],
  look => [[-6, 20, 12, 4, look.trim], [-6, 23, 9, 1, COLOR.ink]], // cap
];

const ACCESSORIES: ((look: CustomerLook) => Rect[])[] = [
  () => [],
  look => [[-5, 27, 10, 2, look.eye], [-5, 27, 10, 1, SHADE.shine35]], // visor
  () => [[-5, 30, 10, 5, COLOR.line], [-4, 32, 8, 1, COLOR.sceneBg]], // mask
  look => [[0, 26, 4, 4, COLOR.line], [1, 28, 2, 1, look.eye]], // eyepiece
  () => [],
];

function humanoidSprite(look: CustomerLook, blink: boolean): Rect[] {
  const android = look.kind === 'android';
  const human = look.kind === 'human';
  const skin = android ? look.metal : look.skin;
  const collar = android ? look.metal2 : look.shirt;
  const rects: Rect[] = [];
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
    [4, 41, 8, 30, SHADE.shadow16],
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
    const eye = blink ? SHADE.closedEyeAndroid : look.eye;
    rects.push(
      [-5, 30, 10, 1, SHADE.shadow30],
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
    rects.push([-3, 28, 2, 1, CHARACTER.eyeWhite], [-2, 28, 1, 1, CHARACTER.pupil], [1, 28, 2, 1, CHARACTER.eyeWhite], [1, 28, 1, 1, CHARACTER.pupil]);
  }
  rects.push(
    [-3, 26, 2, 1, look.hair], // brows
    [1, 26, 2, 1, look.hair],
    [0, 29, 1, 2, SHADE.shadow18], // nose
    [-1, 32, 3, 1, CHARACTER.mouth], // mouth
  );
  rects.push(...HAIR_STYLES[look.style](look));
  rects.push(...ACCESSORIES[look.acc](look));
  return rects;
}

function boxBotSprite(look: CustomerLook, now: number, blink: boolean): Rect[] {
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
    [-4, 46, 2, 2, flicker(now, 500) ? COLOR.cyan : CHARACTER.botLedOff],
    [0, 46, 2, 2, COLOR.amber],
    [-4, 50, 8, 1, COLOR.green],
    [-9, 56, 1, 1, look.metal2],
    [8, 56, 1, 1, look.metal2],
    // neck
    [-3, 34, 2, 5, look.metal2],
    [1, 34, 2, 5, look.metal2],
    // head and screen face
    [-7, 21, 14, 13, look.metal],
    [-7, 21, 14, 1, SHADE.shine25],
    [3, 22, 4, 12, SHADE.shadow15],
    [-5, 24, 10, 6, SHOP.screenDark],
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

function domeBotSprite(look: CustomerLook, now: number): Rect[] {
  const rects: Rect[] = [
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
    [-4, 21, 3, 1, SHADE.shine40],
    [3, 23, 4, 14, SHADE.shadow15],
    // scanning eye
    [-6, 27, 12, 4, COLOR.ink],
    [-1 + eyeShift, 28, 3, 2, look.eye],
    [-5, 33, 10, 1, look.metal2],
  );
  return rects;
}

function drawCustomer(centerX: number, bob: number, look: Appearance, now: number): void {
  const blink = (now % 4200) < 140;
  let rects: Rect[];
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
function drawHands(centerX: number, look: Appearance): void {
  const rects: Rect[] = [];
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
    const sleeve = look.kind === 'android' ? look.jacket : metal;
    handXs.forEach(x => rects.push(
      [x + 1, 63, 5, 4, sleeve],
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
const GLYPHS: Record<string, string[]> = {
  'Л': ['011', '101', '101', '101', '101'],
  'А': ['010', '101', '111', '101', '101'],
  'В': ['110', '101', '110', '101', '110'],
  'К': ['101', '110', '100', '110', '101'],
  '7': ['111', '001', '010', '010', '010'],
  'Б': ['111', '100', '110', '101', '110'],
  ' ': ['000', '000', '000', '000', '000'],
};
const GLYPH_ADVANCE = 4;

function drawPixelText(text: string, x: number, y: number, color: string): void {
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

/** Item icons by type; a type without an entry is drawn without an icon. */
const ITEM_SPRITES: Partial<Record<ItemType, (now: number) => Rect[]>> = {
  comm: () => [
    [-3, -10, 6, 10, ITEM_COLORS.commBody],
    [-2, -9, 4, 6, COLOR.cyan],
    [-2, -9, 4, 1, ITEM_COLORS.glassShine],
    [-1, -2, 2, 1, ITEM_COLORS.light],
    [2, -12, 1, 2, ITEM_COLORS.light],
  ],
  battery: now => [
    [-6, -6, 12, 6, ITEM_COLORS.batteryBody],
    [6, -4, 1, 2, ITEM_COLORS.batteryTerminal],
    [-5, -5, Math.max(1, Math.floor((now / 400) % 5) + 1) * 2, 4, COLOR.green], // charge level
    [-6, -6, 12, 1, SHADE.shine20],
  ],
  servo: () => [
    [-5, -7, 10, 7, ITEM_COLORS.mid],
    [-2, -9, 4, 2, ITEM_COLORS.light],
    [-1, -5, 2, 2, COLOR.amber],
    [3, -7, 2, 7, SHADE.shadow20],
    [-7, -3, 2, 2, ITEM_COLORS.dark],
    [5, -3, 2, 2, ITEM_COLORS.dark],
  ],
  cutter: now => [
    [-9, -4, 13, 4, ITEM_COLORS.mid],
    [-8, -1, 3, 1, ITEM_COLORS.dark],
    [-7, 0, 2, 0, ITEM_COLORS.dark],
    [4, -3, 4, 2, ITEM_COLORS.dark],
    [8, -3, 1, 2, flicker(now, 200) ? COLOR.red : ITEM_COLORS.cutterLedOff],
    [-9, -4, 13, 1, SHADE.shine20],
  ],
  visor: () => [
    [-8, -3, 1, 2, ITEM_COLORS.dark],
    [7, -3, 1, 2, ITEM_COLORS.dark],
    [-7, -4, 14, 3, ITEM_COLORS.dark],
    [-6, -4, 12, 2, COLOR.cyan],
    [-6, -4, 5, 1, ITEM_COLORS.glassShine],
  ],
  drone: () => [
    [-3, -4, 6, 4, ITEM_COLORS.mid],
    [-9, -6, 6, 1, ITEM_COLORS.light],
    [3, -6, 6, 1, ITEM_COLORS.light],
    [-7, -5, 1, 3, ITEM_COLORS.dark],
    [6, -5, 1, 3, ITEM_COLORS.dark],
    [-1, -3, 2, 1, COLOR.red],
  ],
  chip: now => {
    const rects: Rect[] = [
      [-4, -6, 8, 6, ITEM_COLORS.chipBoard],
      [-2, -4, 4, 2, ITEM_COLORS.chipDie],
    ];
    for (let pin = 0; pin < 4; pin++) {
      rects.push([-4 + pin * 2 + 1, -7, 1, 1, COLOR.gold], [-4 + pin * 2 + 1, 0, 1, 0, COLOR.gold]);
    }
    rects.push([2, -2, 1, 1, flicker(now, 300) ? COLOR.green : ITEM_COLORS.chipBoard]);
    return rects;
  },
  arm: () => [
    [-11, -4, 8, 4, ITEM_COLORS.light],
    [-3, -4, 6, 3, ITEM_COLORS.mid],
    [-3, -3, 1, 1, COLOR.cyan],
    [3, -5, 3, 5, ITEM_COLORS.light],
    [6, -5, 2, 1, ITEM_COLORS.light],
    [6, -2, 2, 1, ITEM_COLORS.light],
    [-11, -1, 8, 1, SHADE.shadow25],
  ],
};

function drawItem(type: string, centerX: number, bottomY: number, now: number, infected: boolean): void {
  const sprite = ITEM_SPRITES[type as ItemType];
  if (sprite) {
    fillRects(centerX, bottomY, sprite(now));
  }
  if (infected && flicker(now, 250)) {
    fillRect(centerX - 1, bottomY - 12, 2, 2, COLOR.red);
  }
}

/** Draws every <canvas data-ico> icon currently in the DOM. */
export function paintIcons(): void {
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-ico]').forEach(canvas => {
    const sceneCtx = ctx;
    ctx = context2d(canvas);
    ctx.clearRect(0, 0, ICON_W, ICON_H);
    drawItem(canvas.dataset.ico ?? '', ICON_W / 2, ICON_H - 2, 0, canvas.dataset.inf === '1');
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

function drawBackWall(): void {
  fillRect(0, 0, SCENE_W, SCENE_H, COLOR.sceneBg);
  for (let x = 0; x < SCENE_W; x += 20) {
    fillRect(x, 0, 1, 68, SHOP.wallSeam);
  }
  fillRect(0, 46, SCENE_W, 1, SHOP.wallSeam);
  for (let x = 10; x < SCENE_W; x += 20) {
    fillRect(x, 3, 1, 1, SHOP.wallRivet);
    fillRect(x, 43, 1, 1, SHOP.wallRivet);
  }
}

/** Porthole with drifting stars, a planet and a passing ship. */
function drawWindow(seconds: number): void {
  fillRect(5, 7, 54, 34, SHOP.wall);
  fillRect(7, 9, 50, 30, SHOP.space);
  withClip(7, 9, 50, 30, () => {
    STARS.forEach(star => {
      const x = ((star.x - seconds * star.speed) % 50 + 50) % 50;
      fillRect(7 + x, 9 + star.y, 1, 1, star.bright ? COLOR.fg : SHOP.starDim);
    });
    fillCircle(SHOP.planetShadow, 52, 44, 15);
    fillCircle(SHOP.planet, 50, 46, 13);
    fillRect(34, 34, 26, 1, GLOW.planetRing);
    const shipProgress = (seconds % 15) / 15;
    if (shipProgress < 0.6) {
      const x = shipProgress / 0.6 * 66 - 8;
      fillRect(7 + x, 17, 6, 1, COLOR.dim);
      fillRect(7 + x + 2, 16, 2, 1, COLOR.dim);
      fillRect(7 + x - 1, 17, 1, 1, COLOR.amber);
    }
  });
  fillRect(9, 11, 1, 7, SHADE.shine07);
}

function drawShelves(seconds: number): void {
  fillRect(5, 50, 54, 2, COLOR.line);
  ([[7, SHOP.shelfBoxSlate, 8, 6], [17, SHOP.shelfBoxBrown, 6, 8], [25, SHOP.shelfBoxGreen, 10, 5], [38, SHOP.shelfBoxPurple, 7, 7], [47, SHOP.shelfBoxSlate, 9, 4]] as const)
    .forEach(([x, color, w, h]) => fillRect(x, 50 - h, w, h, color));
  fillRect(27, 46, 2, 1, (seconds * 2 | 0) % 3 ? COLOR.green : SHOP.shelfLedGreenOff);
  fillRect(49, 47, 1, 1, (seconds * 1.3 | 0) % 2 ? COLOR.red : SHOP.shelfLedRedOff);
  fillRect(5, 60, 54, 2, COLOR.line);
  ([[9, COLOR.line, 12, 5], [24, SHOP.shelfBoxSlate, 6, 7], [34, COLOR.steel, 14, 4], [50, SHOP.shelfBoxPurple, 6, 6]] as const)
    .forEach(([x, color, w, h]) => fillRect(x, 60 - h, w, h, color));
}

function drawDoorway(): void {
  fillRect(118, 8, 40, 60, SHOP.wall);
  fillRect(122, 12, 32, 56, SHOP.doorway);
  fillRect(122, 12, 32, 2, GLOW.doorway);
}

/** Neon "ЛАВКА 7Б" sign and the ceiling lamp. Off at night, flickers by day. */
function drawSignAndLamp(night: boolean): void {
  const brightness = night ? 0 : (Math.random() < SIGN_FLICKER_CHANCE ? 0.3 : 1);
  fillRect(59, 3, 42, 11, COLOR.ink);
  fillRect(60, 4, 40, 9, GLOW.sign(brightness));
  drawPixelText('ЛАВКА 7Б', 65, 6, night ? SHOP.signOff : brightness < 1 ? SHOP.signDim : COLOR.cyan);
  fillRect(77, 0, 6, 2, COLOR.line);
  if (!night) {
    fillPolygon(GLOW.shopLamp, [[78, 2], [82, 2], [112, 68], [48, 68]]);
  }
}

function drawWalkingActor(look: Appearance, now: number): void {
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

function doorLightColor(): string {
  if (actor.phase === 'in' || actor.phase === 'out') {
    return COLOR.green;
  }
  return state.phase === 'shop' && state.slot < CUSTOMERS_PER_DAY && !state.over ? COLOR.amber : COLOR.red;
}

function drawSlidingDoor(): void {
  const panelWidth = 16 * (1 - actor.doorOpen);
  fillRect(122, 12, panelWidth, 56, SHOP.doorPanel);
  fillRect(154 - panelWidth, 12, panelWidth, 56, SHOP.doorPanel);
  if (panelWidth > 1) {
    fillRect(122 + panelWidth - 1, 12, 1, 56, SHOP.panelEdge);
    fillRect(154 - panelWidth, 12, 1, 56, SHOP.panelEdge);
  }
  fillRect(118, 8, 4, 60, SHOP.wall);
  fillRect(154, 8, 4, 60, SHOP.wall);
  fillRect(132, 9, 12, 2, doorLightColor());
}

function drawCounter(seconds: number): void {
  fillRect(0, 68, SCENE_W, 32, SHOP.counter);
  fillRect(0, 68, SCENE_W, 2, SHOP.panelEdge);
  fillRect(0, 68, SCENE_W, 1, SHOP.counterHighlight);
  for (let x = 4; x < SCENE_W; x += 26) {
    fillRect(x, 75, 22, 20, SHOP.counterPanel);
    fillRect(x, 75, 22, 1, SHOP.counterPanelEdge);
  }
  fillRect(0, 97, SCENE_W, 3, SHOP.counterBase);
  for (let x = 0; x < SCENE_W; x += 8) {
    fillRect(x, 97, 4, 1, GLOW.counterHazard);
  }
  // card reader
  fillRect(18, 64, 12, 4, COLOR.line);
  fillRect(19, 65, 3, 2, COLOR.cyan);
  fillRect(26, 63, 2, 1, COLOR.steel);
  // terminal with scrolling lines
  fillRect(112, 52, 24, 15, COLOR.line);
  fillRect(114, 54, 20, 11, SHOP.screenDark);
  for (let line = 0; line < 3; line++) {
    fillRect(116, 56 + line * 3, 6 + ((seconds * 3 + line * 5) | 0) % 10, 1, COLOR.cyan);
  }
  fillRect(122, 67, 4, 1, COLOR.line);
}

function drawScanLine(now: number): void {
  const progress = (now - actor.scanStart) / SCAN_DURATION_MS;
  if (progress >= 0 && progress < 1) {
    const y = 56 + progress * 12;
    fillRect(66, y, 28, 1, COLOR.cyan);
    fillRect(66, y - 1, 28, 1, GLOW.scanLine);
    fillRect(66, y + 1, 28, 1, GLOW.scanLine);
  }
}

function drawShop(now: number): void {
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
    if (customer && customer.kind !== 'rent' && customer.item) {
      drawItem(customer.item.t, COUNTER_X, 68, now, customer.item.k.flaw && customer.item.infected);
      drawScanLine(now);
    }
  }
  if (night) {
    fillRect(0, 0, SCENE_W, SCENE_H, SHOP.night);
  }
}

/* ---------- junkyard ---------- */

function drawPile(index: number, now: number): void {
  const pile = JUNK_PILES[index];
  const pileState = state.junk!.piles[index];
  const random = seededRandom(pileState.seed);
  const height = pileState.dug ? 5 : pile.h;
  const half = pile.w / 2;
  // mound silhouette
  for (let dx = -half; dx < half; dx += 2) {
    const k = dx / half;
    const columnHeight = Math.max(1, Math.round(height * (1 - k * k) + random() * 3));
    const color = pileState.dug ? JUNKYARD.pileDug : ((dx / 2) % 2 ? JUNKYARD.pileLight : JUNKYARD.pileDark);
    fillRect(pile.x + dx, pile.y - columnHeight, 2, columnHeight, color);
  }
  if (pileState.dug) {
    fillRect(pile.x - 3, pile.y - 6, 1, 1, JUNKYARD.pileSpeck);
    fillRect(pile.x + 2, pile.y - 5, 1, 1, JUNKYARD.pileSpeck);
    return;
  }
  // scattered junk
  for (let j = 0; j < 5; j++) {
    const px = pile.x - half * 0.6 + random() * pile.w * 0.6;
    const py = pile.y - height * 0.7 + random() * height * 0.5;
    const kind = Math.floor(random() * 4);
    if (kind === 0) {
      fillRect(px, py, 4, 3, SHOP.panelEdge);
      fillRect(px + 1, py + 1, 2, 1, GLOW.scrapScreen);
    }
    if (kind === 1) {
      fillRect(px, py, 7, 1, COLOR.steel);
    }
    if (kind === 2) {
      fillRect(px, py, 3, 3, COLOR.sceneBg);
      fillRect(px + 1, py + 1, 1, 1, COLOR.steel);
    }
    if (kind === 3) {
      fillRect(px, py, 2, 4, JUNKYARD.rust);
      fillRect(px, py, 2, 1, JUNKYARD.rustLight);
    }
  }
  // occasional glint
  if (((now / 1000 + index * 0.7) % 3.2) < 0.15) {
    fillRect(pile.x - 4 + (pileState.seed % 9), pile.y - height + 2, 1, 1, JUNKYARD.glint);
  }
}

function drawJunkyard(now: number): void {
  const seconds = now / 1000;
  fillRect(0, 0, SCENE_W, SCENE_H, JUNKYARD.sky);
  for (let i = 0; i < 20; i++) {
    fillRect((i * 37) % SCENE_W, (i * 13) % 30, 1, 1, i % 3 ? JUNKYARD.starDim : COLOR.dim);
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
    fillRect(x, 52 - h, 4, h + 12, JUNKYARD.hills);
  }
  // street lamp
  const brightness = Math.random() < LAMP_FLICKER_CHANCE ? 0.3 : 1;
  fillRect(12, 20, 2, 44, COLOR.line);
  fillRect(10, 19, 8, 2, COLOR.line);
  fillRect(15, 21, 2, 1, brightness < 1 ? JUNKYARD.lampDim : COLOR.amber);
  fillPolygon(GLOW.junkLamp(brightness), [[14, 22], [18, 22], [50, 70], [0, 70]]);
  // ground and guard post
  fillRect(0, 60, SCENE_W, 40, JUNKYARD.ground);
  fillRect(0, 60, SCENE_W, 1, JUNKYARD.groundEdge);
  fillRect(146, 40, 10, 20, JUNKYARD.guardPost);
  fillRect(147, 42, 8, 3, COLOR.ink);
  fillRect(148, 43, 2, 1, (seconds | 0) % 2 ? COLOR.red : JUNKYARD.guardLedOff);
  JUNK_PILES.forEach((_, index) => drawPile(index, now));
}

/** Index of the junk pile under a click, or -1. */
export function pileAt(clientX: number, clientY: number): number {
  const rect = sceneCanvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width * SCENE_W;
  const y = (clientY - rect.top) / rect.height * SCENE_H;
  return JUNK_PILES.findIndex(pile => Math.abs(x - pile.x) < pile.w / 2 && y > pile.y - pile.h - 6 && y < pile.y + 3);
}

export function onSceneClick(handler: (event: MouseEvent) => void): void {
  sceneCanvas.addEventListener('click', handler);
}

/* ---------- animation loop ---------- */
let lastFrameTime = performance.now();
let onActorSettled: () => void = () => {};

/** Moves the actor; returns true when it reached the counter or left. */
function stepActor(dt: number): boolean {
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

function stepDoor(dt: number): void {
  const target = (actor.phase === 'in' || actor.phase === 'out') && actor.x > DOOR_OPENS_AT_X ? 1 : 0;
  actor.doorOpen += (target - actor.doorOpen) * Math.min(1, dt * DOOR_SPEED);
}

function frame(now: number): void {
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
export function startScene(settled: () => void): void {
  onActorSettled = settled;
  requestAnimationFrame(frame);
}
