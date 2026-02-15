// Bullet Time — slow-mo triggered by player (Q) or auto-triggered on enemy aggro
// Resource bar drains while active, enemy kills refill it.
// Player moves at normal speed; everything else slows down.

import { emit, on } from './events';

export const BULLET_TIME = {
  timeScale: 0.25,          // how slow the world runs (0.25 = 25% speed)
  maxResource: 3000,         // ms of bullet time available at full bar
  drainRate: 1000,           // resource drained per real second while active
  killRefill: 600,           // resource refilled per enemy kill
  activationMinimum: 300,    // minimum resource required to activate
  infinite: 1,               // 1 = infinite resource (skip drain), 0 = normal drain
};

let resource = BULLET_TIME.maxResource;
let active = false;
let initialized = false;

export function initBulletTime() {
  if (initialized) return;
  initialized = true;

  // Kill refill — subscribe to enemyDied event
  on('enemyDied', () => {
    refillBulletTime(BULLET_TIME.killRefill);
  });

  // Auto-activate bullet time when an enemy aggros — gives the player a
  // slow-mo reaction window to fight, flee, or use abilities.
  on('enemyAggroed', () => {
    activateBulletTime();
  });
}

/** Activate bullet time (no-op if already active). Used by aggro auto-trigger. */
export function activateBulletTime() {
  if (active) return;
  if (resource >= BULLET_TIME.activationMinimum) {
    active = true;
    emit({ type: 'bulletTimeActivated' });
  }
}

export function toggleBulletTime() {
  if (active) {
    // Deactivate
    active = false;
    emit({ type: 'bulletTimeDeactivated' });
  } else {
    activateBulletTime();
  }
}

export function updateBulletTime(realDt: number) {
  if (!active) return;

  // Skip drain when infinite mode is on
  if (BULLET_TIME.infinite >= 1) return;

  // Drain resource
  resource -= BULLET_TIME.drainRate * realDt;

  if (resource <= 0) {
    resource = 0;
    active = false;
    emit({ type: 'bulletTimeDeactivated' });
  }
}

export function getBulletTimeScale(): number {
  return active ? BULLET_TIME.timeScale : 1;
}

export function refillBulletTime(amount: number) {
  resource = Math.min(resource + amount, BULLET_TIME.maxResource);
}

export function resetBulletTime() {
  resource = BULLET_TIME.maxResource;
  active = false;
}

export function isBulletTimeActive(): boolean {
  return active;
}

export function getBulletTimeResource(): number {
  return resource;
}

export function getBulletTimeMax(): number {
  return BULLET_TIME.maxResource;
}
