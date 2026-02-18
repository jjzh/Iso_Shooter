// Float Selector Verb — shared rising + float phases after launch
// Resolves to either dunk (hold LMB) or spike (tap LMB) via transferClaim.
//
// Phases: rising → float → resolved (complete/cancel)
//
// Rising: both entities rise under normal gravity. Decal tracks aim.
//   Transition to float when enemy descends within convergeDist of player Y.
//   Cancel if enemy dies, falls in pit, or lands.
//
// Float: zero gravity — freeze both entities. Drift enemy toward player.
//   Track LMB input:
//   - Tap (press + release < holdThreshold) → transfer to 'spike'
//   - Hold (>= holdThreshold) → transfer to 'dunk'
//   - No input before float expires → cancel

import { DUNK, FLOAT_SELECTOR } from '../config/player';
import { setGravityOverride, transferClaim } from '../engine/aerialVerbs';
import type { AerialVerb, LaunchedEnemy } from '../engine/aerialVerbs';
import { screenShake, getScene } from '../engine/renderer';
import { spawnDamageNumber } from '../ui/damageNumbers';

// --------------- Internal State ---------------

type FloatSelectorPhase = 'none' | 'rising' | 'float';

let phase: FloatSelectorPhase = 'none';
let target: any = null;
let floatTimer = 0;           // ms remaining in float phase

// LMB input tracking
let lmbPressed = false;        // LMB was pressed during float
let lmbHoldTimer = 0;          // ms since LMB pressed
let resolved = false;          // transfer already issued

// Velocity override — player.ts checks this each frame
let playerVelYOverride: number | null = null;

// Landing target position (aim decal)
let landingX = 0;
let landingZ = 0;

// --------------- Visual State ---------------

let decalGroup: any = null;
let decalFill: any = null;
let decalRing: any = null;
let decalAge = 0;
const DECAL_EXPAND_MS = 250;

let chargeRing: any = null;
let chargeRingMat: any = null;

// --------------- Decal Management ---------------

function createDecal(cx: number, cz: number): void {
  const scene = getScene();
  const radius = DUNK.targetRadius;

  decalGroup = new THREE.Group();
  decalGroup.position.set(cx, 0.06, cz);

  // Filled circle — lower opacity than dunk's to indicate selection phase
  const fillGeo = new THREE.CircleGeometry(radius, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
  });
  decalFill = new THREE.Mesh(fillGeo, fillMat);
  decalFill.rotation.x = -Math.PI / 2;
  decalGroup.add(decalFill);

  // Outer ring
  const ringGeo = new THREE.RingGeometry(radius - 0.06, radius, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  decalRing = new THREE.Mesh(ringGeo, ringMat);
  decalRing.rotation.x = -Math.PI / 2;
  decalGroup.add(decalRing);

  // Start at scale 0 — expand over DECAL_EXPAND_MS
  decalGroup.scale.set(0, 0, 0);
  decalAge = 0;

  scene.add(decalGroup);
}

function updateDecal(playerX: number, playerZ: number, dt: number): void {
  if (!decalGroup) return;

  // Expand animation
  if (decalAge < DECAL_EXPAND_MS) {
    decalAge += dt * 1000;
    const t = Math.min(decalAge / DECAL_EXPAND_MS, 1);
    const eased = 1 - (1 - t) * (1 - t);
    decalGroup.scale.set(eased, eased, eased);
  } else if (decalGroup.scale.x < 1) {
    decalGroup.scale.set(1, 1, 1);
  }

  decalGroup.position.set(playerX, 0.06, playerZ);

  // Pulse ring opacity
  if (decalRing) {
    const pulse = 0.2 + 0.1 * Math.sin(Date.now() * 0.008);
    (decalRing.material as any).opacity = pulse;
  }
}

function removeDecal(): void {
  if (!decalGroup) return;
  const scene = getScene();
  decalGroup.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  scene.remove(decalGroup);
  decalGroup = null;
  decalFill = null;
  decalRing = null;
}

// --------------- Charge Ring Management ---------------

function createChargeRing(playerPos: any): void {
  removeChargeRing();
  const scene = getScene();
  const geo = new THREE.RingGeometry(0.5, 0.55, 32);
  chargeRingMat = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  chargeRing = new THREE.Mesh(geo, chargeRingMat);
  chargeRing.rotation.x = -Math.PI / 2;
  chargeRing.position.set(playerPos.x, playerPos.y + 0.1, playerPos.z);
  scene.add(chargeRing);
}

function updateChargeRing(playerPos: any, fillT: number): void {
  if (!chargeRing || !chargeRingMat) return;
  chargeRing.position.set(playerPos.x, playerPos.y + 0.1, playerPos.z);

  // Color shift: orange (0xff8800) → red (0xff2200) as fill progresses
  const r = 0xff;
  const g = Math.round(0x88 * (1 - fillT));
  const b = 0x00;
  chargeRingMat.color.setHex((r << 16) | (g << 8) | b);
  chargeRingMat.opacity = 0.4 + 0.4 * fillT;
}

function removeChargeRing(): void {
  if (!chargeRing) return;
  const scene = getScene();
  if (chargeRing.geometry) chargeRing.geometry.dispose();
  if (chargeRing.material) chargeRing.material.dispose();
  scene.remove(chargeRing);
  chargeRing = null;
  chargeRingMat = null;
}

// --------------- Targeting ---------------

function updateTargeting(playerPos: any, inputState: any): void {
  const aimDx = inputState.aimWorldPos.x - playerPos.x;
  const aimDz = inputState.aimWorldPos.z - playerPos.z;
  const aimDist = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 0.01;
  const clampedDist = Math.min(aimDist, DUNK.targetRadius);
  landingX = playerPos.x + (aimDx / aimDist) * clampedDist;
  landingZ = playerPos.z + (aimDz / aimDist) * clampedDist;
}

// --------------- AerialVerb Implementation ---------------

export const floatSelectorVerb: AerialVerb = {
  name: 'floatSelector',
  interruptible: true,

  canClaim(_entry: LaunchedEnemy, _playerPos: any, _inputState: any): boolean {
    return true;
  },

  onClaim(entry: LaunchedEnemy): void {
    phase = 'rising';
    target = entry.enemy;
    floatTimer = 0;
    lmbPressed = false;
    lmbHoldTimer = 0;
    resolved = false;
    playerVelYOverride = null;

    if (!decalGroup) {
      createDecal(0, 0);
    }
  },

  update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
    const enemy = entry.enemy;

    if (phase === 'rising') {
      return updateRising(dt, enemy, playerPos, inputState);
    } else if (phase === 'float') {
      return updateFloat(dt, enemy, playerPos, inputState);
    }

    return 'cancel';
  },

  onCancel(entry: LaunchedEnemy): void {
    removeDecal();
    removeChargeRing();
    setGravityOverride(entry.enemy, 1);
    phase = 'none';
    target = null;
    playerVelYOverride = null;
    lmbPressed = false;
    lmbHoldTimer = 0;
    resolved = false;
  },

  onComplete(entry: LaunchedEnemy): void {
    // Transfer already happened via transferClaim in float update.
    // Clean up selector visuals (the receiving verb owns the enemy now).
    removeDecal();
    removeChargeRing();
    phase = 'none';
    target = null;
    playerVelYOverride = null;
    lmbPressed = false;
    lmbHoldTimer = 0;
    resolved = false;
  },
};

// --------------- Rising Phase Update ---------------

function updateRising(dt: number, enemy: any, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
  const vel = enemy.vel;
  const isRising = vel && vel.y > 0;

  // Update targeting decal while rising
  updateTargeting(playerPos, inputState);
  updateDecal(playerPos.x, playerPos.z, dt);

  // Cancel conditions
  if (enemy.health <= 0 || enemy.fellInPit || (enemy.pos.y <= 0.3 && !isRising)) {
    return 'cancel';
  }

  // Convergence check: enemy must be descending (vel.y <= 0) and within Y distance of player
  if (vel && vel.y <= 0) {
    const dy = enemy.pos.y - playerPos.y;
    if (dy >= 0 && dy <= DUNK.floatConvergeDist) {
      // Converged! Transition to float
      phase = 'float';
      floatTimer = DUNK.floatDuration;
      playerVelYOverride = 0;
      setGravityOverride(enemy, 0);

      screenShake(DUNK.grabShake * 0.5);
      spawnDamageNumber(playerPos.x, playerPos.z, 'CATCH!', '#ff88ff');
      return 'active';
    }
  }

  return 'active';
}

// --------------- Float Phase Update ---------------

function updateFloat(dt: number, enemy: any, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
  floatTimer -= dt * 1000;
  const vel = enemy.vel;

  // Kill gravity on both — hold in place
  playerVelYOverride = 0;
  if (vel) vel.y = 0;

  // Drift enemy Y toward hover position above player (linear lerp)
  const targetEnemyY = playerPos.y + DUNK.floatEnemyOffsetY;
  enemy.pos.y += (targetEnemyY - enemy.pos.y) * Math.min(1, dt * 10);

  // Drift enemy XZ toward player (exponential lerp — drift fix)
  const driftDx = playerPos.x - enemy.pos.x;
  const driftDz = playerPos.z - enemy.pos.z;
  const lerpFactor = 1 - Math.exp(-12 * dt);
  enemy.pos.x += driftDx * lerpFactor;
  enemy.pos.z += driftDz * lerpFactor;

  // Sync enemy mesh
  if (enemy.mesh) enemy.mesh.position.copy(enemy.pos);

  // Update targeting decal
  updateTargeting(playerPos, inputState);
  updateDecal(playerPos.x, playerPos.z, dt);

  // --- LMB Input Tracking ---
  if (!lmbPressed && inputState.attack) {
    // LMB just pressed this frame
    lmbPressed = true;
    lmbHoldTimer = 0;
    createChargeRing(playerPos);
  }

  if (lmbPressed) {
    if (inputState.attackHeld) {
      // Still holding LMB — increment hold timer
      lmbHoldTimer += dt * 1000;
      const fillT = Math.min(lmbHoldTimer / FLOAT_SELECTOR.holdThreshold, 1);
      updateChargeRing(playerPos, fillT);

      if (lmbHoldTimer >= FLOAT_SELECTOR.holdThreshold) {
        // Hold past threshold → transfer to dunk
        transferClaim(enemy, 'dunk');
        resolved = true;
        return 'complete';
      }
    } else {
      // LMB was released before threshold → tap → transfer to spike
      transferClaim(enemy, 'spike');
      resolved = true;
      return 'complete';
    }
  }

  // Float expired with no input → cancel
  if (floatTimer <= 0) {
    return 'cancel';
  }

  return 'active';
}

// --------------- Public State Queries ---------------

export function getFloatSelectorPhase(): FloatSelectorPhase {
  return phase;
}

export function getFloatSelectorLandingPos(): { x: number; z: number } | null {
  if (phase === 'none') return null;
  return { x: landingX, z: landingZ };
}

export function isFloatSelectorActive(): boolean {
  return phase !== 'none';
}

export function getFloatSelectorPlayerVelY(): number | null {
  return playerVelYOverride;
}

// --------------- Reset ---------------

export function resetFloatSelector(): void {
  phase = 'none';
  target = null;
  floatTimer = 0;
  lmbPressed = false;
  lmbHoldTimer = 0;
  resolved = false;
  playerVelYOverride = null;
  landingX = 0;
  landingZ = 0;
  removeDecal();
  removeChargeRing();
}
