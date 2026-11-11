// =====================================================================
//  util.js — tiny helpers shared by all modules (no game knowledge).
// =====================================================================

// ---------- random & math ----------
export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function randomSeed() {
  return Math.floor(Math.random() * 1e9) + 1;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function roundTo10(value) {
  return Math.round(value / 10) * 10;
}

// ---------- DOM ----------
export function byId(id) {
  return document.getElementById(id);
}
