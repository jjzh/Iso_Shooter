// Spike Verb Module — volleyball spike, enemy becomes a projectile
// State machine: windup -> strike -> recovery
//
// Windup: hold both player and enemy in place, telegraph the strike
// Strike: instantaneous — deal damage, create carrier with angled-downward direction
// Recovery: player hangs briefly, then fast-falls
//
// The carrier system handles the enemy's flight, through-hits, and ground impact.

import { SPIKE } from '../config/player';
import { setGravityOverride } from '../engine/aerialVerbs';
import type { AerialVerb, LaunchedEnemy } from '../engine/aerialVerbs';
import { createCarrier } from '../engine/entityCarrier';
import { screenShake } from '../engine/renderer';
import { emit } from '../engine/events';
import { spawnDamageNumber } from '../ui/damageNumbers';

// --------------- Internal State ---------------

type SpikePhase = 'none' | 'windup' | 'strike' | 'recovery';

let phase: SpikePhase = 'none';
let target: any = null;
let phaseTimer = 0;              // ms since phase started

// Aim snapshot (captured on first windup frame)
let aimX = 0;
let aimZ = 0;

// Velocity override — when non-null, player.ts should use this for playerVelY
let playerVelYOverride: number | null = null;

// Fast fall flag — player.ts reads this for enhanced gravity after verb completes
let fastFallActive = false;

// --------------- AerialVerb Implementation ---------------

export const spikeVerb: AerialVerb = {
  name: 'spike',
  interruptible: false,

  canClaim(_entry: LaunchedEnemy, _playerPos: any, _inputState: any): boolean {
    // Spike is activated via float selector transfer, always allow claim
    return true;
  },

  onClaim(entry: LaunchedEnemy): void {
    phase = 'windup';
    target = entry.enemy;
    phaseTimer = 0;
    playerVelYOverride = 0;  // hold player in place
    fastFallActive = false;

    // Zero gravity on enemy during windup
    setGravityOverride(entry.enemy, 0);

    // Small screen shake telegraph
    screenShake(0.5);
  },

  update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
    const enemy = entry.enemy;

    if (phase === 'windup') {
      return updateWindup(dt, enemy, playerPos, inputState);
    } else if (phase === 'recovery') {
      return updateRecovery(dt);
    }

    return 'cancel';
  },

  onCancel(entry: LaunchedEnemy): void {
    setGravityOverride(entry.enemy, 1);
    resetState();
  },

  onComplete(entry: LaunchedEnemy): void {
    resetState();
  },
};

// --------------- Windup Phase Update ---------------

function updateWindup(dt: number, enemy: any, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
  phaseTimer += dt * 1000;

  // Hold enemy in place
  enemy.vel.y = 0;

  // Snapshot aim position on first frame
  if (phaseTimer <= dt * 1000 + 0.1) {
    aimX = inputState.aimWorldPos.x;
    aimZ = inputState.aimWorldPos.z;
  }

  // Hold player in place
  playerVelYOverride = 0;

  // Check if windup is done
  if (phaseTimer >= SPIKE.windupDuration) {
    executeStrike(enemy, playerPos);
    return 'active';
  }

  return 'active';
}

// --------------- Strike (Instantaneous) ---------------

function executeStrike(enemy: any, playerPos: any): void {
  // Deal damage
  enemy.health -= SPIKE.damage;
  enemy.flashTimer = 150;

  // Calculate carrier direction: angled downward toward aim position
  const dx = aimX - playerPos.x;
  const dz = aimZ - playerPos.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz) || 0.01;
  const nx = dx / horizontalDist;
  const nz = dz / horizontalDist;

  // Vertical component: -tan(angle) gives downward slope
  const angleRad = SPIKE.projectileAngle * Math.PI / 180;
  const dirY = -Math.tan(angleRad);

  const dirX = nx;
  const dirZ = nz;

  // Create carrier — entity carrier normalizes direction and applies speed
  createCarrier(enemy, { x: dirX, y: dirY, z: dirZ }, {
    speed: SPIKE.projectileSpeed,
    gravityMult: 0.5,  // some gravity for arc feel
    throughDamage: SPIKE.throughDamage,
    throughKnockback: SPIKE.throughKnockback,
    impactDamage: SPIKE.impactDamage,
    impactRadius: SPIKE.impactRadius,
    impactKnockback: SPIKE.impactKnockback,
    impactShake: SPIKE.impactShake,
  });

  // Screen shake
  screenShake(SPIKE.screenShake);

  // Emit event
  emit({
    type: 'spikeStrike',
    enemy,
    damage: SPIKE.damage,
    position: { x: enemy.pos.x, z: enemy.pos.z },
  });

  // Damage number
  spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'SPIKE!', '#ff4488');

  // Transition to recovery
  phase = 'recovery';
  phaseTimer = 0;
  playerVelYOverride = 0;  // hang during recovery
  fastFallActive = true;
}

// --------------- Recovery Phase Update ---------------

function updateRecovery(dt: number): 'active' | 'complete' | 'cancel' {
  phaseTimer += dt * 1000;

  // Hold player in place during hang
  playerVelYOverride = 0;

  if (phaseTimer >= SPIKE.hangDuration) {
    // Recovery complete — release player to fast-fall
    playerVelYOverride = null;
    return 'complete';
  }

  return 'active';
}

// --------------- Public State Queries ---------------

export function getSpikePhase(): SpikePhase {
  return phase;
}

export function getSpikePlayerVelYOverride(): number | null {
  return playerVelYOverride;
}

export function getSpikeFastFallActive(): boolean {
  return fastFallActive;
}

// --------------- Reset ---------------

function resetState(): void {
  phase = 'none';
  target = null;
  phaseTimer = 0;
  aimX = 0;
  aimZ = 0;
  playerVelYOverride = null;
  fastFallActive = false;
}

export function resetSpike(): void {
  resetState();
}
