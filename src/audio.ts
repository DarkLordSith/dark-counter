// =====================================================================
//  audio.ts — generative "space lofi" via Web Audio: kick, snare, hats,
//  a 4-chord pad loop, bass and random pentatonic plinks over vinyl crackle.
// =====================================================================
import { pickRandom } from './util';

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

/* ---------- state ---------- */
export const audio = { on: false };

/** Created on the first "music on" click (browsers require a user gesture). */
interface Engine {
  ac: AudioContext;
  master: GainNode;
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

function noiseHit(eng: Engine, time: number, filterType: BiquadFilterType, frequency: number, peak: number, duration: number): void {
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
  gain.connect(eng.master);
  source.start(time, Math.random());
  source.stop(time + duration + 0.05);
}

function tone(eng: Engine, time: number, frequency: number, waveType: OscillatorType, peak: number, attack: number, release: number): void {
  const ac = eng.ac;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = waveType;
  oscillator.frequency.value = frequency;
  envelope(gain, time, attack, peak, release);
  oscillator.connect(gain);
  gain.connect(eng.master);
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
    tone(eng, time, midiToFrequency(pickRandom(MELODY_NOTES)), 'sine', 0.045, 0.01, 0.9);
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

export function toggleMusic(): void {
  try {
    if (!engine) {
      engine = initAudio();
    }
    audio.on = !audio.on;
    if (audio.on) {
      void engine.ac.resume();
      engine.next = engine.ac.currentTime + START_DELAY_S;
    } else {
      void engine.ac.suspend();
    }
  } catch {
    audio.on = false;
  }
}
