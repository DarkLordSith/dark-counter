// =====================================================================
//  audio.ts — generative "space lofi" via Web Audio: kick, snare, hats,
//  a 4-chord pad loop, bass and random pentatonic plinks over vinyl crackle;
//  plus the junkyard sound effects (v2), switched on and off apart from the music.
// =====================================================================
import { gameRng, pickRandom } from './rng';

/* ---------- config ---------- */
const TEMPO_BPM = 72;
const STEPS_PER_BEAT = 4;
const STEPS_PER_BAR = 16;
const SCHEDULE_AHEAD_S = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const START_DELAY_S = 0.1;
const MASTER_VOLUME = 0.55;
const LOWPASS_HZ = 1600;
const NOISE_SECONDS = 2;

const CHORD_PROGRESSION = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // MIDI notes
const MELODY_NOTES = [72, 74, 76, 79, 81, 84];

const SFX_VOLUME = 0.32; // below the music, no sharp peaks
const SFX_LOWPASS_HZ = 3200;

/* ---------- state ---------- */
/** on — the music plays; sfx — sound effects are wanted (the menu item "Звуки"). */
export const audio = { on: false, sfx: true };

/* ---------- the player's choice (V1.4 fix) ----------
   Music is on by default and starts on the first touch (browsers do not let
   sound start without one). Turning it off in the menu is remembered in
   localStorage under its own key, not in the save. */

/** localStorage key; separate from the save (dark-counter-v3). */
export const MUSIC_KEY = 'dark-counter-music';

/** The part of Storage this needs (localStorage in the game, a fake in tests). */
export interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const browserStorage = (): PrefStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** True unless the player turned the music off earlier. */
export function musicWanted(storage: PrefStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(MUSIC_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Remembers the choice: "off" is stored, "on" (the default) removes the key. */
export function rememberMusic(on: boolean, storage: PrefStorage | null = browserStorage()): void {
  try {
    if (on) {
      storage?.removeItem(MUSIC_KEY);
    } else {
      storage?.setItem(MUSIC_KEY, 'off');
    }
  } catch {
    // private mode / storage full: the choice simply is not remembered
  }
}

/* ---------- sound effects: their own choice (junkyard v2) ---------- */

/** localStorage key of "Звуки: выкл"; separate from the music and the save. */
export const SFX_KEY = 'dark-counter-sfx';

/** True unless the player turned the sound effects off earlier. */
export function sfxWanted(storage: PrefStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(SFX_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Remembers the sound effects choice: "off" is stored, "on" (the default) removes the key. */
export function rememberSfx(on: boolean, storage: PrefStorage | null = browserStorage()): void {
  try {
    if (on) {
      storage?.removeItem(SFX_KEY);
    } else {
      storage?.setItem(SFX_KEY, 'off');
    }
  } catch {
    // private mode / storage full: the choice simply is not remembered
  }
}

audio.sfx = sfxWanted();

/** Created on the first "music on" click (browsers require a user gesture). */
interface Engine {
  ac: AudioContext;
  /** Music bus (lowpass, MASTER_VOLUME); muted while only the effects play. */
  master: GainNode;
  /** Sound effects bus, created on the first effect. */
  sfx: GainNode | null;
  noise: AudioBuffer;
  /** Sequencer step counter (16 steps per bar). */
  step: number;
  /** Audio-clock time of the next step to schedule. */
  next: number;
  secondsPerStep: number;
}

let engine: Engine | null = null;

declare global {
  interface Window {
    /** Old Safari. */
    webkitAudioContext?: typeof AudioContext;
  }
}

const midiToFrequency = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/* ---------- setup ---------- */

function createWhiteNoise(ac: AudioContext, length: number): AudioBuffer {
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function startVinylCrackle(ac: AudioContext, length: number, destination: AudioNode): void {
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.6 : 0) + (Math.random() * 2 - 1) * 0.012;
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ac.createGain();
  gain.gain.value = 0.5;
  source.connect(gain);
  gain.connect(destination);
  source.start();
}

function initAudio(): Engine {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio is not supported');
  }
  const ac = new AudioContextClass();
  const lowpass = ac.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = LOWPASS_HZ;
  const master = ac.createGain();
  master.gain.value = MASTER_VOLUME;
  master.connect(lowpass);
  lowpass.connect(ac.destination);
  const length = ac.sampleRate * NOISE_SECONDS;
  const noise = createWhiteNoise(ac, length);
  startVinylCrackle(ac, length, master);
  const created: Engine = {
    ac,
    master,
    sfx: null,
    noise,
    step: 0,
    next: ac.currentTime + START_DELAY_S,
    secondsPerStep: 60 / TEMPO_BPM / STEPS_PER_BEAT,
  };
  setInterval(() => scheduleAhead(created), SCHEDULER_INTERVAL_MS);
  return created;
}

/* ---------- instruments ---------- */

function envelope(gainNode: GainNode, time: number, attack: number, peak: number, release: number): void {
  gainNode.gain.setValueAtTime(0, time);
  gainNode.gain.linearRampToValueAtTime(peak, time + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + attack + release);
}

function noiseHit(
  eng: Engine, time: number, filterType: BiquadFilterType, frequency: number, peak: number, duration: number, destination: AudioNode = eng.master,
): void {
  const ac = eng.ac;
  const source = ac.createBufferSource();
  source.buffer = eng.noise;
  const filter = ac.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  const gain = ac.createGain();
  envelope(gain, time, 0.002, peak, duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(time, Math.random());
  source.stop(time + duration + 0.05);
}

function tone(
  eng: Engine, time: number, frequency: number, waveType: OscillatorType, peak: number, attack: number, release: number, destination: AudioNode = eng.master,
): void {
  const ac = eng.ac;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = waveType;
  oscillator.frequency.value = frequency;
  envelope(gain, time, attack, peak, release);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(time);
  oscillator.stop(time + attack + release + 0.05);
}

function kick(eng: Engine, time: number): void {
  const ac = eng.ac;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.frequency.setValueAtTime(110, time);
  oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.15);
  envelope(gain, time, 0.003, 0.7, 0.22);
  oscillator.connect(gain);
  gain.connect(eng.master);
  oscillator.start(time);
  oscillator.stop(time + 0.3);
}

function padAndBass(eng: Engine, time: number, chord: number[]): void {
  const stepLength = eng.secondsPerStep;
  chord.forEach(note => {
    tone(eng, time, midiToFrequency(note), 'triangle', 0.05, 0.6, stepLength * 15);
    tone(eng, time, midiToFrequency(note) * 1.004, 'sine', 0.04, 0.8, stepLength * 15); // slight detune
  });
  const bass = midiToFrequency(chord[0] - 24);
  tone(eng, time, bass, 'sine', 0.22, 0.02, stepLength * 7);
  tone(eng, time + stepLength * 8, bass, 'sine', 0.18, 0.02, stepLength * 6);
}

/* ---------- sequencer ---------- */

function playStep(eng: Engine, time: number, step: number, chord: number[]): void {
  if (step === 0 || step === 10 && Math.random() < 0.5 || step === 8 && Math.random() < 0.3) {
    kick(eng, time);
  }
  if (step === 4 || step === 12) {
    noiseHit(eng, time, 'bandpass', 1700, 0.18, 0.16); // snare
  }
  if (step % 2 === 0) {
    const offbeat = step % 4 === 2;
    noiseHit(eng, time + (offbeat ? eng.secondsPerStep * 0.18 : 0), 'highpass', 7000, offbeat ? 0.05 : 0.03, 0.04); // swung hats
  }
  if (step === 0) {
    padAndBass(eng, time, chord);
  }
  if ((step === 6 || step === 14) && Math.random() < 0.35) {
    tone(eng, time, midiToFrequency(pickRandom(gameRng, MELODY_NOTES)), 'sine', 0.045, 0.01, 0.9);
  }
}

function scheduleAhead(eng: Engine): void {
  if (!audio.on) {
    return;
  }
  while (eng.next < eng.ac.currentTime + SCHEDULE_AHEAD_S) {
    const step = eng.step % STEPS_PER_BAR;
    const bar = Math.floor(eng.step / STEPS_PER_BAR) % CHORD_PROGRESSION.length;
    playStep(eng, eng.next, step, CHORD_PROGRESSION[bar]);
    eng.next += eng.secondsPerStep;
    eng.step++;
  }
}

/** The context runs while the music or the effects are wanted; muting the music keeps the effects going. */
function syncContext(eng: Engine): void {
  eng.master.gain.value = audio.on ? MASTER_VOLUME : 0;
  if (audio.on || audio.sfx) {
    void eng.ac.resume();
  } else {
    void eng.ac.suspend();
  }
}

function ensureEngine(): Engine {
  if (!engine) {
    engine = initAudio();
  }
  return engine;
}

function setMusic(on: boolean): void {
  try {
    const eng = ensureEngine();
    audio.on = on;
    if (audio.on) {
      eng.next = eng.ac.currentTime + START_DELAY_S;
    }
    syncContext(eng);
  } catch {
    audio.on = false;
  }
}

/** The menu item: turns the music on or off and remembers the choice. */
export function toggleMusic(): void {
  setMusic(!audio.on);
  rememberMusic(audio.on);
}

/** The menu item "Звуки": turns the effects on or off and remembers the choice. */
export function toggleSfx(): void {
  audio.sfx = !audio.sfx;
  rememberSfx(audio.sfx);
  if (engine) {
    syncContext(engine);
  }
}

/**
 * Called on a touch / key press until the sound runs: starts the music if the
 * player has not turned it off, and wakes the context for the effects. Returns
 * true when nothing is left to do (running, or nothing wanted), so the caller can stop listening.
 */
export function startSoundOnGesture(): boolean {
  if (!musicWanted() && !audio.sfx) {
    return true;
  }
  try {
    if (musicWanted() && !audio.on) {
      setMusic(true);
    } else {
      syncContext(ensureEngine());
    }
  } catch {
    return true;
  }
  return engine !== null && engine.ac.state === 'running';
}

/* ---------- junkyard sound effects (generated, no files) ---------- */

/** Effects: the junkyard (a dig, its find by rarity, the noise tick, the drone, going home) and the counter bell (V2.1). */
export type SfxName = 'dig' | 'empty' | 'parts' | 'broken' | 'rare' | 'tick' | 'hum' | 'drone' | 'home' | 'bell';

function sfxBus(eng: Engine): GainNode {
  if (!eng.sfx) {
    const lowpass = eng.ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = SFX_LOWPASS_HZ;
    const gain = eng.ac.createGain();
    gain.gain.value = SFX_VOLUME;
    gain.connect(lowpass);
    lowpass.connect(eng.ac.destination);
    eng.sfx = gain;
  }
  return eng.sfx;
}

/** Each effect as notes on the effects bus, starting at `time`. */
const SFX: Record<SfxName, (eng: Engine, time: number, bus: AudioNode) => void> = {
  // a dull thud and a shovel scrape: low-passed noise over a falling low sine
  dig: (eng, time, bus) => {
    noiseHit(eng, time, 'lowpass', 500, 0.5, 0.2, bus);
    tone(eng, time, 72, 'sine', 0.35, 0.005, 0.14, bus);
  },
  // nothing: a quiet rustle, no "reward"
  empty: (eng, time, bus) => noiseHit(eng, time + 0.12, 'bandpass', 2400, 0.1, 0.28, bus),
  // spare parts: two small clicks
  parts: (eng, time, bus) => {
    tone(eng, time + 0.14, 1900, 'square', 0.05, 0.001, 0.03, bus);
    tone(eng, time + 0.22, 2300, 'square', 0.04, 0.001, 0.03, bus);
  },
  // a broken thing: a metallic clang (inharmonic partials)
  broken: (eng, time, bus) => {
    [1, 2.76, 5.4].forEach((ratio, i) => tone(eng, time + 0.12, 440 * ratio, 'triangle', 0.12 / (i + 1), 0.002, 0.7 - i * 0.15, bus));
  },
  // a rare find: a short rising arpeggio
  rare: (eng, time, bus) => {
    [72, 76, 79, 84].forEach((note, i) => tone(eng, time + 0.14 + i * 0.08, midiToFrequency(note), 'sine', 0.14, 0.005, 0.35, bus));
  },
  // "громко": a faint tick, more often as the noise grows (see setJunkAmbience)
  tick: (eng, time, bus) => tone(eng, time, 2600, 'square', 0.025, 0.001, 0.02, bus),
  // "дрон рядом": a low hum under the ticks
  hum: (eng, time, bus) => tone(eng, time, 58, 'sawtooth', 0.05, 0.12, 0.35, bus),
  // the drone comes: a rising whine, then a two-tone alarm
  drone: (eng, time, bus) => {
    const ac = eng.ac;
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(220, time);
    oscillator.frequency.exponentialRampToValueAtTime(1100, time + 0.8);
    envelope(gain, time, 0.6, 0.06, 0.3);
    oscillator.connect(gain);
    gain.connect(bus);
    oscillator.start(time);
    oscillator.stop(time + 1);
    [880, 660, 880, 660].forEach((frequency, i) => tone(eng, time + 0.9 + i * 0.16, frequency, 'square', 0.05, 0.005, 0.12, bus));
  },
  // going home: a short calm falling triad
  home: (eng, time, bus) => {
    [67, 64, 60].forEach((note, i) => tone(eng, time + i * 0.14, midiToFrequency(note), 'sine', 0.1, 0.01, 0.5, bus));
  },
  // the counter bell, "дзынь": a bright strike with bell-like (inharmonic) partials, a short ring
  bell: (eng, time, bus) => {
    [1, 2.4, 4.1].forEach((ratio, i) => tone(eng, time, 1760 * ratio, 'sine', 0.12 / (i + 1), 0.002, 0.45 - i * 0.12, bus));
  },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

/** Plays an effect; false when the effects are off or the sound has not started (no touch yet). */
export function playSfx(name: SfxName): boolean {
  if (!audio.sfx || !engine || engine.ac.state !== 'running') {
    return false;
  }
  try {
    SFX[name](engine, engine.ac.currentTime + 0.01, sfxBus(engine));
    return true;
  } catch {
    return false;
  }
}

/* ---------- junkyard ambience: ticks at "громко", ticks + hum at "дрон рядом" ---------- */

const AMBIENCE_TICK_MS = [0, 0, 900, 420];
const ambience = { level: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 };

/** Junkyard noise level (0…3) for the background ticking; 0 (or leaving) stops it. */
export function setJunkAmbience(level: number): void {
  ambience.level = level;
  if (level >= 2 && !ambience.timer) {
    scheduleTick();
  }
}

function scheduleTick(): void {
  const every = AMBIENCE_TICK_MS[ambience.level] ?? 0;
  if (!every) {
    ambience.timer = 0;
    return;
  }
  ambience.timer = setTimeout(() => {
    playSfx('tick');
    if (ambience.level === 3) {
      playSfx('hum');
    }
    scheduleTick();
  }, every);
}
