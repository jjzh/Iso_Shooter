import { ENEMY_TYPES, MOB_GLOBAL } from '../config/enemies';
import { getCollisionBounds, getPitBounds } from '../config/arena';
import { getGroundHeight } from '../config/terrain';
import { applyAoeEffect } from '../engine/aoeTelegraph';
import { getPlayerPos, isPlayerInvincible } from './player';
import { screenShake } from '../engine/renderer';
import { spawnDamageNumber } from '../ui/damageNumbers';
import { fireMortarProjectile, getIceEffects } from './mortarProjectile';
import { fireProjectile } from './projectile';
import { buildEnemyModel, createHitReaction, triggerHitReaction, updateHitReaction } from './enemyRig';
import { emit } from '../engine/events';

let sceneRef: any;

// Shared shield geometry (created once)
let shieldGeo: any;

// Shared mortar fill circle geometry
let _mortarFillGeoShared: any = null;

// Shared death telegraph fill geometry
let _deathFillGeoShared: any = null;

export function initEnemySystem(scene: any) {
  sceneRef = scene;
}

function createShieldMesh(cfg: any) {
  const shieldCfg = cfg.shield;
  const radius = cfg.size.radius * 1.8;
  if (!shieldGeo) shieldGeo = new THREE.SphereGeometry(1, 16, 12); // unit sphere, scaled per enemy
  const mat = new THREE.MeshStandardMaterial({
    color: shieldCfg.color || 0x88eeff,
    emissive: shieldCfg.emissive || 0x44ccff,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: shieldCfg.opacity || 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(shieldGeo, mat);
  mesh.scale.set(radius, radius, radius);
  return mesh;
}

export function spawnEnemy(typeName: string, position: any, gameState: any) {
  const cfg = ENEMY_TYPES[typeName];
  if (!cfg) return null;

  const group = new THREE.Group();

  // Build distinctive silhouette from primitives
  const model = buildEnemyModel(typeName, cfg, group);
  const bodyMesh = model.bodyMesh;
  const headMesh = model.headMesh;

  group.position.copy(position);
  sceneRef.add(group);

  const enemy: any = {
    mesh: group,
    bodyMesh,
    headMesh,
    type: typeName,
    config: cfg,
    health: cfg.health,
    pos: position.clone(),
    behavior: cfg.behavior,
    lastAttackTime: 0,
    flashTimer: 0,
    stunTimer: 0,
    // Tank-specific
    chargeTimer: 0,
    chargeCooldown: 4000,
    isCharging: false,
    chargeDir: new THREE.Vector3(),
    // Shield
    shieldHealth: 0,
    shieldActive: false,
    shieldMesh: null as any,
    // Slow debuff
    slowTimer: 0,
    slowMult: 1,               // speed multiplier while slowed (e.g., 0.5 = half speed)
    // Sniper (kite behavior)
    sniperPhase: 'idle',       // 'idle' | 'telegraphing' | 'cooldown'
    sniperTimer: 0,
    sniperAimAngle: 0,         // locked aim direction (radians)
    sniperAimCenter: { x: 0, z: 0 }, // center of the damage rect
    // Mortar
    mortarPhase: 'idle',       // 'idle' | 'aiming' | 'cooldown'
    mortarTimer: 0,
    mortarTarget: { x: 0, z: 0 }, // aimed landing position
    mortarArcLine: null as any,       // THREE.Line for aim arc preview
    mortarGroundCircle: null as any,  // THREE.Mesh for persistent ground circle
    // Physics velocity (knockback system)
    vel: { x: 0, y: 0, z: 0 },      // knockback velocity — integrated by applyVelocities()
    // Pit / edge-slide
    wasDeflected: false,       // true when movement was deflected by collision (edge-sliding)
    fellInPit: false,          // true when killed by falling into a pit
    // Pit leap (goblins)
    pitEdgeTimer: 0,           // ms spent hugging a pit edge (wasDeflected near pit)
    isLeaping: false,          // true during arc leap over pit
    leapElapsed: 0,            // time into leap
    leapDuration: 0,           // total flight time
    leapStartX: 0,
    leapStartZ: 0,
    leapTargetX: 0,
    leapTargetZ: 0,
    leapArcHeight: 0,
    leapCooldown: 0,           // ms until next leap allowed
    // Melee attack state machine (for enemies with config.melee)
    meleePhase: 'idle' as 'idle' | 'telegraph' | 'attacking' | 'recovery',
    meleeTimer: 0,
    meleeHasHit: false,       // prevent double-hit per attack cycle
    // Hit reaction (squash/bounce)
    hitReaction: createHitReaction(),
    allMaterials: model.allMaterials,
  };

  // Initialize shield if config has one
  if (cfg.shield && cfg.shield.maxHealth > 0) {
    enemy.shieldHealth = cfg.shield.maxHealth;
    enemy.shieldActive = true;
    enemy.shieldMesh = createShieldMesh(cfg);
    enemy.shieldMesh.position.y = cfg.size.height * 0.5;
    group.add(enemy.shieldMesh);
  }

  gameState.enemies.push(enemy);
  return enemy;
}

export function spawnTestGroup(gameState: any) {
  // Larger group for longer sessions
  const spawns = [
    // Goblins — scattered around arena
    { type: 'goblin', x: 10, z: 5 },
    { type: 'goblin', x: -8, z: 7 },
    { type: 'goblin', x: 5, z: -10 },
    { type: 'goblin', x: -12, z: -3 },
    { type: 'goblin', x: 15, z: 0 },
    { type: 'goblin', x: -5, z: 12 },
    { type: 'goblin', x: -15, z: 8 },
    { type: 'goblin', x: 8, z: -15 },
    { type: 'goblin', x: -3, z: -14 },
    { type: 'goblin', x: 14, z: 10 },
    { type: 'goblin', x: -10, z: -10 },
    { type: 'goblin', x: 16, z: -8 },
    // Archers — positioned at range
    { type: 'skeletonArcher', x: 12, z: 12 },
    { type: 'skeletonArcher', x: -12, z: -12 },
    { type: 'skeletonArcher', x: -14, z: 10 },
    { type: 'skeletonArcher', x: 14, z: -10 },
    { type: 'skeletonArcher', x: 0, z: -16 },
    // Mortar Imps — lobbed AoE
    { type: 'iceMortarImp', x: 10, z: -14 },
    { type: 'iceMortarImp', x: -10, z: 14 },
    { type: 'iceMortarImp', x: -16, z: -10 },
    // Golems — fewer but threatening
    { type: 'stoneGolem', x: 0, z: 15 },
    { type: 'stoneGolem', x: -15, z: -5 },
    { type: 'stoneGolem', x: 15, z: -5 },
  ];

  for (const s of spawns) {
    spawnEnemy(s.type, new THREE.Vector3(s.x, 0, s.z), gameState);
  }
}

// Reusable vector for calculations
const _toPlayer = new THREE.Vector3();

// Cached collision bounds (loaded once)
let _collisionBounds: any = null;
let _pitBoundsCache: any = null;

/**
 * Check if position (x,z) is inside any pit (with margin).
 * Returns the pit AABB if inside, or null.
 */
function pitAt(x: number, z: number, margin: number) {
  if (!_pitBoundsCache) _pitBoundsCache = getPitBounds();
  for (const pit of _pitBoundsCache) {
    if (x > pit.minX - margin && x < pit.maxX + margin &&
        z > pit.minZ - margin && z < pit.maxZ + margin) {
      return pit;
    }
  }
  return null;
}

/**
 * Pit-aware movement: given a desired movement direction (dx, dz — normalized),
 * check if a lookahead step would enter a pit. If so, deflect the direction
 * sideways (perpendicular to the original direction, choosing the side away
 * from the pit center). Returns adjusted { dx, dz }.
 */
function pitAwareDir(x: number, z: number, dx: number, dz: number, lookahead: number) {
  const ahead = pitAt(x + dx * lookahead, z + dz * lookahead, 0.5);
  if (!ahead) return { dx, dz }; // no pit ahead — go straight

  // Pit center
  const pcx = (ahead.minX + ahead.maxX) / 2;
  const pcz = (ahead.minZ + ahead.maxZ) / 2;

  // Two perpendicular options: rotate +/-90deg
  // Option A: (dz, -dx)   Option B: (-dz, dx)
  // Pick the one whose lookahead is further from pit center
  const ax = x + dz * lookahead, az = z + (-dx) * lookahead;
  const bx = x + (-dz) * lookahead, bz = z + dx * lookahead;
  const distA = (ax - pcx) * (ax - pcx) + (az - pcz) * (az - pcz);
  const distB = (bx - pcx) * (bx - pcx) + (bz - pcz) * (bz - pcz);

  // Also verify the chosen strafe doesn't land in another pit
  if (distA >= distB) {
    if (!pitAt(ax, az, 0.5)) return { dx: dz, dz: -dx };
    if (!pitAt(bx, bz, 0.5)) return { dx: -dz, dz: dx };
  } else {
    if (!pitAt(bx, bz, 0.5)) return { dx: -dz, dz: dx };
    if (!pitAt(ax, az, 0.5)) return { dx: dz, dz: -dx };
  }

  // Both sides blocked — stop moving (better than walking into a pit)
  return { dx: 0, dz: 0 };
}

/**
 * Raycast from (ox, oz) in direction (dx, dz) and find distance to first AABB hit.
 * Returns the distance, or maxDist if nothing is hit.
 * Uses slab method for ray-AABB intersection on the XZ plane.
 */
function raycastTerrainDist(ox: number, oz: number, dx: number, dz: number, maxDist: number) {
  if (!_collisionBounds) _collisionBounds = getCollisionBounds();

  let closest = maxDist;

  for (const box of _collisionBounds) {
    // Slab method on X axis
    let tmin: number, tmax: number;
    if (Math.abs(dx) < 1e-8) {
      // Ray parallel to X — check if origin is within X slab
      if (ox < box.minX || ox > box.maxX) continue;
      tmin = -Infinity;
      tmax = Infinity;
    } else {
      const invDx = 1 / dx;
      let t1 = (box.minX - ox) * invDx;
      let t2 = (box.maxX - ox) * invDx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = t1;
      tmax = t2;
    }

    // Slab method on Z axis
    if (Math.abs(dz) < 1e-8) {
      if (oz < box.minZ || oz > box.maxZ) continue;
      // tmin/tmax unchanged
    } else {
      const invDz = 1 / dz;
      let t1 = (box.minZ - oz) * invDz;
      let t2 = (box.maxZ - oz) * invDz;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    // Check valid intersection
    if (tmax < 0 || tmin > tmax) continue; // behind ray or no intersection
    const t = tmin > 0 ? tmin : tmax; // entry point (or exit if starting inside)
    if (t > 0 && t < closest) {
      closest = t;
    }
  }

  return closest;
}

export function updateEnemies(dt: number, playerPos: any, gameState: any) {
  for (let i = gameState.enemies.length - 1; i >= 0; i--) {
    const enemy = gameState.enemies[i];

    // Pit leap update — runs independently of stun (can't stun mid-air)
    if (enemy.isLeaping) {
      updateLeap(enemy, dt);
      // Skip normal behavior/movement but still check death below
    } else if (enemy.stunTimer > 0) {
      // Stun check — stunned enemies cannot move or attack
      enemy.stunTimer -= dt * 1000;
    } else {
      // Behavior dispatch (only when not stunned)
      switch (enemy.behavior) {
        case 'rush': behaviorRush(enemy, playerPos, dt, gameState); break;
        case 'kite': behaviorKite(enemy, playerPos, dt, gameState); break;
        case 'tank': behaviorTank(enemy, playerPos, dt, gameState); break;
        case 'mortar': behaviorMortar(enemy, playerPos, dt, gameState); break;
      }
    }

    // Arena clamp
    enemy.pos.x = Math.max(-19, Math.min(19, enemy.pos.x));
    enemy.pos.z = Math.max(-19, Math.min(19, enemy.pos.z));

    // Ledge fall — if grounded enemy walks off platform edge, start falling
    if (!enemy.isLeaping) {
      const groundBelow = getGroundHeight(enemy.pos.x, enemy.pos.z);
      if (enemy.pos.y > groundBelow + 0.05) {
        // Ground dropped out — gravity will pull them down in applyVelocities
        const vel = (enemy as any).vel;
        if (vel && vel.y === 0) vel.y = 0; // ensure Y vel exists, gravity handles the rest
      }
    }

    if (enemy.isLeaping) {
      // Sync clamped XZ but preserve arc Y set by updateLeap
      enemy.mesh.position.x = enemy.pos.x;
      enemy.mesh.position.z = enemy.pos.z;
    } else {
      enemy.mesh.position.copy(enemy.pos);
    }

    // Airborne visual — tumble rotation when launched/falling
    const groundBelowEnemy = getGroundHeight(enemy.pos.x, enemy.pos.z);
    const enemyAirborne = enemy.pos.y > groundBelowEnemy + 0.15 && !enemy.isLeaping;
    if (enemyAirborne) {
      // Accumulate tumble rotation — fast spin that looks like they were popped up
      if (!enemy._tumbleAngle) enemy._tumbleAngle = 0;
      enemy._tumbleAngle += dt * 12; // ~2 full rotations per second
      enemy.mesh.rotation.x = Math.sin(enemy._tumbleAngle) * 0.4;
      enemy.mesh.rotation.z = Math.cos(enemy._tumbleAngle * 0.7) * 0.3;
      // Squash/stretch based on vertical velocity
      const vy = enemy.vel ? enemy.vel.y : 0;
      if (vy > 2) {
        // Rising — stretch vertically
        enemy.mesh.scale.set(0.9, 1.15, 0.9);
      } else if (vy < -2) {
        // Falling — compress vertically
        enemy.mesh.scale.set(1.1, 0.85, 1.1);
      } else {
        enemy.mesh.scale.set(1, 1, 1);
      }
    } else {
      // On ground — reset tumble
      if (enemy._tumbleAngle) {
        enemy._tumbleAngle = 0;
        enemy.mesh.rotation.x = 0;
        enemy.mesh.rotation.z = 0;
        enemy.mesh.scale.set(1, 1, 1);
      }
    }

    // Flash timer (hit feedback)
    if (enemy.flashTimer > 0) {
      enemy.flashTimer -= dt * 1000;
      if (enemy.flashTimer <= 0) {
        enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
      }
    }

    // Hit reaction (squash/bounce)
    if (enemy.hitReaction && enemy.hitReaction.active) {
      updateHitReaction(enemy.hitReaction, enemy.mesh, dt);
    }

    // Slow debuff timer
    if (enemy.slowTimer > 0) {
      enemy.slowTimer -= dt * 1000;
      if (enemy.slowTimer <= 0) {
        enemy.slowTimer = 0;
        enemy.slowMult = 1;
      }
    }

    // Shield durability visual feedback
    if (enemy.shieldActive && enemy.shieldMesh) {
      const shieldCfg = enemy.config.shield;
      const ratio = enemy.shieldHealth / shieldCfg.maxHealth; // 1.0 = full, 0.0 = broken

      const baseOpacity = shieldCfg.opacity || 0.35;

      // Opacity fades as shield depletes
      let opacity = baseOpacity * (0.3 + 0.7 * ratio); // never fully invisible while active

      // Color shifts cyan -> red as shield weakens
      const r = Math.round(0x44 + (0xff - 0x44) * (1 - ratio));
      const g = Math.round(0xcc * ratio);
      const b = Math.round(0xff * ratio);
      enemy.shieldMesh.material.emissive.setRGB(r / 255, g / 255, b / 255);

      // Flicker when below 25%
      if (ratio < 0.25) {
        const flicker = 0.5 + 0.5 * Math.sin(performance.now() * 0.06); // ~10Hz
        opacity *= (0.5 + 0.5 * flicker);
      } else {
        // Gentle pulse when healthy
        opacity += 0.05 * Math.sin(performance.now() * 0.003);
      }

      enemy.shieldMesh.material.opacity = Math.max(0.05, opacity);
    }

    // Death telegraph countdown (golem detonation delay)
    if (enemy.deathTimer > 0) {
      enemy.deathTimer -= dt * 1000;
      updateDeathTelegraph(enemy, dt);

      // Sync mesh position (enemy can be pushed by Force Push during telegraph)
      enemy.mesh.position.copy(enemy.pos);

      // If pushed into a pit during telegraph, cancel explosion and remove immediately
      if (enemy.fellInPit) {
        removeDeathTelegraph(enemy);
        if (enemy.shieldMesh) {
          enemy.shieldMesh.geometry.dispose();
          enemy.shieldMesh.material.dispose();
        }
        removeMortarArcLine(enemy);
        removeMortarGroundCircle(enemy);
        sceneRef.remove(enemy.mesh);
        gameState.enemies.splice(i, 1);
        const drops = enemy.config.drops;
        gameState.currency += Math.floor(
          drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
        );
        continue;
      }

      if (enemy.deathTimer <= 0) {
        // Telegraph expired — detonate at CURRENT position (may have been pushed)
        if (enemy.config.deathExplosion && !enemy.fellInPit) {
          onDeathExplosion(enemy, gameState);
        }
        removeDeathTelegraph(enemy);

        // Clean up shield mesh
        if (enemy.shieldMesh) {
          enemy.shieldMesh.geometry.dispose();
          enemy.shieldMesh.material.dispose();
        }
        removeMortarArcLine(enemy);
        removeMortarGroundCircle(enemy);
        sceneRef.remove(enemy.mesh);
        gameState.enemies.splice(i, 1);
        const drops = enemy.config.drops;
        gameState.currency += Math.floor(
          drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
        );
      }
      continue; // Skip normal death check while telegraph is active
    }

    // Death
    if (enemy.health <= 0) {
      const deathCfg = enemy.config.deathExplosion;

      // If this enemy has a telegraph duration, defer the explosion
      if (deathCfg && deathCfg.telegraphDuration && !enemy.fellInPit) {
        enemy.deathTimer = deathCfg.telegraphDuration;
        enemy.stunTimer = deathCfg.telegraphDuration + 100; // keep stunned through telegraph
        createDeathTelegraph(enemy);
        continue;
      }

      // Immediate death (no telegraph) — AoE damage to nearby units (skip if fell in pit)
      if (deathCfg && !enemy.fellInPit) {
        onDeathExplosion(enemy, gameState);
      }

      emit({ type: 'enemyDied', enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });

      // Clean up shield mesh
      if (enemy.shieldMesh) {
        enemy.shieldMesh.geometry.dispose();
        enemy.shieldMesh.material.dispose();
      }
      // Clean up mortar visuals
      removeMortarArcLine(enemy);
      removeMortarGroundCircle(enemy);
      sceneRef.remove(enemy.mesh);
      gameState.enemies.splice(i, 1);
      // Currency drop
      const drops = enemy.config.drops;
      gameState.currency += Math.floor(
        drops.currency.min + Math.random() * (drops.currency.max - drops.currency.min + 1)
      );
    }
  }
}

// ─── Enemy Melee State Machine ───
// Shared telegraph → attack → recovery flow for enemies with config.melee

function startEnemyMelee(enemy: any) {
  const meleeCfg = enemy.config.melee;
  if (!meleeCfg) return;
  const telegraphDur = meleeCfg.telegraphDuration * MOB_GLOBAL.telegraphMult;
  enemy.meleePhase = 'telegraph';
  enemy.meleeTimer = telegraphDur;
  enemy.meleeHasHit = false;
  // Flash emissive to signal telegraph
  enemy.flashTimer = telegraphDur;
  enemy.bodyMesh.material.emissive.setHex(0xffaa00);
  if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(0xffaa00);

  // Emit telegraph event for ground arc decal
  emit({
    type: 'enemyMeleeTelegraph',
    position: { x: enemy.pos.x, z: enemy.pos.z },
    facingAngle: enemy.mesh.rotation.y,
    hitArc: meleeCfg.hitArc,
    hitRange: meleeCfg.hitRange,
    duration: telegraphDur + meleeCfg.attackDuration,  // visible through telegraph + attack
  });
}

function updateEnemyMelee(enemy: any, dt: number, playerPos: any, gameState: any) {
  const meleeCfg = enemy.config.melee;
  if (!meleeCfg || enemy.meleePhase === 'idle') return;

  enemy.meleeTimer -= dt * 1000;

  if (enemy.meleePhase === 'telegraph') {
    // Pulsing emissive during telegraph
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.015);
    const r = Math.floor(0xff * pulse);
    const g = Math.floor(0xaa * pulse);
    enemy.bodyMesh.material.emissive.setRGB(r / 255, g / 255, 0);
    if (enemy.headMesh) enemy.headMesh.material.emissive.setRGB(r / 255, g / 255, 0);

    if (enemy.meleeTimer <= 0) {
      // Transition to attacking
      enemy.meleePhase = 'attacking';
      enemy.meleeTimer = meleeCfg.attackDuration;

      // Lunge toward player if configured
      if (meleeCfg.lungeDistance) {
        _toPlayer.subVectors(playerPos, enemy.pos);
        _toPlayer.y = 0;
        const dist = _toPlayer.length();
        if (dist > 0.1) {
          _toPlayer.normalize();
          enemy.pos.x += _toPlayer.x * meleeCfg.lungeDistance;
          enemy.pos.z += _toPlayer.z * meleeCfg.lungeDistance;
        }
      }

      // Bright flash on attack
      enemy.bodyMesh.material.emissive.setHex(0xff4400);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(0xff4400);
    }
  } else if (enemy.meleePhase === 'attacking') {
    // Check if player is in hit arc/range (once per attack)
    if (!enemy.meleeHasHit) {
      const dx = playerPos.x - enemy.pos.x;
      const dz = playerPos.z - enemy.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < meleeCfg.hitRange && !isPlayerInvincible()) {
        // Check arc
        const angleToPlayer = Math.atan2(-dx, -dz);
        const facingAngle = enemy.mesh.rotation.y;
        let angleDiff = angleToPlayer - facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) <= meleeCfg.hitArc / 2) {
          // Hit the player!
          const dmg = meleeCfg.damage * MOB_GLOBAL.damageMult;
          gameState.playerHealth -= dmg;
          enemy.meleeHasHit = true;
          screenShake(3, 120);
          emit({ type: 'playerHit', damage: dmg, position: { x: playerPos.x, z: playerPos.z } });
          spawnDamageNumber(playerPos.x, playerPos.z, Math.round(dmg), '#ff4466');

          if (gameState.playerHealth <= 0) {
            gameState.playerHealth = 0;
            gameState.phase = 'gameOver';
          }
        }
      }
    }

    if (enemy.meleeTimer <= 0) {
      // Transition to recovery
      enemy.meleePhase = 'recovery';
      enemy.meleeTimer = meleeCfg.recoveryDuration * MOB_GLOBAL.recoveryMult;
      // Dim emissive during recovery — punish window
      enemy.bodyMesh.material.emissive.setHex(0x222222);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(0x222222);
    }
  } else if (enemy.meleePhase === 'recovery') {
    if (enemy.meleeTimer <= 0) {
      // Back to idle
      enemy.meleePhase = 'idle';
      enemy.lastAttackTime = performance.now();
      // Restore normal emissive
      enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
    }
  }
}

function behaviorRush(enemy: any, playerPos: any, dt: number, gameState: any) {
  // Skip normal movement during leap (handled by updateLeap)
  if (enemy.isLeaping) return;

  // If in melee attack cycle, update that and skip movement
  if (enemy.meleePhase !== 'idle') {
    updateEnemyMelee(enemy, dt, playerPos, gameState);
    return;
  }

  _toPlayer.subVectors(playerPos, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();

  const stopDist = (enemy.config.rush && enemy.config.rush.stopDistance) || 0.5;

  // Check if close enough to start a melee attack
  const meleeCfg = enemy.config.melee;
  if (meleeCfg && dist <= meleeCfg.hitRange) {
    const now = performance.now();
    if (now - enemy.lastAttackTime > enemy.config.attackRate) {
      startEnemyMelee(enemy);
      return;
    }
  }

  if (dist > stopDist) {
    _toPlayer.normalize();
    const slideBoost = enemy.wasDeflected ? 1.175 : 1.0;
    const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
    const speed = enemy.config.speed * MOB_GLOBAL.speedMult * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
    enemy.pos.x += _toPlayer.x * speed * dt;
    enemy.pos.z += _toPlayer.z * speed * dt;
  }

  // Face player
  if (dist > 0.1) {
    enemy.mesh.rotation.y = Math.atan2(-_toPlayer.x, -_toPlayer.z);
  }

  // --- Pit leap detection ---
  const leapCfg = enemy.config.pitLeap;
  if (!leapCfg) return;

  // Tick cooldown
  if (enemy.leapCooldown > 0) {
    enemy.leapCooldown -= dt * 1000;
    enemy.pitEdgeTimer = 0;
    return;
  }

  // Track time spent hugging a pit edge
  if (enemy.wasDeflected && pitAt(enemy.pos.x, enemy.pos.z, 1.0)) {
    enemy.pitEdgeTimer += dt * 1000;
  } else {
    enemy.pitEdgeTimer = 0;
  }

  // Trigger leap after hugging long enough
  if (enemy.pitEdgeTimer >= leapCfg.edgeTimeRequired) {
    startPitLeap(enemy, playerPos, leapCfg);
  }
}

// --- Pit Leap (goblin arc jump over pits) ---

function startPitLeap(enemy: any, playerPos: any, leapCfg: any) {
  // Direction toward player
  const dx = playerPos.x - enemy.pos.x;
  const dz = playerPos.z - enemy.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return; // too close, skip

  const dirX = dx / dist;
  const dirZ = dz / dist;

  // Find how far we need to leap to clear the pit ahead
  // Scan forward in small steps to find where the pit ends
  let leapDist = 3; // minimum leap distance
  for (let probe = 1; probe <= 15; probe += 0.5) {
    const px = enemy.pos.x + dirX * probe;
    const pz = enemy.pos.z + dirZ * probe;
    if (!pitAt(px, pz, 0.3)) {
      leapDist = probe + 1; // overshoot by 1 unit to land clear
      break;
    }
    leapDist = probe + 1;
  }

  // Cap the leap distance
  leapDist = Math.min(leapDist, 12);

  enemy.isLeaping = true;
  enemy.leapStartX = enemy.pos.x;
  enemy.leapStartZ = enemy.pos.z;
  enemy.leapTargetX = enemy.pos.x + dirX * leapDist;
  enemy.leapTargetZ = enemy.pos.z + dirZ * leapDist;
  enemy.leapArcHeight = leapCfg.arcHeight || 3;
  enemy.leapElapsed = 0;
  enemy.pitEdgeTimer = 0;

  // Flight time based on distance and speed
  const flightDist = leapDist + 2 * enemy.leapArcHeight * enemy.leapArcHeight / Math.max(leapDist, 0.1);
  enemy.leapDuration = flightDist / (leapCfg.leapSpeed || 12);

}

function updateLeap(enemy: any, dt: number) {
  enemy.leapElapsed += dt;
  const t = Math.min(enemy.leapElapsed / enemy.leapDuration, 1);

  // Interpolate XZ position linearly
  enemy.pos.x = enemy.leapStartX + (enemy.leapTargetX - enemy.leapStartX) * t;
  enemy.pos.z = enemy.leapStartZ + (enemy.leapTargetZ - enemy.leapStartZ) * t;

  // Parabolic arc for Y (visual only)
  const arcY = 4 * enemy.leapArcHeight * t * (1 - t);
  enemy.mesh.position.set(enemy.pos.x, arcY, enemy.pos.z);

  // Face direction of travel
  const dx = enemy.leapTargetX - enemy.leapStartX;
  const dz = enemy.leapTargetZ - enemy.leapStartZ;
  if (dx * dx + dz * dz > 0.01) {
    enemy.mesh.rotation.y = Math.atan2(-dx, -dz);
  }

  // Landing
  if (t >= 1) {
    enemy.isLeaping = false;
    enemy.leapCooldown = (enemy.config.pitLeap && enemy.config.pitLeap.cooldown) || 4000;
    // Snap mesh back to ground
    enemy.mesh.position.set(enemy.pos.x, 0, enemy.pos.z);
  }
}

function behaviorKite(enemy: any, playerPos: any, dt: number, gameState: any) {
  _toPlayer.subVectors(playerPos, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  const kite = enemy.config.kite || {};
  const sniper = enemy.config.sniper || {};
  const preferredRange = enemy.config.attackRange * (kite.preferredRangeMult || 0.7);

  const isTelegraphing = enemy.sniperPhase === 'telegraphing';

  // Movement: maintain preferred range (freeze during telegraph — lining up the shot)
  if (!isTelegraphing) {
    const slideBoost = enemy.wasDeflected ? 1.175 : 1.0;
    const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
    const speed = enemy.config.speed * MOB_GLOBAL.speedMult * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
    if (dist < preferredRange - (kite.retreatBuffer || 1)) {
      // Too close — retreat (pit-aware)
      _toPlayer.normalize();
      const retreat = pitAwareDir(enemy.pos.x, enemy.pos.z, -_toPlayer.x, -_toPlayer.z, 2.5);
      enemy.pos.x += retreat.dx * speed * dt;
      enemy.pos.z += retreat.dz * speed * dt;
    } else if (dist > preferredRange + (kite.advanceBuffer || 3)) {
      // Too far — approach (pit-aware)
      _toPlayer.normalize();
      const advance = pitAwareDir(enemy.pos.x, enemy.pos.z, _toPlayer.x, _toPlayer.z, 2.5);
      enemy.pos.x += advance.dx * speed * dt;
      enemy.pos.z += advance.dz * speed * dt;
    }
  }

  // Always face player (or locked aim direction during telegraph)
  if (isTelegraphing) {
    enemy.mesh.rotation.y = enemy.sniperAimAngle + Math.PI;
  } else if (dist > 0.1) {
    const nx = _toPlayer.x / dist;
    const nz = _toPlayer.z / dist;
    enemy.mesh.rotation.y = Math.atan2(-nx, -nz);
  }

  // Sniper attack logic
  const now = performance.now();

  if (enemy.sniperPhase === 'idle') {
    // Check if ready to fire
    if (dist < enemy.config.attackRange && now - enemy.lastAttackTime > enemy.config.attackRate) {
      // Lock aim and begin telegraph
      enemy.sniperPhase = 'telegraphing';
      enemy.sniperTimer = (sniper.telegraphDuration || 800) * MOB_GLOBAL.telegraphMult;

      // Calculate aim direction
      const aimAngle = Math.atan2(playerPos.x - enemy.pos.x, playerPos.z - enemy.pos.z);
      enemy.sniperAimAngle = aimAngle;

      // Flash emissive to signal telegraph start
      enemy.flashTimer = enemy.sniperTimer;
      enemy.bodyMesh.material.emissive.setHex(sniper.color || 0xaa44ff);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(sniper.color || 0xaa44ff);
    }
  } else if (enemy.sniperPhase === 'telegraphing') {
    // Count down telegraph timer
    enemy.sniperTimer -= dt * 1000;

    // Pulsing emissive during telegraph
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
    const c = sniper.color || 0xaa44ff;
    const r = ((c >> 16) & 0xff) / 255;
    const g = ((c >> 8) & 0xff) / 255;
    const b = (c & 0xff) / 255;
    enemy.bodyMesh.material.emissive.setRGB(r * pulse, g * pulse, b * pulse);
    if (enemy.headMesh) enemy.headMesh.material.emissive.setRGB(r * pulse, g * pulse, b * pulse);

    if (enemy.sniperTimer <= 0) {
      // Fire a real projectile in the locked aim direction
      enemy.sniperPhase = 'idle';
      enemy.lastAttackTime = now;

      const dirX = Math.sin(enemy.sniperAimAngle);
      const dirZ = Math.cos(enemy.sniperAimAngle);
      const origin = { x: enemy.pos.x, y: 0.5, z: enemy.pos.z };
      const direction = { x: dirX, y: 0, z: dirZ };
      const projConfig = {
        speed: 12,
        damage: (sniper.damage || 15) * MOB_GLOBAL.damageMult,
        color: sniper.color || 0xaa44ff,
      };
      fireProjectile(origin, direction, projConfig, true);

      // Restore emissive
      enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
    }
  }
}


function behaviorMortar(enemy: any, playerPos: any, dt: number, gameState: any) {
  _toPlayer.subVectors(playerPos, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();
  const kite = enemy.config.kite || {};
  const mortar = enemy.config.mortar || {};
  const preferredRange = enemy.config.attackRange * (kite.preferredRangeMult || 0.65);

  const isAiming = enemy.mortarPhase === 'aiming';

  // Movement: kite like an archer (freeze during aim to line up the shot, pit-aware)
  if (!isAiming) {
    const slideBoost = enemy.wasDeflected ? 1.175 : 1.0;
    const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
    const speed = enemy.config.speed * MOB_GLOBAL.speedMult * (enemy.slowTimer > 0 ? enemy.slowMult : 1) * slideBoost * iceEffects.speedMult;
    if (dist < preferredRange - (kite.retreatBuffer || 1.5)) {
      _toPlayer.normalize();
      const retreat = pitAwareDir(enemy.pos.x, enemy.pos.z, -_toPlayer.x, -_toPlayer.z, 2.5);
      enemy.pos.x += retreat.dx * speed * dt;
      enemy.pos.z += retreat.dz * speed * dt;
    } else if (dist > preferredRange + (kite.advanceBuffer || 3)) {
      _toPlayer.normalize();
      const advance = pitAwareDir(enemy.pos.x, enemy.pos.z, _toPlayer.x, _toPlayer.z, 2.5);
      enemy.pos.x += advance.dx * speed * dt;
      enemy.pos.z += advance.dz * speed * dt;
    }
  }

  // Face player (or target during aim)
  if (isAiming) {
    const dx = enemy.mortarTarget.x - enemy.pos.x;
    const dz = enemy.mortarTarget.z - enemy.pos.z;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      enemy.mesh.rotation.y = Math.atan2(-dx, -dz);
    }
  } else if (dist > 0.1) {
    const nx = _toPlayer.x / dist;
    const nz = _toPlayer.z / dist;
    enemy.mesh.rotation.y = Math.atan2(-nx, -nz);
  }

  // Mortar attack logic
  const now = performance.now();

  if (enemy.mortarPhase === 'idle') {
    if (dist < enemy.config.attackRange && now - enemy.lastAttackTime > enemy.config.attackRate) {
      // Start aim phase — pick a target near the player
      enemy.mortarPhase = 'aiming';
      enemy.mortarTimer = mortar.aimDuration || 1200;

      // Target = player position + random inaccuracy offset
      const inaccuracy = mortar.inaccuracy || 1.5;
      const angle = Math.random() * Math.PI * 2;
      enemy.mortarTarget.x = playerPos.x + Math.cos(angle) * Math.random() * inaccuracy;
      enemy.mortarTarget.z = playerPos.z + Math.sin(angle) * Math.random() * inaccuracy;

      // Clamp target to arena
      enemy.mortarTarget.x = Math.max(-19, Math.min(19, enemy.mortarTarget.x));
      enemy.mortarTarget.z = Math.max(-19, Math.min(19, enemy.mortarTarget.z));

      // Flash emissive to signal aim start
      enemy.flashTimer = mortar.aimDuration || 1200;
      enemy.bodyMesh.material.emissive.setHex(mortar.color || 0xff6622);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(mortar.color || 0xff6622);

      // Create aim arc line preview
      createMortarArcLine(enemy);

      // Create persistent ground circle at landing point (stays through aim + flight)
      createMortarGroundCircle(enemy);
    }
  } else if (enemy.mortarPhase === 'aiming') {
    enemy.mortarTimer -= dt * 1000;

    // Update arc line visual each frame
    updateMortarArcLine(enemy);

    // Pulse the ground circle during aim phase (stays at or above 0.3 opacity)
    if (enemy.mortarGroundCircle) {
      const gc = enemy.mortarGroundCircle;
      const aimDuration = mortar.aimDuration || 1200;
      const aimProgress = 1 - (enemy.mortarTimer / aimDuration); // 0->1 over aim phase

      // Scale-in animation: circleStartScale -> 1.0 over circleScaleTime (easeOutQuad)
      gc.scaleElapsed += dt;
      const scaleT = Math.min(gc.scaleElapsed / gc.scaleDuration, 1);
      const eased = 1 - (1 - scaleT) * (1 - scaleT); // easeOutQuad
      const startS = gc.circleStartScale;
      const s = gc.targetRadius * (startS + (1 - startS) * eased);
      gc.group.scale.set(s, s, s);

      // Ring: pulse between 0.3 and 0.5, accelerating pulse rate as aim progresses
      const freq = 0.004 + 0.008 * aimProgress; // pulse speeds up
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() * freq);
      gc.ringMat.opacity = (0.3 + 0.15 * aimProgress) * pulse;
      gc.fillMat.opacity = 0.08 + 0.04 * aimProgress;
    }

    if (enemy.mortarTimer <= 0) {
      // Fire the mortar projectile!
      enemy.mortarPhase = 'idle';
      enemy.lastAttackTime = now;

      // Remove aim arc line
      removeMortarArcLine(enemy);

      // Hand the ground circle to the projectile (it persists during flight)
      const groundCircle = enemy.mortarGroundCircle;
      enemy.mortarGroundCircle = null;

      // Launch the projectile along the arc
      fireMortarProjectile({
        startX: enemy.pos.x,
        startZ: enemy.pos.z,
        targetX: enemy.mortarTarget.x,
        targetZ: enemy.mortarTarget.z,
        arcHeight: mortar.arcHeight || 6,
        speed: mortar.projectileSpeed || 8,
        color: mortar.color || 0xff6622,
        blastRadius: mortar.blastRadius || 2.5,
        damage: mortar.damage || 18,
        slowDuration: mortar.slowDuration || 800,
        slowMult: mortar.slowMult || 0.6,
        explosionDuration: mortar.explosionDuration || 300,
        icePatch: mortar.icePatch || null,
        gameState,
        sourceEnemy: enemy,
        groundCircle,
      });
    }
  }
}

// --- Mortar arc line helpers ---

const ARC_SEGMENTS = 20;
let _arcLineGeo: any = null;

function createMortarArcLine(enemy: any) {
  if (!_arcLineGeo) {
    const positions = new Float32Array((ARC_SEGMENTS + 1) * 3);
    _arcLineGeo = new THREE.BufferGeometry();
    _arcLineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  }

  // Clone geometry so each enemy gets its own buffer
  const geo = _arcLineGeo.clone();
  geo.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array((ARC_SEGMENTS + 1) * 3), 3
  ));

  const mat = new THREE.LineBasicMaterial({
    color: enemy.config.mortar?.color || 0xff6622,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  const line = new THREE.Line(geo, mat);
  sceneRef.add(line);
  enemy.mortarArcLine = line;

  updateMortarArcLine(enemy);
}

function updateMortarArcLine(enemy: any) {
  if (!enemy.mortarArcLine) return;
  const mortar = enemy.config.mortar || {};
  const sx = enemy.pos.x;
  const sz = enemy.pos.z;
  const tx = enemy.mortarTarget.x;
  const tz = enemy.mortarTarget.z;
  const arcH = mortar.arcHeight || 6;
  const startY = 0.8; // launch from body height

  const positions = enemy.mortarArcLine.geometry.attributes.position.array;
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const x = sx + (tx - sx) * t;
    const z = sz + (tz - sz) * t;
    // Parabolic arc: y = startY + 4*arcH*t*(1-t) gives a nice arc peaking at arcH
    const y = startY + 4 * arcH * t * (1 - t);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  enemy.mortarArcLine.geometry.attributes.position.needsUpdate = true;

  // Pulse opacity for telegraph effect
  const pulse = 0.3 + 0.3 * Math.sin(performance.now() * 0.008);
  enemy.mortarArcLine.material.opacity = pulse;
}

function removeMortarArcLine(enemy: any) {
  if (enemy.mortarArcLine) {
    enemy.mortarArcLine.geometry.dispose();
    enemy.mortarArcLine.material.dispose();
    sceneRef.remove(enemy.mortarArcLine);
    enemy.mortarArcLine = null;
  }
}

// --- Mortar ground circle (persistent through aim + flight) ---

let _circleGeo: any = null;

function createMortarGroundCircle(enemy: any) {
  const mortar = enemy.config.mortar || {};
  const radius = mortar.blastRadius || 2.5;
  const color = mortar.color || 0xff6622;

  // Shared ring geometry (unit scale, scaled per instance)
  if (!_circleGeo) {
    _circleGeo = new THREE.RingGeometry(0.85, 1.0, 32);
    _circleGeo.rotateX(-Math.PI / 2);
  }

  // Ring outline
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(_circleGeo, ringMat);

  // Filled disc for area indication (shared geometry)
  if (!_mortarFillGeoShared) {
    _mortarFillGeoShared = new THREE.CircleGeometry(1, 32);
    _mortarFillGeoShared.rotateX(-Math.PI / 2);
  }
  const fillMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fillMesh = new THREE.Mesh(_mortarFillGeoShared, fillMat);

  const group = new THREE.Group();
  group.add(ringMesh);
  group.add(fillMesh);
  group.position.set(enemy.mortarTarget.x, 0.05, enemy.mortarTarget.z);
  const circleStartScale = mortar.circleStartScale || 0.25;
  const startScale = radius * circleStartScale;
  group.scale.set(startScale, startScale, startScale);
  sceneRef.add(group);

  enemy.mortarGroundCircle = {
    group,
    ringMat,
    fillMat,
    color,
    targetRadius: radius,
    circleStartScale,
    scaleElapsed: 0,                              // tracks time for scale-in animation
    scaleDuration: (mortar.circleScaleTime || 200) / 1000, // convert ms -> seconds
  };
}

function removeMortarGroundCircle(enemy: any) {
  if (enemy.mortarGroundCircle) {
    const gc = enemy.mortarGroundCircle;
    gc.ringMat.dispose();
    gc.fillMat.dispose();
    // geometry is shared — don't dispose
    sceneRef.remove(gc.group);
    enemy.mortarGroundCircle = null;
  }
}

// --- Death telegraph circle (expanding ring before golem explosion) ---

let _deathCircleGeo: any = null;

function createDeathTelegraph(enemy: any) {
  const cfg = enemy.config.deathExplosion;
  const radius = cfg.radius;
  const color = cfg.color;

  // Shared ring geometry (unit scale)
  if (!_deathCircleGeo) {
    _deathCircleGeo = new THREE.RingGeometry(0.85, 1.0, 32);
    _deathCircleGeo.rotateX(-Math.PI / 2);
  }

  // Ring outline
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(_deathCircleGeo, ringMat);

  // Filled disc (shared geometry)
  if (!_deathFillGeoShared) {
    _deathFillGeoShared = new THREE.CircleGeometry(1, 32);
    _deathFillGeoShared.rotateX(-Math.PI / 2);
  }
  const fillMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fillMesh = new THREE.Mesh(_deathFillGeoShared, fillMat);

  const group = new THREE.Group();
  group.add(ringMesh);
  group.add(fillMesh);
  group.position.set(enemy.pos.x, 0.05, enemy.pos.z);
  // Start tiny, will scale up
  group.scale.set(0.1, 0.1, 0.1);
  sceneRef.add(group);

  enemy.deathTelegraph = {
    group,
    ringMat,
    fillMat,
    targetRadius: radius,
  };
}

function updateDeathTelegraph(enemy: any, _dt: number) {
  const tg = enemy.deathTelegraph;
  if (!tg) return;

  const cfg = enemy.config.deathExplosion;
  const duration = (cfg.telegraphDuration || 200) / 1000;
  const elapsed = (cfg.telegraphDuration - enemy.deathTimer) / 1000;
  const t = Math.min(elapsed / duration, 1);

  // Scale from tiny to target radius
  const scale = tg.targetRadius * t;
  tg.group.scale.set(scale, scale, scale);

  // Follow the enemy position (can be pushed)
  tg.group.position.set(enemy.pos.x, 0.05, enemy.pos.z);

  // Pulsing opacity on ring
  const pulse = 0.5 + 0.3 * Math.sin(performance.now() * 0.02);
  tg.ringMat.opacity = pulse;
  tg.fillMat.opacity = 0.12 + 0.08 * t;
}

function removeDeathTelegraph(enemy: any) {
  const tg = enemy.deathTelegraph;
  if (!tg) return;
  tg.ringMat.dispose();
  tg.fillMat.dispose();
  // geometry is shared — don't dispose
  sceneRef.remove(tg.group);
  enemy.deathTelegraph = null;
}

// --- Death explosion (crystal golem etc.) ---

function onDeathExplosion(enemy: any, gameState: any) {
  const cfg = enemy.config.deathExplosion;
  const x = enemy.pos.x;
  const z = enemy.pos.z;

  // Screen shake
  screenShake(5, 250);

  // Show "BOOM" text on dying enemy
  const colorStr = '#' + cfg.color.toString(16).padStart(6, '0');
  spawnDamageNumber(x, z, 'BOOM', colorStr);

  // AoE effect — damages nearby enemies with cascade visual
  applyAoeEffect({
    x,
    z,
    radius: cfg.radius,
    durationMs: cfg.ringDuration || 400,
    color: cfg.color,
    label: cfg.damage + '',
    effectFn: (e: any) => {
      e.health -= cfg.damage;
      if (cfg.stunDuration > 0) {
        stunEnemy(e, cfg.stunDuration);
      }
    },
    gameState,
    excludeEnemy: enemy, // exclude the dying enemy itself
  });

  // Check player damage
  const pp = getPlayerPos();
  const pdx = pp.x - x;
  const pdz = pp.z - z;
  const playerDist = Math.sqrt(pdx * pdx + pdz * pdz);
  if (playerDist < cfg.radius && !isPlayerInvincible()) {
    gameState.playerHealth -= cfg.damage;
    screenShake(4, 200);
    spawnDamageNumber(pp.x, pp.z, cfg.damage, '#ff4466');
    if (gameState.playerHealth <= 0) {
      gameState.playerHealth = 0;
      gameState.phase = 'gameOver';
    }
  }
}

function behaviorTank(enemy: any, playerPos: any, dt: number, gameState: any) {
  const tank = enemy.config.tank || {};
  _toPlayer.subVectors(playerPos, enemy.pos);
  _toPlayer.y = 0;
  const dist = _toPlayer.length();

  // If in melee attack cycle, update that and skip movement
  if (enemy.meleePhase !== 'idle') {
    updateEnemyMelee(enemy, dt, playerPos, gameState);
    return;
  }

  const slowFactor = enemy.slowTimer > 0 ? enemy.slowMult : 1;
  const slideBoost = enemy.wasDeflected ? 1.175 : 1.0;
  const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
  const baseSpeed = enemy.config.speed * MOB_GLOBAL.speedMult;

  if (enemy.isCharging) {
    // Charge forward at multiplied speed
    const speedMult = tank.chargeSpeedMult || 3;
    enemy.pos.x += enemy.chargeDir.x * baseSpeed * speedMult * slowFactor * slideBoost * iceEffects.speedMult * dt;
    enemy.pos.z += enemy.chargeDir.z * baseSpeed * speedMult * slowFactor * slideBoost * iceEffects.speedMult * dt;
    enemy.chargeTimer -= dt * 1000;

    if (enemy.chargeTimer <= 0) {
      enemy.isCharging = false;
      const cdMin = tank.chargeCooldownMin || 3000;
      const cdMax = tank.chargeCooldownMax || 5000;
      enemy.chargeCooldown = cdMin + Math.random() * (cdMax - cdMin);
    }
  } else {
    // Check if close enough for melee swing (when charge is on cooldown or too close)
    const meleeCfg = enemy.config.melee;
    if (meleeCfg && dist <= meleeCfg.hitRange) {
      const now = performance.now();
      if (now - enemy.lastAttackTime > enemy.config.attackRate) {
        startEnemyMelee(enemy);
        return;
      }
    }

    // Normal slow movement toward player
    if (dist > 1) {
      _toPlayer.normalize();
      enemy.pos.x += _toPlayer.x * baseSpeed * slowFactor * slideBoost * iceEffects.speedMult * dt;
      enemy.pos.z += _toPlayer.z * baseSpeed * slowFactor * slideBoost * iceEffects.speedMult * dt;
    }

    // Charge cooldown
    enemy.chargeCooldown -= dt * 1000;
    const minD = tank.chargeMinDist || 2;
    const maxD = tank.chargeMaxDist || 10;
    if (enemy.chargeCooldown <= 0 && dist < maxD && dist > minD) {
      // Start charge — telegraph with flash
      enemy.isCharging = true;
      enemy.chargeTimer = tank.chargeDuration || 500;
      _toPlayer.subVectors(playerPos, enemy.pos).normalize();
      enemy.chargeDir.copy(_toPlayer);

      // Telegraph flash
      const telegraphMs = tank.telegraphDuration || 300;
      enemy.flashTimer = telegraphMs;
      enemy.bodyMesh.material.emissive.setHex(0xffffff);
      if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(0xffffff);
    }
  }

  // Face movement direction
  if (dist > 0.1) {
    const nx = (playerPos.x - enemy.pos.x);
    const nz = (playerPos.z - enemy.pos.z);
    const l = Math.sqrt(nx * nx + nz * nz);
    if (l > 0) {
      enemy.mesh.rotation.y = Math.atan2(-nx / l, -nz / l);
    }
  }
}

export function slowEnemy(enemy: any, durationMs: number, mult: number) {
  enemy.slowTimer = durationMs;
  enemy.slowMult = mult;
}

export function stunEnemy(enemy: any, durationMs: number) {
  enemy.stunTimer = durationMs;
  // Cancel any active charge
  enemy.isCharging = false;
  // Cancel melee attack
  if (enemy.meleePhase !== 'idle') {
    enemy.meleePhase = 'idle';
    enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
    if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
  }
  // Cancel sniper telegraph (shot will still fire visually but enemy resets state)
  if (enemy.sniperPhase === 'telegraphing') {
    enemy.sniperPhase = 'idle';
  }
  // Cancel mortar aim
  if (enemy.mortarPhase === 'aiming') {
    enemy.mortarPhase = 'idle';
    removeMortarArcLine(enemy);
    removeMortarGroundCircle(enemy);
  }
}

export function stunEnemiesInRadius(centerPos: any, radius: number, durationMs: number, gameState: any) {
  const r2 = radius * radius;
  for (const enemy of gameState.enemies) {
    const dx = enemy.pos.x - centerPos.x;
    const dz = enemy.pos.z - centerPos.z;
    if (dx * dx + dz * dz < r2) {
      stunEnemy(enemy, durationMs);
    }
  }
}

export function clearEnemies(gameState: any) {
  for (const enemy of gameState.enemies) {
    // Clean up shield mesh if present
    if (enemy.shieldMesh) {
      enemy.shieldMesh.geometry.dispose();
      enemy.shieldMesh.material.dispose();
    }
    // Clean up mortar visuals
    removeMortarArcLine(enemy);
    removeMortarGroundCircle(enemy);
    // Clean up death telegraph if active
    removeDeathTelegraph(enemy);
    sceneRef.remove(enemy.mesh);
  }
  gameState.enemies.length = 0;

  // Invalidate cached bounds (level editor may have changed arena)
  _collisionBounds = null;
  _pitBoundsCache = null;
}
