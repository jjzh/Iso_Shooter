import { PLAYER, MELEE, JUMP, LAUNCH, AERIAL_STRIKE, SELF_SLAM, DUNK } from '../config/player';
import { getGroundHeight } from '../config/terrain';
import { PHYSICS } from '../config/physics';
import { ABILITIES } from '../config/abilities';
import { ARENA_HALF_X, ARENA_HALF_Z } from '../config/arena';
import { screenShake, getScene } from '../engine/renderer';
import { getAbilityDirOverride, clearAbilityDirOverride } from '../engine/input';
import { getIceEffects } from './mortarProjectile';
import { emit } from '../engine/events';
import { spawnDamageNumber } from '../ui/damageNumbers';
import { createPlayerRig, getGhostGeometries } from './playerRig';
import type { PlayerRig } from './playerRig';
import { createAnimatorState, updateAnimation, resetAnimatorState } from './playerAnimator';
import type { AnimatorState } from './playerAnimator';

let playerGroup: any, aimIndicator: any;
let rig: PlayerRig;
let animState: AnimatorState;
const playerPos = new THREE.Vector3(0, 0, 0);

// Melee state
let meleeSwinging = false;
let meleeCooldownTimer = 0;  // ms remaining until next swing allowed
let meleeSwingTimer = 0;     // ms into current swing (for animation)
const MELEE_SWING_DURATION = 200; // ms — how long the swing animation plays
const meleeHitEnemies: Set<any> = new Set(); // track which enemies were hit this swing (multi-hit)
let meleeSwingDir = 0;        // angle of the swing (radians)

// Dash state
let isDashing = false;
let dashTimer = 0;
let dashDuration = 0;
let dashDistance = 0;
const dashDir = new THREE.Vector3();
const dashStartPos = new THREE.Vector3();
let isInvincible = false;
let endLagTimer = 0;

// Afterimages
const afterimages: any[] = [];

// Push event (consumed by physics each frame)
let pushEvent: any = null;

// Charge state
let isCharging = false;
let chargeTimer = 0;
let chargeAimAngle = 0;
let chargeTelegraphGroup: any = null;
let chargeFillMesh: any = null;
let chargeBorderMesh: any = null;
let chargeBorderGeo: any = null;

// Jump / vertical state
let playerVelY = 0;
let isPlayerAirborne = false;
let landingLagTimer = 0;

// Launch verb state
let launchCooldownTimer = 0;

// Self-slam state
let isSlamming = false;

// Dunk state
let isDunking = false;
let dunkTarget: any = null;
let dunkPendingTarget: any = null;  // enemy we launched — waiting for convergence
let isFloating = false;              // true during zero-gravity float phase
let floatTimer = 0;                  // ms remaining in float phase
let dunkLandingX = 0;           // target landing position XZ
let dunkLandingZ = 0;
let dunkOriginX = 0;            // XZ where grab happened (decal center)
let dunkOriginZ = 0;
let dunkDecalGroup: any = null;  // ground circle decal
let dunkDecalFill: any = null;   // filled circle (crosshair)
let dunkDecalAge = 0;            // ms since decal created (for expand animation)
const DECAL_EXPAND_MS = 250;     // ms to expand from 0 → full size
let dunkDecalRing: any = null;   // outer ring (radius indicator)

// Dunk slam arc state
let dunkSlamStartY = 0;          // Y position when slam begins (for arc progress)
let dunkSlamStartX = 0;          // XZ position when slam begins
let dunkSlamStartZ = 0;

// Dunk trail state
const DUNK_TRAIL_MAX = 20;
let dunkTrailLine: any = null;
let dunkTrailPoints: { x: number; y: number; z: number }[] = [];
let dunkTrailLife = 0;           // ms remaining for trail fade after landing

// Original emissive colors (used for charge glow reset)
const DEFAULT_EMISSIVE = 0x22aa66;
const DEFAULT_EMISSIVE_INTENSITY = 0.4;

function restoreDefaultEmissive() {
  if (!rig) return;
  for (const mat of rig.materials) {
    mat.emissive.setHex(DEFAULT_EMISSIVE);
    mat.emissiveIntensity = DEFAULT_EMISSIVE_INTENSITY;
  }
}

export function createPlayer(scene: any) {
  playerGroup = new THREE.Group();

  // Build bipedal rig (joint hierarchy + box-limb meshes)
  rig = createPlayerRig(playerGroup);
  animState = createAnimatorState();

  // Aim indicator — attached to playerGroup directly (not rig)
  // so squash/stretch doesn't affect it
  aimIndicator = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.6, 4),
    new THREE.MeshStandardMaterial({
      color: 0x44ff88,
      emissive: 0x44ff88,
      emissiveIntensity: 0.8
    })
  );
  aimIndicator.rotation.x = -Math.PI / 2;
  aimIndicator.position.set(0, 0.8, -0.7);
  playerGroup.add(aimIndicator);

  scene.add(playerGroup);
  return playerGroup;
}

export function updatePlayer(inputState: any, dt: number, gameState: any) {
  const now = performance.now();

  // Tick ability cooldowns
  for (const key of Object.keys(gameState.abilities)) {
    if (gameState.abilities[key].cooldownRemaining > 0) {
      gameState.abilities[key].cooldownRemaining -= dt * 1000;
    }
  }

  // Tick charge system
  if (isCharging) {
    updateCharge(inputState, dt, gameState);
  }

  // End lag (post-dash lockout)
  if (endLagTimer > 0) {
    endLagTimer -= dt * 1000;
    // During end lag, don't process movement or abilities
    playerGroup.position.copy(playerPos);
    aimAtCursor(inputState);
    updateAnimation(rig.joints, animState, dt,
      { moveX: 0, moveZ: 0 }, playerGroup.rotation.y,
      false, true, 0);
    updateAfterimages(dt);
    return;
  }

  // === DASH ===
  if (isDashing) {
    updateDash(dt, gameState);
    playerGroup.position.copy(playerPos);

    // Aim still tracks cursor during dash
    aimAtCursor(inputState);

    updateAnimation(rig.joints, animState, dt,
      { moveX: inputState.moveX, moveZ: inputState.moveZ }, playerGroup.rotation.y,
      true, false, Math.min(dashTimer / dashDuration, 1));
    updateAfterimages(dt);
    return;
  }

  // Trigger dash
  if (inputState.dash && gameState.abilities.dash.cooldownRemaining <= 0) {
    startDash(inputState, gameState);
  }

  // Trigger charge (start) — LMB hold (chargeStarted) or E key (ultimate) both work
  if ((inputState.chargeStarted || inputState.ultimate) && gameState.abilities.ultimate.cooldownRemaining <= 0 && !isCharging) {
    startCharge(inputState, gameState);
  }

  // === JUMP ===
  if (inputState.jump && !isPlayerAirborne && !isDashing && landingLagTimer <= 0) {
    playerVelY = JUMP.initialVelocity;
    isPlayerAirborne = true;
    emit({ type: 'playerJump', position: { x: playerPos.x, z: playerPos.z } });
  }

  // === LAUNCH COOLDOWN ===
  if (launchCooldownTimer > 0) {
    launchCooldownTimer -= dt * 1000;
  }

  // === LAUNCH VERB (E while grounded) ===
  if (inputState.launch && !isPlayerAirborne && !isDashing && launchCooldownTimer <= 0) {
    // Find closest enemy within range (360° — no arc restriction)
    const enemies = gameState.enemies;
    let closestEnemy: any = null;
    let closestDistSq = LAUNCH.range * LAUNCH.range;
    if (enemies) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.health <= 0 || (e as any).fellInPit) continue;
        const dx = e.pos.x - playerPos.x;
        const dz = e.pos.z - playerPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestEnemy = e;
        }
      }
    }

    if (closestEnemy) {
      // Launch the enemy upward — velocity derived from player's jump velocity
      const vel = (closestEnemy as any).vel;
      if (vel) vel.y = JUMP.initialVelocity * LAUNCH.enemyVelMult;

      // Chip damage
      closestEnemy.health -= LAUNCH.damage;

      // Face the target
      const dx = closestEnemy.pos.x - playerPos.x;
      const dz = closestEnemy.pos.z - playerPos.z;
      playerGroup.rotation.y = Math.atan2(-dx, -dz);

      // Player hops up to follow — derived from jump velocity
      playerVelY = JUMP.initialVelocity * LAUNCH.playerVelMult;
      isPlayerAirborne = true;

      // Set cooldown
      launchCooldownTimer = LAUNCH.cooldown;

      // Begin dunk targeting immediately — decal shows while rising
      dunkPendingTarget = closestEnemy;
      dunkOriginX = closestEnemy.pos.x;
      dunkOriginZ = closestEnemy.pos.z;
      dunkLandingX = inputState.aimWorldPos.x;
      dunkLandingZ = inputState.aimWorldPos.z;
      // Clamp initial target to radius
      const aimDxL = dunkLandingX - dunkOriginX;
      const aimDzL = dunkLandingZ - dunkOriginZ;
      const aimDistL = Math.sqrt(aimDxL * aimDxL + aimDzL * aimDzL) || 0.01;
      if (aimDistL > DUNK.targetRadius) {
        dunkLandingX = dunkOriginX + (aimDxL / aimDistL) * DUNK.targetRadius;
        dunkLandingZ = dunkOriginZ + (aimDzL / aimDistL) * DUNK.targetRadius;
      }
      createDunkDecal(dunkOriginX, dunkOriginZ);

      emit({
        type: 'enemyLaunched',
        enemy: closestEnemy,
        position: { x: closestEnemy.pos.x, z: closestEnemy.pos.z },
        velocity: JUMP.initialVelocity * LAUNCH.enemyVelMult,
      });
      spawnDamageNumber(closestEnemy.pos.x, closestEnemy.pos.z, 'LAUNCH!', '#ffaa00');

      // Consume the launch input so the grab/slam block below doesn't
      // also fire on the same frame (launch sets isPlayerAirborne = true,
      // which would immediately trigger self-slam otherwise)
      inputState.launch = false;
    }
  }

  // === FLOAT PHASE — zero-gravity hang time for dunk aiming ===
  // When player + enemy converge mid-air, both freeze in place (gravity = 0).
  // Player aims the landing target during this window and presses E to dunk.
  if (isFloating && dunkPendingTarget) {
    floatTimer -= dt * 1000;
    const pt = dunkPendingTarget;
    const ptVel = (pt as any).vel;

    // Kill gravity on both — hold them in place
    playerVelY = 0;
    if (ptVel) ptVel.y = 0;

    // Gently drift enemy to hover above player
    const targetEnemyY = playerPos.y + DUNK.floatEnemyOffsetY;
    pt.pos.y += (targetEnemyY - pt.pos.y) * Math.min(1, dt * 10);

    // Gently drift XZ together
    const driftDx = playerPos.x - pt.pos.x;
    const driftDz = playerPos.z - pt.pos.z;
    const driftDist = Math.sqrt(driftDx * driftDx + driftDz * driftDz);
    if (driftDist > 0.05) {
      const step = Math.min(DUNK.floatDriftSpeed * dt, driftDist);
      pt.pos.x += (driftDx / driftDist) * step;
      pt.pos.z += (driftDz / driftDist) * step;
    }

    // Sync enemy mesh
    if (pt.mesh) pt.mesh.position.copy(pt.pos);

    // Check if target died/fell during float
    if (pt.health <= 0 || (pt as any).fellInPit) {
      isFloating = false;
      floatTimer = 0;
      dunkPendingTarget = null;
      removeDunkDecal();
    }
    // MANUAL DUNK — player presses E during float to trigger grab+slam
    else if (inputState.launch) {
      inputState.launch = false;
      isFloating = false;
      floatTimer = 0;
      isDunking = true;
      dunkTarget = pt;
      dunkPendingTarget = null;
      playerVelY = DUNK.slamVelocity;

      // Snap enemy to player position (they're already close from drift)
      pt.pos.x = playerPos.x;
      pt.pos.z = playerPos.z;
      pt.pos.y = playerPos.y + DUNK.carryOffsetY;

      // Slam enemy downward too
      if (ptVel) ptVel.y = DUNK.slamVelocity;

      // Face the landing target
      const faceDx = dunkLandingX - playerPos.x;
      const faceDz = dunkLandingZ - playerPos.z;
      if (faceDx !== 0 || faceDz !== 0) {
        playerGroup.rotation.y = Math.atan2(-faceDx, -faceDz);
      }

      // Record slam start for arc + trail
      dunkSlamStartY = playerPos.y;
      dunkSlamStartX = playerPos.x;
      dunkSlamStartZ = playerPos.z;
      dunkTrailPoints = [{ x: playerPos.x, y: playerPos.y, z: playerPos.z }];
      createDunkTrail();

      // Grab impact — shake + freeze-frame
      screenShake(DUNK.grabShake);
      emit({
        type: 'dunkGrab',
        enemy: pt,
        position: { x: playerPos.x, z: playerPos.z },
      });
      spawnDamageNumber(playerPos.x, playerPos.z, 'GRAB!', '#ff44ff');
    }
    // Float expired — drop back to normal physics (no dunk)
    else if (floatTimer <= 0) {
      isFloating = false;
      dunkPendingTarget = null;
      removeDunkDecal();
    }
  }

  // === CONVERGENCE CHECK — detect when player & enemy meet, enter float ===
  // After launch, track the pending target. When the enemy descends within
  // floatConvergeDist of the player, freeze both in a zero-gravity float.
  if (dunkPendingTarget && !isFloating && isPlayerAirborne && !isSlamming && !isDunking) {
    const pt = dunkPendingTarget;
    const ptVel = (pt as any).vel;
    const ptRising = ptVel && ptVel.y > 0;

    // Check if pending target is still valid (alive, airborne or still rising)
    if (pt.health <= 0 || (pt as any).fellInPit || (pt.pos.y <= 0.3 && !ptRising)) {
      dunkPendingTarget = null;
      removeDunkDecal();
    } else {
      // Enemy must be descending (past apex) and within convergence distance
      const dy = pt.pos.y - playerPos.y;
      if (ptVel && ptVel.y <= 0 && dy >= 0 && dy <= DUNK.floatConvergeDist) {
        // Converged! Enter float phase
        isFloating = true;
        floatTimer = DUNK.floatDuration;

        // Small shake to signal the moment
        screenShake(DUNK.grabShake * 0.5);
        spawnDamageNumber(playerPos.x, playerPos.z, 'CATCH!', '#ff88ff');
      }
    }
  }

  // === SELF-SLAM (E while airborne, no pending dunk, not floating) ===
  if (inputState.launch && isPlayerAirborne && !isSlamming && !isDunking && !dunkPendingTarget && !isFloating) {
    isSlamming = true;
    playerVelY = SELF_SLAM.slamVelocity;
    // Cancel any lingering decal
    removeDunkDecal();
  }

  // === MOVEMENT ===
  if (Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01) {
    const chargeSlow = isCharging ? ABILITIES.ultimate.chargeMoveSpeedMult : 1;
    // Check for ice patch effects (doubled speed on ice)
    const iceEffects = getIceEffects(playerPos.x, playerPos.z, true);
    const speedMod = chargeSlow * iceEffects.speedMult;
    playerPos.x += inputState.moveX * PLAYER.speed * speedMod * dt;
    playerPos.z += inputState.moveZ * PLAYER.speed * speedMod * dt;

  }

  // Arena clamp — 0.5 margin from walls (dynamic per room size)
  const clampX = ARENA_HALF_X - 0.5;
  const clampZ = ARENA_HALF_Z - 0.5;
  playerPos.x = Math.max(-clampX, Math.min(clampX, playerPos.x));
  playerPos.z = Math.max(-clampZ, Math.min(clampZ, playerPos.z));

  // === LEDGE FALL — walking off a platform edge ===
  if (!isPlayerAirborne) {
    const groundBelow = getGroundHeight(playerPos.x, playerPos.z);
    if (playerPos.y > groundBelow + PHYSICS.groundEpsilon) {
      // Ground dropped out — start falling
      isPlayerAirborne = true;
      playerVelY = 0; // no upward velocity, just fall
    }
  }

  // === PLAYER Y PHYSICS ===
  if (isPlayerAirborne) {
    // Skip gravity during float phase — both player and enemy hover
    if (!isFloating) {
      playerVelY -= JUMP.gravity * dt;
      playerPos.y += playerVelY * dt;
    }

    // === DUNK TARGETING — update decal + aim while pending or grabbed ===
    if (dunkPendingTarget || (isDunking && dunkTarget)) {
      // Keep the aim origin anchored to the player so the decal follows them
      dunkOriginX = playerPos.x;
      dunkOriginZ = playerPos.z;

      // Update landing target from current aim, clamped to radius
      const aimDx = inputState.aimWorldPos.x - dunkOriginX;
      const aimDz = inputState.aimWorldPos.z - dunkOriginZ;
      const aimDist = Math.sqrt(aimDx * aimDx + aimDz * aimDz) || 0.01;
      const clampedDist = Math.min(aimDist, DUNK.targetRadius);
      dunkLandingX = dunkOriginX + (aimDx / aimDist) * clampedDist;
      dunkLandingZ = dunkOriginZ + (aimDz / aimDist) * clampedDist;

      // Update ground decal (visible during both pending and grabbed phases)
      updateDunkDecal(dunkLandingX, dunkLandingZ, dt);
    }

    // XZ homing only after grab (not while pending — player rises freely)
    if (isDunking && dunkTarget) {
      // Arc trajectory — ease-in XZ so the slam curves instead of going straight
      // Progress: 0 = slam start height, 1 = ground level
      const groundY = getGroundHeight(playerPos.x, playerPos.z);
      const totalDrop = Math.max(dunkSlamStartY - groundY, 0.1);
      const dropped = Math.max(dunkSlamStartY - playerPos.y, 0);
      const progress = Math.min(dropped / totalDrop, 1); // 0→1 as player falls
      // Ease-in: XZ speed starts slow, accelerates — creates a curved arc
      // Using sqrt-based blend: starts at 30% speed, ramps to 100%
      const arcMult = 0.3 + 0.7 * progress;

      // Home player XZ toward landing target with arc-scaled speed
      const toDx = dunkLandingX - playerPos.x;
      const toDz = dunkLandingZ - playerPos.z;
      const toDist = Math.sqrt(toDx * toDx + toDz * toDz);
      if (toDist > 0.05) {
        const moveStep = Math.min(DUNK.homing * arcMult * dt, toDist);
        playerPos.x += (toDx / toDist) * moveStep;
        playerPos.z += (toDz / toDist) * moveStep;
      }

      // Add trail point
      dunkTrailPoints.push({ x: playerPos.x, y: playerPos.y, z: playerPos.z });
      if (dunkTrailPoints.length > DUNK_TRAIL_MAX) dunkTrailPoints.shift();
      updateDunkTrail();

      // Carry enemy with offset — slightly below and in front of player
      // so both models are visible and it reads as "holding"
      dunkTarget.pos.x = playerPos.x;
      dunkTarget.pos.z = playerPos.z;
      dunkTarget.pos.y = playerPos.y + DUNK.carryOffsetY;
      if (dunkTarget.mesh) {
        // Visual offset: push enemy mesh forward (toward landing target)
        const aimAngle = playerGroup.rotation.y;
        const fwdX = -Math.sin(aimAngle) * DUNK.carryOffsetZ;
        const fwdZ = -Math.cos(aimAngle) * DUNK.carryOffsetZ;
        dunkTarget.mesh.position.set(
          dunkTarget.pos.x + fwdX,
          dunkTarget.pos.y,
          dunkTarget.pos.z + fwdZ
        );
      }

      // Face landing target
      if (toDist > 0.1) {
        playerGroup.rotation.y = Math.atan2(-toDx, -toDz);
      }
    }

    const groundHeight = getGroundHeight(playerPos.x, playerPos.z);
    if (playerPos.y <= groundHeight) {
      const fallSpeed = Math.abs(playerVelY);
      playerPos.y = groundHeight;
      playerVelY = 0;
      isPlayerAirborne = false;

      if (isSlamming) {
        // Self-slam landing — AoE damage + big impact
        isSlamming = false;
        landingLagTimer = SELF_SLAM.landingLag;
        screenShake(SELF_SLAM.landingShake);

        // AoE damage to nearby grounded enemies
        const enemies = gameState.enemies;
        if (enemies) {
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.health <= 0 || (e as any).fellInPit) continue;
            const dx = e.pos.x - playerPos.x;
            const dz = e.pos.z - playerPos.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < SELF_SLAM.damageRadius * SELF_SLAM.damageRadius) {
              e.health -= SELF_SLAM.damage;
              e.flashTimer = 100;
              // Knockback away from slam point
              const dist = Math.sqrt(distSq) || 0.1;
              const vel = (e as any).vel;
              if (vel) {
                vel.x += (dx / dist) * SELF_SLAM.knockback;
                vel.z += (dz / dist) * SELF_SLAM.knockback;
              }
            }
          }
        }

        emit({ type: 'playerSlam', position: { x: playerPos.x, z: playerPos.z }, fallSpeed });
        spawnDamageNumber(playerPos.x, playerPos.z, 'SLAM!', '#ff8800');
      } else if (isDunking && dunkTarget) {
        // Dunk landing — massive damage to grabbed enemy + AoE splash
        isDunking = false;
        removeDunkDecal();
        landingLagTimer = DUNK.landingLag;
        screenShake(DUNK.landingShake);

        // Primary damage to dunk target
        dunkTarget.health -= DUNK.damage;
        dunkTarget.flashTimer = 150;
        dunkTarget.pos.y = groundHeight; // slam to ground
        const tVel = (dunkTarget as any).vel;
        if (tVel) { tVel.x = 0; tVel.y = 0; tVel.z = 0; }
        (dunkTarget as any).mesh.position.copy(dunkTarget.pos);

        // AoE splash damage to other nearby enemies
        const enemies = gameState.enemies;
        if (enemies) {
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e === dunkTarget) continue;
            if (e.health <= 0 || (e as any).fellInPit) continue;
            const dx = e.pos.x - playerPos.x;
            const dz = e.pos.z - playerPos.z;
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

        emit({
          type: 'dunkImpact',
          enemy: dunkTarget,
          damage: DUNK.damage,
          position: { x: playerPos.x, z: playerPos.z },
        });
        spawnDamageNumber(playerPos.x, playerPos.z, 'DUNK!', '#ff2244');
        dunkTarget = null;
        startDunkTrailFade();
      } else {
        // Normal landing
        landingLagTimer = JUMP.landingLag;
        emit({ type: 'playerLand', position: { x: playerPos.x, z: playerPos.z }, fallSpeed });
      }

      // Clean up any pending dunk / float on any landing
      if (dunkPendingTarget || isFloating) {
        dunkPendingTarget = null;
        isFloating = false;
        floatTimer = 0;
        removeDunkDecal();
      }
    }
  }
  if (landingLagTimer > 0) {
    landingLagTimer -= dt * 1000;
  }

  // Tick dunk trail fade (after landing)
  if (dunkTrailLife > 0) {
    updateDunkTrailFade(dt * 1000);
  }

  playerGroup.position.copy(playerPos);

  // === AIM ===
  aimAtCursor(inputState);

  // === PROCEDURAL ANIMATION ===
  updateAnimation(
    rig.joints,
    animState,
    dt,
    { moveX: inputState.moveX, moveZ: inputState.moveZ },
    playerGroup.rotation.y,
    isDashing,
    endLagTimer > 0,
    isDashing ? Math.min(dashTimer / dashDuration, 1) : 0,
    meleeSwinging,
    meleeSwinging ? meleeSwingTimer / MELEE_SWING_DURATION : 0,
    isPlayerAirborne,
    playerVelY,
    isSlamming || isDunking,
    isCharging,
    isCharging ? Math.min(chargeTimer / ABILITIES.ultimate.chargeTimeMs, 1) : 0
  );

  // === MELEE COOLDOWN ===
  if (meleeCooldownTimer > 0) {
    meleeCooldownTimer -= dt * 1000;
  }

  // === MELEE SWING UPDATE ===
  if (meleeSwinging) {
    meleeSwingTimer += dt * 1000;
    if (meleeSwingTimer >= MELEE_SWING_DURATION) {
      meleeSwinging = false;
      meleeSwingTimer = 0;
    }
  }

  // === MELEE ATTACK (left click) ===
  if (inputState.attack && meleeCooldownTimer <= 0 && !isDashing && !isCharging) {

    if (isPlayerAirborne) {
      // ─── AERIAL STRIKE — downward spike on nearby enemy ───
      const enemies = gameState.enemies;
      let closestEnemy: any = null;
      let closestDistSq = AERIAL_STRIKE.range * AERIAL_STRIKE.range;
      if (enemies) {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e.health <= 0 || (e as any).fellInPit) continue;
          const dx = e.pos.x - playerPos.x;
          const dz = e.pos.z - playerPos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestEnemy = e;
          }
        }
      }

      if (closestEnemy) {
        // Deal enhanced damage
        closestEnemy.health -= AERIAL_STRIKE.damage;
        closestEnemy.flashTimer = 120;

        // Slam enemy downward
        const vel = (closestEnemy as any).vel;
        if (vel) vel.y = AERIAL_STRIKE.slamVelocity;

        // Face the target
        const dx = closestEnemy.pos.x - playerPos.x;
        const dz = closestEnemy.pos.z - playerPos.z;
        playerGroup.rotation.y = Math.atan2(-dx, -dz);

        // Screen shake + cooldown
        screenShake(AERIAL_STRIKE.screenShake);
        meleeCooldownTimer = AERIAL_STRIKE.cooldown;

        emit({
          type: 'aerialStrike',
          enemy: closestEnemy,
          damage: AERIAL_STRIKE.damage,
          position: { x: closestEnemy.pos.x, z: closestEnemy.pos.z },
        });
        spawnDamageNumber(closestEnemy.pos.x, closestEnemy.pos.z, 'SPIKE!', '#44ddff');
      } else {
        // No target — still do the swing animation in the air
        meleeSwinging = true;
        meleeSwingTimer = 0;
        meleeCooldownTimer = MELEE.cooldown;
        meleeHitEnemies.clear();
        meleeSwingDir = playerGroup.rotation.y;
        emit({
          type: 'meleeSwing',
          position: { x: playerPos.x, z: playerPos.z },
          direction: { x: -Math.sin(meleeSwingDir), z: -Math.cos(meleeSwingDir) },
        });
      }

    } else {
      // ─── GROUND MELEE — normal swing with auto-targeting ───
      const enemies = gameState.enemies;
      if (enemies) {
        let bestDist = MELEE.autoTargetRange * MELEE.autoTargetRange;
        let bestEnemy: any = null;
        const aimAngle = playerGroup.rotation.y;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e.health <= 0 || e.fellInPit) continue;
          const dx = e.pos.x - playerPos.x;
          const dz = e.pos.z - playerPos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq > bestDist) continue;
          const angleToEnemy = Math.atan2(-dx, -dz);
          let angleDiff = angleToEnemy - aimAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          if (Math.abs(angleDiff) <= MELEE.autoTargetArc / 2) {
            bestDist = distSq;
            bestEnemy = e;
          }
        }
        if (bestEnemy) {
          const dx = bestEnemy.pos.x - playerPos.x;
          const dz = bestEnemy.pos.z - playerPos.z;
          playerGroup.rotation.y = Math.atan2(-dx, -dz);
        }
      }

      meleeSwinging = true;
      meleeSwingTimer = 0;
      meleeCooldownTimer = MELEE.cooldown;
      meleeHitEnemies.clear();
      meleeSwingDir = playerGroup.rotation.y;

      emit({
        type: 'meleeSwing',
        position: { x: playerPos.x, z: playerPos.z },
        direction: { x: -Math.sin(meleeSwingDir), z: -Math.cos(meleeSwingDir) },
      });
    }
  }

  updateAfterimages(dt);
}

function aimAtCursor(inputState: any) {
  const dx = inputState.aimWorldPos.x - playerPos.x;
  const dz = inputState.aimWorldPos.z - playerPos.z;
  if (dx * dx + dz * dz > 0.01) {
    playerGroup.rotation.y = Math.atan2(-dx, -dz);
  }
}

// === DASH SYSTEM ===
function startDash(inputState: any, gameState: any) {
  const cfg = ABILITIES.dash;
  isDashing = true;
  dashTimer = 0;
  dashDuration = cfg.duration;
  dashDistance = cfg.distance;
  dashStartPos.copy(playerPos);

  // Direction source — drag-to-aim override takes priority (mobile buttons)
  const override = getAbilityDirOverride();
  const hasMovement = Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01;

  if (override) {
    dashDir.set(override.x, 0, override.z).normalize();
    clearAbilityDirOverride();
  } else if (cfg.directionSource === 'movement' && hasMovement) {
    dashDir.set(inputState.moveX, 0, inputState.moveZ).normalize();
  } else if (cfg.directionSource === 'aim') {
    dashDir.set(
      inputState.aimWorldPos.x - playerPos.x, 0,
      inputState.aimWorldPos.z - playerPos.z
    ).normalize();
  } else {
    // 'movementOrAim' or fallback
    if (hasMovement) {
      dashDir.set(inputState.moveX, 0, inputState.moveZ).normalize();
    } else {
      dashDir.set(
        inputState.aimWorldPos.x - playerPos.x, 0,
        inputState.aimWorldPos.z - playerPos.z
      ).normalize();
    }
  }

  gameState.abilities.dash.cooldownRemaining = cfg.cooldown;

  if (cfg.screenShakeOnStart > 0) {
    screenShake(cfg.screenShakeOnStart, 80);
  }

  emit({ type: 'playerDash', direction: { x: dashDir.x, z: dashDir.z }, position: { x: playerPos.x, z: playerPos.z } });
}

function updateDash(dt: number, gameState: any) {
  const cfg = ABILITIES.dash;
  dashTimer += dt * 1000;
  const t = Math.min(dashTimer / dashDuration, 1.0);

  // Easing
  let easedT: number;
  switch (cfg.curve) {
    case 'easeOut':   easedT = 1 - (1 - t) * (1 - t); break;
    case 'easeIn':    easedT = t * t; break;
    case 'easeInOut': easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; break;
    default:          easedT = t;
  }

  // Position along dash path
  playerPos.copy(dashStartPos);
  playerPos.x += dashDir.x * dashDistance * easedT;
  playerPos.z += dashDir.z * dashDistance * easedT;

  // Arena clamp during dash — dynamic per room size
  const dashClampX = ARENA_HALF_X - 0.5;
  const dashClampZ = ARENA_HALF_Z - 0.5;
  playerPos.x = Math.max(-dashClampX, Math.min(dashClampX, playerPos.x));
  playerPos.z = Math.max(-dashClampZ, Math.min(dashClampZ, playerPos.z));

  // I-frame window
  isInvincible = cfg.invincible && (dashTimer >= cfg.iFrameStart && dashTimer <= cfg.iFrameEnd);

  // Spawn afterimages at intervals
  if (cfg.afterimageCount > 0) {
    const interval = dashDuration / (cfg.afterimageCount + 1);
    const prevCount = Math.floor((dashTimer - dt * 1000) / interval);
    const currCount = Math.floor(dashTimer / interval);
    if (currCount > prevCount) {
      spawnAfterimage(cfg);
    }
  }

  // End dash
  if (t >= 1.0) {
    isDashing = false;
    isInvincible = false;
    endLagTimer = cfg.endLag;
    emit({ type: 'playerDashEnd' });
  }
}

function spawnAfterimage(cfg: any) {
  const scene = getScene();
  const ghost = new THREE.Group();

  // Update world matrices so we can sample joint positions
  playerGroup.updateMatrixWorld(true);

  // Simplified ghost — torso + head silhouettes from rig world positions
  const geos = getGhostGeometries();
  const ghostMat = new THREE.MeshBasicMaterial({
    color: cfg.ghostColor,
    transparent: true,
    opacity: 0.5,
  });

  // Torso ghost at rig torso's world position
  const torsoWorld = new THREE.Vector3();
  rig.joints.torso.getWorldPosition(torsoWorld);
  const ghostTorso = new THREE.Mesh(geos.torso, ghostMat.clone());
  ghostTorso.position.copy(torsoWorld).sub(playerPos);
  ghost.add(ghostTorso);

  // Head ghost at rig head's world position
  const headWorld = new THREE.Vector3();
  rig.joints.head.getWorldPosition(headWorld);
  const ghostHead = new THREE.Mesh(geos.head, ghostMat.clone());
  ghostHead.position.copy(headWorld).sub(playerPos);
  ghost.add(ghostHead);

  ghost.position.copy(playerPos);
  ghost.rotation.y = playerGroup.rotation.y;
  scene.add(ghost);

  afterimages.push({ mesh: ghost, life: 0, maxLife: cfg.afterimageFadeDuration });
}

function updateAfterimages(dt: number) {
  const scene = getScene();
  for (let i = afterimages.length - 1; i >= 0; i--) {
    const ai = afterimages[i];
    ai.life += dt * 1000;
    const fade = Math.max(0, 1 - ai.life / ai.maxLife);

    ai.mesh.children.forEach((child: any) => {
      if (child.material) child.material.opacity = fade * 0.5;
    });

    if (ai.life >= ai.maxLife) {
      scene.remove(ai.mesh);
      afterimages.splice(i, 1);
    }
  }
}

// === CHARGE PUSH SYSTEM ===
function startCharge(inputState: any, gameState: any) {
  const cfg = ABILITIES.ultimate;
  isCharging = true;
  chargeTimer = 0;
  gameState.abilities.ultimate.charging = true;
  gameState.abilities.ultimate.chargeT = 0;

  // Calculate initial aim angle toward cursor
  // atan2(dx, dz) so that sin(angle)=dx/len, cos(angle)=dz/len -> local +Z extends toward cursor
  const dx = inputState.aimWorldPos.x - playerPos.x;
  const dz = inputState.aimWorldPos.z - playerPos.z;
  chargeAimAngle = Math.atan2(dx, dz);

  // Create telegraph visual
  createChargeTelegraph(cfg);

  // Visual feedback — player glows while charging
  for (const mat of rig.materials) {
    mat.emissive.setHex(0x44ffaa);
    mat.emissiveIntensity = 0.6;
  }
}

function createChargeTelegraph(cfg: any) {
  const scene = getScene();

  chargeTelegraphGroup = new THREE.Group();
  chargeTelegraphGroup.position.set(playerPos.x, 0.05, playerPos.z);
  chargeTelegraphGroup.rotation.y = chargeAimAngle;

  // Fill plane (unit plane, scaled each frame)
  const fillGeo = new THREE.PlaneGeometry(1, 1);
  fillGeo.rotateX(-Math.PI / 2);
  const fillMat = new THREE.MeshBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: cfg.telegraphOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  chargeFillMesh = new THREE.Mesh(fillGeo, fillMat);
  // Position fill to start from player (offset by half minLength)
  const halfLen = cfg.minLength / 2;
  chargeFillMesh.scale.set(cfg.width, 1, cfg.minLength);
  chargeFillMesh.position.set(0, 0, halfLen);
  chargeTelegraphGroup.add(chargeFillMesh);

  // Border — edges of a unit-sized plane, scaled each frame
  const basePlane = new THREE.PlaneGeometry(1, 1);
  const borderGeo = new THREE.EdgesGeometry(basePlane);
  borderGeo.rotateX(-Math.PI / 2);
  const borderMat = new THREE.LineBasicMaterial({
    color: cfg.color,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  chargeBorderMesh = new THREE.LineSegments(borderGeo, borderMat);
  chargeBorderGeo = borderGeo;
  chargeBorderMesh.scale.set(cfg.width, 1, cfg.minLength);
  chargeBorderMesh.position.set(0, 0, halfLen);
  chargeTelegraphGroup.add(chargeBorderMesh);

  scene.add(chargeTelegraphGroup);
}

function updateCharge(inputState: any, dt: number, gameState: any) {
  const cfg = ABILITIES.ultimate;
  chargeTimer += dt * 1000;
  const chargeT = Math.min(chargeTimer / cfg.chargeTimeMs, 1);
  gameState.abilities.ultimate.chargeT = chargeT;

  // Update aim angle from cursor
  const dx = inputState.aimWorldPos.x - playerPos.x;
  const dz = inputState.aimWorldPos.z - playerPos.z;
  if (dx * dx + dz * dz > 0.01) {
    chargeAimAngle = Math.atan2(dx, dz);
  }

  // Calculate current rect length
  const currentLength = cfg.minLength + (cfg.maxLength - cfg.minLength) * chargeT;

  // Update telegraph position and rotation
  if (chargeTelegraphGroup) {
    chargeTelegraphGroup.position.set(playerPos.x, 0.05, playerPos.z);
    chargeTelegraphGroup.rotation.y = chargeAimAngle;

    // Offset fill and border so the rect starts at the player and extends forward
    const halfLen = currentLength / 2;

    // Scale fill (unit plane scaled to desired size)
    chargeFillMesh.scale.set(cfg.width, 1, currentLength);
    chargeFillMesh.position.set(0, 0, halfLen);

    // Scale border (unit-sized EdgesGeometry, scale to desired size)
    chargeBorderMesh.scale.set(cfg.width, 1, currentLength);
    chargeBorderMesh.position.set(0, 0, halfLen);

    // Pulse border opacity
    const pulse = 0.6 + 0.3 * Math.sin(performance.now() * 0.008);
    chargeBorderMesh.material.opacity = pulse;

    // Fill gets brighter as charge increases
    chargeFillMesh.material.opacity = cfg.telegraphOpacity + chargeT * 0.2;
  }

  // Player glow intensifies with charge
  for (const mat of rig.materials) {
    mat.emissiveIntensity = 0.6 + chargeT * 0.4;
  }

  // Auto-fire at max charge OR release key (100ms grace period prevents instant-fire)
  if (chargeT >= 1 || (chargeTimer > 100 && !inputState.ultimateHeld)) {
    fireChargePush(chargeT, gameState);
  }
}

function fireChargePush(chargeT: number, gameState: any) {
  const cfg = ABILITIES.ultimate;
  const currentLength = cfg.minLength + (cfg.maxLength - cfg.minLength) * chargeT;
  const force = cfg.minKnockback + (cfg.maxKnockback - cfg.minKnockback) * chargeT;

  // Rectangle center = player position + half length toward cursor
  // chargeAimAngle = atan2(dx, dz), so sin(angle) = dx/len, cos(angle) = dz/len -> toward cursor
  const halfLen = currentLength / 2;
  const dirX = Math.sin(chargeAimAngle);
  const dirZ = Math.cos(chargeAimAngle);
  const centerX = playerPos.x + dirX * halfLen;
  const centerZ = playerPos.z + dirZ * halfLen;

  // Emit push event for physics
  pushEvent = {
    x: centerX,
    z: centerZ,
    width: cfg.width,
    length: currentLength,
    rotation: chargeAimAngle,
    force: force,
    dirX: dirX,
    dirZ: dirZ,
  };

  // Clean up telegraph
  removeChargeTelegraph();

  // Reset charge state
  isCharging = false;
  gameState.abilities.ultimate.charging = false;
  gameState.abilities.ultimate.chargeT = 0;
  gameState.abilities.ultimate.cooldownRemaining = cfg.cooldown;

  // Restore player visuals
  restoreDefaultEmissive();

  // Screen shake scales with charge
  screenShake(2 + chargeT * 3, 120);

  emit({ type: 'chargeFired', chargeT, direction: { x: dirX, z: dirZ }, position: { x: playerPos.x, z: playerPos.z } });
}

function removeChargeTelegraph() {
  if (chargeTelegraphGroup) {
    const scene = getScene();
    // Dispose materials and geometries
    if (chargeFillMesh) {
      chargeFillMesh.material.dispose();
      chargeFillMesh.geometry.dispose();
    }
    if (chargeBorderMesh) {
      chargeBorderMesh.material.dispose();
      if (chargeBorderGeo) chargeBorderGeo.dispose();
    }
    scene.remove(chargeTelegraphGroup);
    chargeTelegraphGroup = null;
    chargeFillMesh = null;
    chargeBorderMesh = null;
    chargeBorderGeo = null;
  }
}

// === DUNK TARGET DECAL ===

function createDunkDecal(cx: number, cz: number) {
  const scene = getScene();
  const radius = DUNK.targetRadius;

  dunkDecalGroup = new THREE.Group();
  dunkDecalGroup.position.set(cx, 0.06, cz);

  // Filled circle — semi-transparent magenta
  const fillGeo = new THREE.CircleGeometry(radius, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xff44ff,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  });
  dunkDecalFill = new THREE.Mesh(fillGeo, fillMat);
  dunkDecalFill.rotation.x = -Math.PI / 2; // lay flat on ground
  dunkDecalGroup.add(dunkDecalFill);

  // Outer ring — brighter border
  const ringGeo = new THREE.RingGeometry(radius - 0.06, radius, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff66ff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  dunkDecalRing = new THREE.Mesh(ringGeo, ringMat);
  dunkDecalRing.rotation.x = -Math.PI / 2;
  dunkDecalGroup.add(dunkDecalRing);

  // Crosshair — sized to match AoE splash radius so player sees the impact zone
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
  dunkDecalGroup.add(dot);

  // Start at scale 0 — will expand over DECAL_EXPAND_MS
  dunkDecalGroup.scale.set(0, 0, 0);
  dunkDecalAge = 0;

  scene.add(dunkDecalGroup);
}

function updateDunkDecal(aimX: number, aimZ: number, dt?: number) {
  if (!dunkDecalGroup) return;

  // Expand animation — ease-out from 0 to 1 over DECAL_EXPAND_MS
  if (dt && dunkDecalAge < DECAL_EXPAND_MS) {
    dunkDecalAge += dt * 1000;
    const t = Math.min(dunkDecalAge / DECAL_EXPAND_MS, 1);
    const eased = 1 - (1 - t) * (1 - t); // ease-out quadratic
    dunkDecalGroup.scale.set(eased, eased, eased);
  } else if (dunkDecalGroup.scale.x < 1) {
    dunkDecalGroup.scale.set(1, 1, 1);
  }

  // Decal stays centered on player position
  dunkDecalGroup.position.set(dunkOriginX, 0.06, dunkOriginZ);

  // Move crosshair dot to show landing target (relative to decal center)
  const dot = dunkDecalGroup.getObjectByName('dunkCrosshair');
  if (dot) {
    const dx = dunkLandingX - dunkOriginX;
    const dz = dunkLandingZ - dunkOriginZ;
    dot.position.set(dx, 0, dz); // offset in group-local space (group is not rotated)
  }

  // Pulse ring opacity for urgency
  if (dunkDecalRing) {
    const pulse = 0.3 + 0.15 * Math.sin(Date.now() * 0.008);
    (dunkDecalRing.material as any).opacity = pulse;
  }
}

function removeDunkDecal() {
  if (!dunkDecalGroup) return;
  const scene = getScene();

  // Dispose all children
  dunkDecalGroup.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });

  scene.remove(dunkDecalGroup);
  dunkDecalGroup = null;
  dunkDecalFill = null;
  dunkDecalRing = null;
}

// === DUNK TRAIL ===

function createDunkTrail() {
  removeDunkTrail();
  const geo = new THREE.BufferGeometry();
  // Pre-allocate for max points
  const positions = new Float32Array(DUNK_TRAIL_MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);

  const mat = new THREE.LineBasicMaterial({
    color: 0xff66ff,
    transparent: true,
    opacity: 0.7,
    linewidth: 1,
  });
  dunkTrailLine = new THREE.Line(geo, mat);
  dunkTrailLine.frustumCulled = false;
  getScene().add(dunkTrailLine);
  dunkTrailLife = 0;
}

function updateDunkTrail() {
  if (!dunkTrailLine) return;
  const posAttr = dunkTrailLine.geometry.getAttribute('position');
  const arr = posAttr.array;
  for (let i = 0; i < dunkTrailPoints.length; i++) {
    const p = dunkTrailPoints[i];
    arr[i * 3] = p.x;
    arr[i * 3 + 1] = p.y;
    arr[i * 3 + 2] = p.z;
  }
  posAttr.needsUpdate = true;
  dunkTrailLine.geometry.setDrawRange(0, dunkTrailPoints.length);
}

function startDunkTrailFade() {
  dunkTrailLife = 300; // ms to fade out after landing
}

function updateDunkTrailFade(dtMs: number) {
  if (!dunkTrailLine || dunkTrailLife <= 0) return;
  dunkTrailLife -= dtMs;
  const opacity = Math.max(0, dunkTrailLife / 300) * 0.7;
  (dunkTrailLine.material as any).opacity = opacity;
  if (dunkTrailLife <= 0) {
    removeDunkTrail();
  }
}

function removeDunkTrail() {
  if (!dunkTrailLine) return;
  const scene = getScene();
  scene.remove(dunkTrailLine);
  if (dunkTrailLine.geometry) dunkTrailLine.geometry.dispose();
  if (dunkTrailLine.material) dunkTrailLine.material.dispose();
  dunkTrailLine = null;
  dunkTrailPoints = [];
  dunkTrailLife = 0;
}

// === MELEE PUBLIC API ===
export function isMeleeSwinging() { return meleeSwinging; }
export function getMeleeSwingDir() { return meleeSwingDir; }
export function getMeleeHitEnemies() { return meleeHitEnemies; }

// === PUBLIC API ===
export function getPlayerPos() { return playerPos; }
export function getPlayerGroup() { return playerGroup; }
export function isPlayerInvincible() { return isInvincible; }
export function isPlayerDashing() { return isDashing; }
export function getIsPlayerAirborne() { return isPlayerAirborne; }
export function getPlayerVelY() { return playerVelY; }
export function getDunkPendingTarget() { return dunkPendingTarget; }
export function getIsFloating() { return isFloating; }
export function consumePushEvent() {
  const evt = pushEvent;
  pushEvent = null;
  return evt;
}

export function resetPlayer() {
  playerPos.set(0, 0, 0);
  playerGroup.position.set(0, 0, 0);
  playerGroup.rotation.y = 0;
  isDashing = false;
  isInvincible = false;
  endLagTimer = 0;
  meleeSwinging = false;
  meleeCooldownTimer = 0;
  meleeSwingTimer = 0;
  meleeHitEnemies.clear();
  isCharging = false;
  chargeTimer = 0;
  pushEvent = null;
  playerVelY = 0;
  isPlayerAirborne = false;
  landingLagTimer = 0;
  launchCooldownTimer = 0;
  isSlamming = false;
  isDunking = false;
  dunkTarget = null;
  dunkPendingTarget = null;
  isFloating = false;
  floatTimer = 0;
  removeDunkDecal();
  removeDunkTrail();
  removeChargeTelegraph();
  restoreDefaultEmissive();
  resetAnimatorState(animState);

  // Clean up afterimages
  const scene = getScene();
  for (const ai of afterimages) {
    scene.remove(ai.mesh);
  }
  afterimages.length = 0;
}

export function setPlayerPosition(x: number, z: number) {
  playerPos.set(x, 0, z);
  playerGroup.position.set(x, 0, z);
}
