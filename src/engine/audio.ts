// Audio Foundation — synthesized sound effects via Web Audio API
// No audio files, no asset pipeline. Each sound is a procedurally generated
// burst of oscillators and noise. Matches the primitive art philosophy.
//
// Call initAudio() after first user gesture (click/key) to create AudioContext.
// Then subscribe to event bus for automatic sound playback.

import { on } from './events';
import type { GameEvent } from './events';

// ─── Config (tunable) ───

export const AUDIO_CONFIG = {
  masterVolume: 0.3,
  hitVolume: 0.4,
  deathVolume: 0.5,
  dashVolume: 0.25,
  shieldBreakVolume: 0.6,
  chargeVolume: 0.35,
  waveClearVolume: 0.4,
  playerHitVolume: 0.5,
  meleeSwingVolume: 0.3,
  meleeHitVolume: 0.45,
  wallSlamVolume: 0.5,
  enemyImpactVolume: 0.4,
  objectImpactVolume: 0.4,
  obstacleBreakVolume: 0.5,
  bendApplyVolume: 0.3,
  enabled: true,
};

// ─── State ───

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let initialized = false;

// ─── Init ───

export function initAudio(): void {
  if (initialized) return;

  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = AUDIO_CONFIG.masterVolume;
    masterGain.connect(ctx.destination);
    initialized = true;

    // Subscribe to game events
    wireEventBus();

    // Wire mute button
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        AUDIO_CONFIG.enabled = !AUDIO_CONFIG.enabled;
        if (masterGain) {
          masterGain.gain.value = AUDIO_CONFIG.enabled ? AUDIO_CONFIG.masterVolume : 0;
        }
        muteBtn.textContent = AUDIO_CONFIG.enabled ? '\u{1F50A}' : '\u{1F507}';
        muteBtn.classList.toggle('muted', !AUDIO_CONFIG.enabled);
      });
    }
  } catch (e) {
    console.warn('[audio] Web Audio API not available:', e);
  }
}

// Resume context on user interaction (required by browsers)
export function resumeAudio(): void {
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

export function setMasterVolume(v: number): void {
  AUDIO_CONFIG.masterVolume = v;
  if (masterGain) {
    masterGain.gain.value = v;
  }
}

// ─── Sound Generators ───

// Utility: create white noise buffer
function createNoiseBuffer(duration: number): AudioBuffer {
  if (!ctx) return new AudioBuffer({ length: 1, sampleRate: 44100 });
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// Hit: short noise burst + descending pitch sweep
export function playHit(intensity: number = 1): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const vol = AUDIO_CONFIG.hitVolume * Math.min(intensity, 2);
  const duration = 0.06 + intensity * 0.02;

  // Noise burst
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.6, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 2000 + intensity * 500;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);

  // Impact tone
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(200 + intensity * 80, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.3, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

// Death: descending tone + noise fade
export function playDeath(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.2;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.deathVolume * 0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Noise component
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.7);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.deathVolume * 0.2, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);
  noise.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Dash: whoosh — bandpass-filtered noise sweep
export function playDash(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.15;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(3000, now + duration * 0.3);
  filter.frequency.exponentialRampToValueAtTime(400, now + duration);
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.dashVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Shield break: metallic crash — resonant noise + ring
export function playShieldBreak(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.3;

  // Crash noise
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 8;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.shieldBreakVolume * 0.5, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);

  // Metallic ring
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 880;
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(AUDIO_CONFIG.shieldBreakVolume * 0.3, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);
}

// Charge fired: impact boom — low thump + noise
export function playChargeFire(chargeT: number): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.15 + chargeT * 0.1;

  // Low thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80 + chargeT * 40, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.chargeVolume * (0.5 + chargeT * 0.5), now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Noise burst
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.chargeVolume * 0.3 * chargeT, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);
  noise.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Wave clear: ascending 3-note chime
export function playWaveClear(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const notes = [523, 659, 784]; // C5, E5, G5
  const noteLen = 0.12;

  notes.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx!.createGain();
    const start = now + i * 0.08;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(AUDIO_CONFIG.waveClearVolume * 0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen);
    osc.connect(gain);
    gain.connect(masterGain!);
    osc.start(start);
    osc.stop(start + noteLen);
  });
}

// Player hit: short harsh buzz
export function playPlayerHit(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.08;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 150;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.playerHitVolume * 0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Noise
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.playerHitVolume * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Melee swing: short ascending whoosh
export function playMeleeSwing(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.12;

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1500, now);
  filter.frequency.exponentialRampToValueAtTime(5000, now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(AUDIO_CONFIG.meleeSwingVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Melee hit: punchy thump + bright noise
export function playMeleeHit(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.08;

  // Low thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(AUDIO_CONFIG.meleeHitVolume * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Bright noise snap
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 3;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(AUDIO_CONFIG.meleeHitVolume * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Wall slam: heavy impact thud with low rumble
export function playWallSlam(intensity: number = 1): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.15;
  const vol = AUDIO_CONFIG.wallSlamVolume * Math.min(intensity, 2);

  // Deep thud — lower pitch than melee hit
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Crunch noise
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2000;
  filter.Q.value = 2;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(vol * 0.4, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Enemy impact: mid-pitched collision thud — distinct from wall slam
export function playEnemyImpact(intensity: number = 1): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.1;
  const vol = AUDIO_CONFIG.enemyImpactVolume * Math.min(intensity, 2);

  // Mid-pitched thump (higher than wall slam, lower than melee hit)
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Short noise pop
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.4);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1500;
  filter.Q.value = 3;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(vol * 0.3, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.4);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Door unlock: ascending 4-note arpeggio (more dramatic than wave clear)
export function playDoorUnlock(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const notes = [392, 523, 659, 784]; // G4, C5, E5, G5
  const noteLen = 0.18;

  notes.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx!.createGain();
    const start = now + i * 0.1;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(AUDIO_CONFIG.waveClearVolume * 0.35, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + noteLen);
    osc.connect(gain);
    gain.connect(masterGain!);
    osc.start(start);
    osc.stop(start + noteLen);
  });
}

// Player healed: warm ascending tone
export function playHeal(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(330, now);
  osc.frequency.linearRampToValueAtTime(660, now + 0.4);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.5);
}

// Object impact: deep thud — lower pitch than enemy impact
export function playObjectImpact(intensity: number = 1): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.12;
  const vol = AUDIO_CONFIG.objectImpactVolume * Math.min(intensity, 2);

  // Deep thud
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Short noise crunch
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.4);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1500;
  filter.Q.value = 2;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(vol * 0.3, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.4);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Obstacle break: shattering crack — noise burst + descending tone
export function playObstacleBreak(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.25;
  const vol = AUDIO_CONFIG.obstacleBreakVolume;

  // Descending crack tone
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(vol * 0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration);

  // Noise burst — debris
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(duration * 0.6);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 4;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(vol * 0.5, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + duration);
}

// Bend apply: rising shimmer — two detuned sine oscillators, quick frequency ramp
export function playBendApply(): void {
  if (!ctx || !masterGain || !AUDIO_CONFIG.enabled) return;
  const now = ctx.currentTime;
  const duration = 0.3;
  const vol = AUDIO_CONFIG.bendApplyVolume;

  // Oscillator 1 — sine, ramp 400→800Hz
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(400, now);
  osc1.frequency.exponentialRampToValueAtTime(800, now + duration * 0.6);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(vol * 0.4, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc1.connect(gain1);
  gain1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + duration);

  // Oscillator 2 — detuned sine, slight shimmer
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(406, now); // +6Hz detuning for shimmer
  osc2.frequency.exponentialRampToValueAtTime(812, now + duration * 0.6);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(vol * 0.3, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc2.start(now);
  osc2.stop(now + duration);
}

// ─── Event Bus Integration ───

function wireEventBus(): void {
  on('enemyHit', (e: GameEvent) => {
    if (e.type === 'enemyHit') playHit(e.damage / 15); // normalize around 15 dmg
  });

  on('enemyDied', () => playDeath());

  on('playerHit', () => playPlayerHit());

  on('playerDash', () => playDash());

  on('shieldBreak', () => playShieldBreak());

  on('chargeFired', (e: GameEvent) => {
    if (e.type === 'chargeFired') playChargeFire(e.chargeT);
  });

  on('waveCleared', () => playWaveClear());

  on('roomCleared', () => playWaveClear());

  on('roomClearComplete', () => playDoorUnlock());

  on('playerHealed', () => playHeal());

  on('meleeSwing', () => playMeleeSwing());

  on('meleeHit', () => playMeleeHit());

  on('wallSlam', (e: GameEvent) => {
    if (e.type === 'wallSlam') playWallSlam(e.speed / 5); // normalize around speed 5
  });

  on('enemyImpact', (e: GameEvent) => {
    if (e.type === 'enemyImpact') playEnemyImpact(e.speed / 5);
  });

  on('objectWallSlam', (e: GameEvent) => {
    if (e.type === 'objectWallSlam') playWallSlam(Math.min(e.speed / 8, 1));
  });

  on('objectImpact', (e: GameEvent) => {
    if (e.type === 'objectImpact') playObjectImpact(Math.min(e.speed / 8, 1));
  });

  on('obstacleDestroyed', () => playObstacleBreak());

  on('objectPitFall', () => playDeath()); // reuse pit fall sound

  on('bendApplied', () => playBendApply());
}
