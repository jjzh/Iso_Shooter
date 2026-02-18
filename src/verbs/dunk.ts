// Dunk Verb Module — extracted from player.ts
// State machine: grab -> slam
//
// The float selector verb owns rising + float phases (convergence, aiming).
// When the selector resolves to dunk (hold LMB past threshold), it transfers
// claim to dunk via onClaim. At that point player and enemy are already
// floating together.
//
// Grab: snap enemy to player, begin slam descent
// Slam: arc trajectory toward landing target, enemy carried below player

import { DUNK } from '../config/player';
import { getGroundHeight } from '../config/terrain';
import { setGravityOverride } from '../engine/aerialVerbs';
import type { AerialVerb, LaunchedEnemy } from '../engine/aerialVerbs';
import { screenShake, getScene } from '../engine/renderer';
import { emit } from '../engine/events';
import { spawnDamageNumber } from '../ui/damageNumbers';

// --------------- Internal State ---------------

type DunkPhase = 'none' | 'grab' | 'slam';

let phase: DunkPhase = 'none';
let target: any = null;        // enemy being dunked
let floatTimer = 0;            // ms remaining in float phase

// Landing target position (where the slam will land)
let landingX = 0;
let landingZ = 0;

// Decal origin (tracks player position — decal is centered on player)
let originX = 0;
let originZ = 0;

// Slam arc state
let slamStartY = 0;
let slamStartX = 0;
let slamStartZ = 0;

// Velocity override — when non-null, player.ts should use this for playerVelY
let playerVelYOverride: number | null = null;

// Landing lag override — when > 0, player.ts should apply this many ms of landing lag
let landingLagMs = 0;

// Game state reference — set during update, used by onComplete for AoE
let _gameState: any = null;

// --------------- Visual State (decal + trail) ---------------

let decalGroup: any = null;
let decalFill: any = null;
let decalRing: any = null;
let decalAge = 0;
const DECAL_EXPAND_MS = 250;

const TRAIL_MAX = 20;
let trailLine: any = null;
let trailPoints: { x: number; y: number; z: number }[] = [];
let trailLife = 0; // ms remaining for trail fade after landing

// --------------- Decal Management ---------------

function createDecal(cx: number, cz: number): void {
  const scene = getScene();
  const radius = DUNK.targetRadius;

  decalGroup = new THREE.Group();
  decalGroup.position.set(cx, 0.06, cz);

  // Filled circle -- semi-transparent magenta
  const fillGeo = new THREE.CircleGeometry(radius, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xff44ff,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  });
  decalFill = new THREE.Mesh(fillGeo, fillMat);
  decalFill.rotation.x = -Math.PI / 2;
  decalGroup.add(decalFill);

  // Outer ring -- brighter border
  const ringGeo = new THREE.RingGeometry(radius - 0.06, radius, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff66ff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  decalRing = new THREE.Mesh(ringGeo, ringMat);
  decalRing.rotation.x = -Math.PI / 2;
  decalGroup.add(decalRing);

  // Crosshair -- sized to match AoE splash radius
  const dotGeo = new THREE.CircleGeometry(DUNK.aoeRadius, 24);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0xff88ff,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.rotation.x = -Math.PI / 2;
  dot.name = 'dunkCrosshair';
  decalGroup.add(dot);

  // Start at scale 0 -- expand over DECAL_EXPAND_MS
  decalGroup.scale.set(0, 0, 0);
  decalAge = 0;

  scene.add(decalGroup);
}

function updateDecal(aimX: number, aimZ: number, dt: number): void {
  if (!decalGroup) return;

  // Expand animation -- ease-out from 0 to 1
  if (decalAge < DECAL_EXPAND_MS) {
    decalAge += dt * 1000;
    const t = Math.min(decalAge / DECAL_EXPAND_MS, 1);
    const eased = 1 - (1 - t) * (1 - t); // ease-out quadratic
    decalGroup.scale.set(eased, eased, eased);
  } else if (decalGroup.scale.x < 1) {
    decalGroup.scale.set(1, 1, 1);
  }

  // Decal stays centered on player position (originX/Z updated each frame)
  decalGroup.position.set(originX, 0.06, originZ);

  // Move crosshair dot to show landing target (relative to decal center)
  const dot = decalGroup.getObjectByName('dunkCrosshair');
  if (dot) {
    const dx = landingX - originX;
    const dz = landingZ - originZ;
    dot.position.set(dx, 0, dz);
  }

  // Pulse ring opacity for urgency
  if (decalRing) {
    const pulse = 0.3 + 0.15 * Math.sin(Date.now() * 0.008);
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

// --------------- Trail Management ---------------

function createTrail(): void {
  removeTrail();
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAIL_MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);

  const mat = new THREE.LineBasicMaterial({
    color: 0xff66ff,
    transparent: true,
    opacity: 0.7,
    linewidth: 1,
  });
  trailLine = new THREE.Line(geo, mat);
  trailLine.frustumCulled = false;
  getScene().add(trailLine);
  trailLife = 0;
}

function updateTrailGeometry(): void {
  if (!trailLine) return;
  const posAttr = trailLine.geometry.getAttribute('position');
  const arr = posAttr.array;
  for (let i = 0; i < trailPoints.length; i++) {
    const p = trailPoints[i];
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  posAttr.needsUpdate = true;
  trailLine.geometry.setDrawRange(0, trailPoints.length);
}

function startTrailFade(): void {
  trailLife = 300; // ms to fade out after landing
}

function removeTrail(): void {
  if (!trailLine) return;
  const scene = getScene();
  scene.remove(trailLine);
  if (trailLine.geometry) trailLine.geometry.dispose();
  if (trailLine.material) trailLine.material.dispose();
  trailLine = null;
  trailPoints = [];
  trailLife = 0;
}

// --------------- Targeting (used during slam) ---------------

function updateTargeting(playerPos: any, inputState: any): void {
  // Keep the aim origin anchored to the player
  originX = playerPos.x;
  originZ = playerPos.z;

  // Update landing target from current aim, clamped to radius
  const aimDx = inputState.aimWorldPos.x - originX;
  const aimDz = inputState.aimWorldPos.z - originZ;
  const aimDist = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 0.01;
  const clampedDist = Math.min(aimDist, DUNK.targetRadius);
  landingX = originX + (aimDx / aimDist) * clampedDist;
  landingZ = originZ + (aimDz / aimDist) * clampedDist;
}

// --------------- AerialVerb Implementation ---------------

export const dunkVerb: AerialVerb = {
  name: 'dunk',
  interruptible: false,

  canClaim(entry: LaunchedEnemy, playerPos: any, _inputState: any): boolean {
    // Dunk auto-claims on launch — the launch code in player.ts sets up
    // the pending target. For the framework, we always allow claim since
    // the launch verb already validated proximity.
    return true;
  },

  onClaim(entry: LaunchedEnemy): void {
    // Selector already handled rising + float + convergence.
    // Player and enemy are floating together — go straight to grab.
    phase = 'grab';
    target = entry.enemy;
    floatTimer = 0;
    playerVelYOverride = null;
    landingLagMs = 0;
  },

  update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
    const enemy = entry.enemy;
    _gameState = inputState._gameState; // sneak gameState through inputState for AoE

    if (phase === 'grab') {
      // Initialize the landing target from current aim position
      originX = playerPos.x;
      originZ = playerPos.z;
      const aimDx = inputState.aimWorldPos.x - originX;
      const aimDz = inputState.aimWorldPos.z - originZ;
      const aimDist = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 0.01;
      const clampedDist = Math.min(aimDist, DUNK.targetRadius);
      landingX = originX + (aimDx / aimDist) * clampedDist;
      landingZ = originZ + (aimDz / aimDist) * clampedDist;

      transitionToGrab(enemy, playerPos);
      phase = 'slam';
      // Fall through to slam update on next frame
      return 'active';
    }

    if (phase === 'slam') {
      return updateSlam(dt, enemy, playerPos, inputState);
    }

    return 'cancel';
  },

  onCancel(entry: LaunchedEnemy): void {
    // Clean up everything — enemy died, float expired, etc.
    removeDecal();
    removeTrail();
    // Reset gravity to normal for the enemy
    setGravityOverride(entry.enemy, 1);
    phase = 'none';
    target = null;
    playerVelYOverride = null;
    landingLagMs = 0;
  },

  onComplete(entry: LaunchedEnemy): void {
    const enemy = entry.enemy;
    const groundHeight = getGroundHeight(enemy.pos.x, enemy.pos.z);

    // Primary damage to dunk target
    enemy.health -= DUNK.damage;
    enemy.flashTimer = 150;
    enemy.pos.y = groundHeight;
    const tVel = (enemy as any).vel;
    if (tVel) { tVel.x = 0; tVel.y = 0; tVel.z = 0; }
    if (enemy.mesh) enemy.mesh.position.copy(enemy.pos);

    // AoE splash damage to other nearby enemies
    if (_gameState && _gameState.enemies) {
      const enemies = _gameState.enemies;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e === enemy) continue;
        if (e.health <= 0 || (e as any).fellInPit) continue;
        const dx = e.pos.x - enemy.pos.x;
        const dz = e.pos.z - enemy.pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < DUNK.aoeRadius * DUNK.aoeRadius) {
          e.health -= DUNK.aoeDamage;
          e.flashTimer = 100;
          const dist = Math.sqrt(distSq) || 0.1;
          const vel = (e as any).vel;
          if (vel) {
            vel.x += (dx / dist) * DUNK.aoeKnockback;
            vel.z += (dz / dist) * DUNK.aoeKnockback;
          }
        }
      }
    }

    // Screen shake (massive)
    screenShake(DUNK.landingShake);

    // Emit dunk impact event
    emit({
      type: 'dunkImpact',
      enemy,
      damage: DUNK.damage,
      position: { x: enemy.pos.x, z: enemy.pos.z },
    });
    spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'DUNK!', '#ff2244');

    // Visual cleanup
    removeDecal();
    startTrailFade();

    // Set landing lag (player.ts reads this)
    landingLagMs = DUNK.landingLag;

    // Reset verb state
    phase = 'none';
    target = null;
    playerVelYOverride = null;
  },
};

// --------------- Grab Transition ---------------

function transitionToGrab(enemy: any, playerPos: any): void {
  phase = 'slam'; // go directly to slam phase (grab is instantaneous)
  target = enemy;
  const ptVel = (enemy as any).vel;

  // Snap enemy to player position
  enemy.pos.x = playerPos.x;
  enemy.pos.z = playerPos.z;
  enemy.pos.y = playerPos.y + DUNK.carryOffsetY;

  // Set slam velocity for both
  playerVelYOverride = DUNK.slamVelocity;
  if (ptVel) ptVel.y = DUNK.slamVelocity;

  // Face the landing target
  const faceDx = landingX - playerPos.x;
  const faceDz = landingZ - playerPos.z;
  // Note: player.ts will read the facing from getDunkFacing() or compute it

  // Record slam start for arc progress
  slamStartY = playerPos.y;
  slamStartX = playerPos.x;
  slamStartZ = playerPos.z;
  trailPoints = [{ x: playerPos.x, y: playerPos.y, z: playerPos.z }];
  createTrail();

  // Grab impact -- shake + event
  screenShake(DUNK.grabShake);
  emit({
    type: 'dunkGrab',
    enemy,
    position: { x: playerPos.x, z: playerPos.z },
  });
  spawnDamageNumber(playerPos.x, playerPos.z, 'GRAB!', '#ff44ff');
}

// --------------- Slam Phase Update ---------------

function updateSlam(dt: number, enemy: any, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
  // Update targeting (decal follows player during slam too)
  updateTargeting(playerPos, inputState);
  updateDecal(landingX, landingZ, dt);

  // Arc trajectory -- ease-in XZ so the slam curves instead of going straight
  // Progress: 0 = slam start height, 1 = ground level
  const groundY = getGroundHeight(playerPos.x, playerPos.z);
  const totalDrop = Math.max(slamStartY - groundY, 0.1);
  const dropped = Math.max(slamStartY - playerPos.y, 0);
  const progress = Math.min(dropped / totalDrop, 1);
  // Ease-in: XZ speed starts slow, accelerates -- creates a curved arc
  const arcMult = 0.3 + 0.7 * progress;

  // Home player XZ toward landing target with arc-scaled speed
  const toDx = landingX - playerPos.x;
  const toDz = landingZ - playerPos.z;
  const toDist = Math.sqrt(toDx * toDx + toDz * toDz);
  if (toDist > 0.05) {
    const moveStep = Math.min(DUNK.homing * arcMult * dt, toDist);
    playerPos.x += (toDx / toDist) * moveStep;
    playerPos.z += (toDz / toDist) * moveStep;
  }

  // Add trail point
  trailPoints.push({ x: playerPos.x, y: playerPos.y, z: playerPos.z });
  if (trailPoints.length > TRAIL_MAX) trailPoints.shift();
  updateTrailGeometry();

  // Carry enemy with offset -- slightly below and in front of player
  enemy.pos.x = playerPos.x;
  enemy.pos.z = playerPos.z;
  enemy.pos.y = playerPos.y + DUNK.carryOffsetY;
  if (enemy.mesh) {
    // Visual offset: push enemy mesh forward (toward landing target)
    const faceDx = landingX - playerPos.x;
    const faceDz = landingZ - playerPos.z;
    const faceDist = Math.sqrt(faceDx * faceDx + faceDz * faceDz) || 0.01;
    const fwdX = (faceDx / faceDist) * DUNK.carryOffsetZ;
    const fwdZ = (faceDz / faceDist) * DUNK.carryOffsetZ;
    enemy.mesh.position.set(
      enemy.pos.x + fwdX,
      enemy.pos.y,
      enemy.pos.z + fwdZ
    );
  }

  // Check if player reached ground (slam landed)
  const groundHeight = getGroundHeight(playerPos.x, playerPos.z);
  if (playerPos.y <= groundHeight) {
    playerPos.y = groundHeight;
    return 'complete';
  }

  return 'active';
}

// --------------- Public State Queries ---------------

export function getDunkPhase(): DunkPhase {
  return phase;
}

export function getDunkTarget(): any | null {
  return target;
}

export function isDunkActive(): boolean {
  return phase !== 'none';
}

export function getDunkLandingPos(): { x: number; z: number } | null {
  if (phase === 'none') return null;
  return { x: landingX, z: landingZ };
}

// Player velocity override -- player.ts checks this each frame
// null = no override (use normal gravity), number = use this velY
export function getDunkPlayerVelY(): number | null {
  return playerVelYOverride;
}

// Landing lag to apply after dunk completes -- player.ts reads + resets
export function getDunkLandingLag(): number {
  const lag = landingLagMs;
  landingLagMs = 0; // consumed once
  return lag;
}

// --------------- Visual Updates (called from player.ts update loop) ---------------

export function updateDunkVisuals(dt: number): void {
  // Trail fade after landing
  if (trailLine && trailLife > 0) {
    trailLife -= dt * 1000;
    const opacity = Math.max(0, trailLife / 300) * 0.7;
    (trailLine.material as any).opacity = opacity;
    if (trailLife <= 0) {
      removeTrail();
    }
  }
}

// --------------- Decal + Landing Setup (called from launch code) ---------------

// Called by player.ts launch code to initialize the landing target before
// the verb is formally activated (decal appears immediately on launch)
export function initDunkTarget(enemyX: number, enemyZ: number, aimX: number, aimZ: number): void {
  originX = enemyX;
  originZ = enemyZ;
  landingX = aimX;
  landingZ = aimZ;

  // Clamp initial target to radius
  const dx = landingX - originX;
  const dz = landingZ - originZ;
  const dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
  if (dist > DUNK.targetRadius) {
    landingX = originX + (dx / dist) * DUNK.targetRadius;
    landingZ = originZ + (dz / dist) * DUNK.targetRadius;
  }

  createDecal(originX, originZ);
}

// --------------- Reset ---------------

export function resetDunk(): void {
  phase = 'none';
  target = null;
  floatTimer = 0;
  playerVelYOverride = null;
  landingLagMs = 0;
  landingX = 0;
  landingZ = 0;
  originX = 0;
  originZ = 0;
  slamStartY = 0;
  slamStartX = 0;
  slamStartZ = 0;
  _gameState = null;
  removeDecal();
  removeTrail();
}
