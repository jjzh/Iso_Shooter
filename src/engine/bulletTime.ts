// Bullet Time — player-triggered slow-mo
// Press Q to toggle. Resource bar drains while active, enemy kills refill it.
// Player moves at normal speed; everything else slows down.

import { emit, on } from './events';

export const BULLET_TIME = {
  timeScale: 0.25,          // how slow the world runs (0.25 = 25% speed)
  maxResource: 3000,         // ms of bullet time available at full bar
  drainRate: 1000,           // resource drained per real second while active
  killRefill: 600,           // resource refilled per enemy kill
  activationMinimum: 300,    // minimum resource required to activate
  infinite: 1,               // 1 = infinite resource (skip drain), 0 = normal drain
  exitRampDuration: 250,     // ms to ramp from BT scale → 1.0 on deactivation
};

let resource = BULLET_TIME.maxResource;
let active = false;
let initialized = false;
let _autoEngaged = false;  // true when BT was auto-activated by a verb or detection
let _detectingCount = 0;   // number of enemies currently detecting the player

// Exit ramp state — smooth transition from BT scale → 1.0
let _rampActive = false;
let _rampTimer = 0;        // ms elapsed since ramp started
let _rampFromScale = 0.25; // scale at the moment ramp began

export function initBulletTime() {
  if (initialized) return;
  initialized = true;

  // Kill refill — subscribe to enemyDied event
  on('enemyDied', () => {
    refillBulletTime(BULLET_TIME.killRefill);
  });

  // Auto-activate bullet time when player enters a vision cone (detection starts)
  // Gives the player a slow-mo reaction window to escape before aggro.
  on('detectionStarted', () => {
    _detectingCount++;
    activateBulletTimeAuto();
  });

  // Deactivate when all cones are clear (player escaped all detection)
  on('detectionCleared', () => {
    _detectingCount = Math.max(0, _detectingCount - 1);
    if (_detectingCount === 0) {
      deactivateBulletTimeAuto();
    }
  });

}

/** Activate bullet time (no-op if already active). */
export function activateBulletTime() {
  if (active) return;
  if (resource >= BULLET_TIME.activationMinimum) {
    active = true;
    _rampActive = false; // cancel any exit ramp
    emit({ type: 'bulletTimeActivated' });
  }
}

export function toggleBulletTime() {
  if (active) {
    startExitRamp();
  } else {
    activateBulletTime();
  }
}

/** Begin the exit ramp instead of snapping to 1.0. */
function startExitRamp() {
  _rampFromScale = active ? BULLET_TIME.timeScale : getBulletTimeScale();
  active = false;
  _autoEngaged = false;
  _rampActive = true;
  _rampTimer = 0;
  emit({ type: 'bulletTimeDeactivated' });
}

export function updateBulletTime(realDt: number) {
  // Advance exit ramp (uses real time so duration is consistent)
  if (_rampActive) {
    _rampTimer += realDt * 1000;
    if (_rampTimer >= BULLET_TIME.exitRampDuration) {
      _rampActive = false;
    }
  }

  if (!active) return;

  // Skip drain when infinite mode is on
  if (BULLET_TIME.infinite >= 1) return;

  // Drain resource
  resource -= BULLET_TIME.drainRate * realDt;

  if (resource <= 0) {
    resource = 0;
    startExitRamp();
  }
}

export function getBulletTimeScale(): number {
  if (active) return BULLET_TIME.timeScale;
  if (_rampActive) {
    const t = Math.min(_rampTimer / BULLET_TIME.exitRampDuration, 1);
    // Ease-in quadratic: world "winds up" gradually then snaps to full speed
    const eased = t * t;
    return _rampFromScale + (1 - _rampFromScale) * eased;
  }
  return 1;
}

export function refillBulletTime(amount: number) {
  resource = Math.min(resource + amount, BULLET_TIME.maxResource);
}

export function resetBulletTime() {
  resource = BULLET_TIME.maxResource;
  active = false;
  _rampActive = false;
  _autoEngaged = false;
  _detectingCount = 0;
}

export function isBulletTimeActive(): boolean {
  return active || _rampActive;
}

export function getBulletTimeResource(): number {
  return resource;
}

export function getBulletTimeMax(): number {
  return BULLET_TIME.maxResource;
}

/** Auto-engage BT for a verb (e.g. dunk hold). Only activates if not already active. */
export function activateBulletTimeAuto() {
  if (active) return; // already active (manual or prior auto)
  _autoEngaged = true;
  activateBulletTime();
}

/** Disengage auto-BT. No-op if player manually activated BT (preserves their choice). */
export function deactivateBulletTimeAuto() {
  if (!_autoEngaged) return;
  startExitRamp();
}
