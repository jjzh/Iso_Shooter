import { getPlayerPos, isPlayerInvincible, isPlayerDashing, consumePushEvent } from '../entities/player.js';
import { getPlayerProjectiles, getEnemyProjectiles, releaseProjectile } from '../entities/projectile.js';
import { stunEnemy } from '../entities/enemy.js';
import { screenShake, getScene } from './renderer.js';
import { PLAYER } from '../config/player.js';
import { getCollisionBounds, getPitBounds } from '../config/arena.js';
import { spawnDamageNumber } from '../ui/damageNumbers.js';
import { applyAoeEffect, isInRotatedRect, createAoeRing } from './aoeTelegraph.js';

const THREE = window.THREE;

// Cache collision bounds (invalidated when arena layout changes)
let collisionBounds = null;   // obstacles + walls
let pitBounds = null;          // pits only
let movementBounds = null;     // obstacles + walls + pits

// Invalidate cached bounds — called by level editor when obstacles/pits change
export function invalidateCollisionBounds() {
  collisionBounds = null;
  pitBounds = null;
  movementBounds = null;
}

// Effect ghosts — push afterimages + pit fall sinking ghosts
const effectGhosts = [];

// Shared unit geometries for ghost meshes (scaled per-instance)
let _ghostBodyGeo = null; // unit cylinder r=1, h=1
let _ghostHeadGeo = null; // unit sphere r=1

function createGhostMesh(x, z, radius, height, color) {
  if (!_ghostBodyGeo) {
    _ghostBodyGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    _ghostHeadGeo = new THREE.SphereGeometry(1, 6, 4);
  }
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const body = new THREE.Mesh(_ghostBodyGeo, bodyMat);
  const bodyH = height * 0.6;
  body.scale.set(radius, bodyH, radius);
  body.position.y = height * 0.3;
  group.add(body);

  const headMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const headR = radius * 0.7;
  const head = new THREE.Mesh(_ghostHeadGeo, headMat);
  head.scale.set(headR, headR, headR);
  head.position.y = height * 0.75;
  group.add(head);

  group.position.set(x, 0, z);
  getScene().add(group);
  return group;
}

function spawnPushGhosts(enemy, oldX, oldZ, newX, newZ) {
  const cfg = enemy.config;
  const r = cfg.size.radius;
  const h = cfg.size.height;
  // Spawn ghosts at 33% and 66% of travel path
  for (let t = 0.33; t < 1; t += 0.33) {
    const gx = oldX + (newX - oldX) * t;
    const gz = oldZ + (newZ - oldZ) * t;
    const mesh = createGhostMesh(gx, gz, r, h, 0x44ffaa);
    effectGhosts.push({ type: 'fade', mesh, life: 0, maxLife: 300 });
  }
}

function spawnPitFallGhost(enemy) {
  const cfg = enemy.config;
  const r = cfg.size.radius;
  const h = cfg.size.height;
  const mesh = createGhostMesh(enemy.pos.x, enemy.pos.z, r, h, 0x8844ff);
  // Start more opaque for pit fall
  mesh.children.forEach(child => { child.material.opacity = 0.7; });
  effectGhosts.push({ type: 'sink', mesh, life: 0, maxLife: 500 });
}

export function updateEffectGhosts(dt) {
  const dtMs = dt * 1000;
  const scene = getScene();

  for (let i = effectGhosts.length - 1; i >= 0; i--) {
    const g = effectGhosts[i];
    g.life += dtMs;
    const t = Math.min(g.life / g.maxLife, 1);

    if (g.type === 'fade') {
      // Linear fade from 0.4 → 0
      const alpha = 0.4 * (1 - t);
      g.mesh.children.forEach(child => { child.material.opacity = alpha; });
    } else if (g.type === 'sink') {
      // Shrink + sink + fade
      const scale = 1 - t;
      g.mesh.scale.set(scale, scale, scale);
      g.mesh.position.y = -1.5 * t;
      const alpha = 0.7 * (1 - t * t);
      g.mesh.children.forEach(child => { child.material.opacity = alpha; });
    }

    if (t >= 1) {
      // Cleanup (geometry is shared — only dispose materials)
      g.mesh.children.forEach(child => { child.material.dispose(); });
      scene.remove(g.mesh);
      effectGhosts.splice(i, 1);
    }
  }
}

export function clearEffectGhosts() {
  const scene = getScene();
  for (const g of effectGhosts) {
    g.mesh.children.forEach(child => { child.material.dispose(); });
    scene.remove(g.mesh);
  }
  effectGhosts.length = 0;
}

function getBounds() {
  if (!collisionBounds) collisionBounds = getCollisionBounds();
  return collisionBounds;
}

function getPits() {
  if (!pitBounds) pitBounds = getPitBounds();
  return pitBounds;
}

function getMoveBounds() {
  if (!movementBounds) movementBounds = [...getBounds(), ...getPits()];
  return movementBounds;
}

// Circle vs AABB collision — returns push-out vector or null
function circleVsAABB(cx, cz, radius, box) {
  // Find closest point on AABB to circle center
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));

  const dx = cx - closestX;
  const dz = cz - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq < radius * radius) {
    const dist = Math.sqrt(distSq);
    if (dist === 0) {
      // Center is inside the box — push out on shortest axis
      const overlapLeft = cx - box.minX;
      const overlapRight = box.maxX - cx;
      const overlapTop = cz - box.minZ;
      const overlapBottom = box.maxZ - cz;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft) return { x: -(overlapLeft + radius), z: 0 };
      if (minOverlap === overlapRight) return { x: overlapRight + radius, z: 0 };
      if (minOverlap === overlapTop) return { x: 0, z: -(overlapTop + radius) };
      return { x: 0, z: overlapBottom + radius };
    }
    const overlap = radius - dist;
    return { x: (dx / dist) * overlap, z: (dz / dist) * overlap };
  }
  return null;
}

// Point (projectile) vs AABB collision
function pointVsAABB(px, pz, box) {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

// Resolve entity position against all terrain
export function resolveTerrainCollision(x, z, radius) {
  const bounds = getBounds();
  let rx = x, rz = z;
  for (const box of bounds) {
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
    }
  }
  return { x: rx, z: rz };
}

// Check if a point is inside any terrain
export function pointHitsTerrain(px, pz) {
  const bounds = getBounds();
  for (const box of bounds) {
    if (pointVsAABB(px, pz, box)) return true;
  }
  return false;
}

// Resolve entity position against all terrain + pits (for voluntary movement)
// Returns wasDeflected flag for speed boost detection
export function resolveMovementCollision(x, z, radius) {
  const bounds = getMoveBounds();
  let rx = x, rz = z;
  let wasDeflected = false;
  for (const box of bounds) {
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
      wasDeflected = true;
    }
  }
  return { x: rx, z: rz, wasDeflected };
}

// Check if a point is inside any pit
export function pointInPit(px, pz) {
  const pits = getPits();
  for (const pit of pits) {
    if (px >= pit.minX && px <= pit.maxX && pz >= pit.minZ && pz <= pit.maxZ) {
      return true;
    }
  }
  return false;
}

// Check player + enemies for pit falls (call after checkCollisions)
export function checkPitFalls(gameState) {
  const playerPos = getPlayerPos();

  // Player pit check (skip during dash — dash phases through pits)
  if (!isPlayerDashing() && !isPlayerInvincible()) {
    if (pointInPit(playerPos.x, playerPos.z)) {
      gameState.playerHealth = 0;
      gameState.phase = 'gameOver';
      screenShake(5, 200);
      spawnDamageNumber(playerPos.x, playerPos.z, 'FELL!', '#ff4466');
    }
  }

  // Enemy pit check
  for (const enemy of gameState.enemies) {
    if (enemy.health <= 0) continue; // already dead
    if (enemy.isLeaping) continue;   // airborne — leaping over pit
    if (pointInPit(enemy.pos.x, enemy.pos.z)) {
      // Spawn sinking ghost + expanding purple ring before killing
      spawnPitFallGhost(enemy);
      createAoeRing(enemy.pos.x, enemy.pos.z, 2.5, 500, 0x8844ff);

      enemy.health = 0;
      enemy.fellInPit = true;
      enemy.stunTimer = 9999; // freeze during cleanup frame
      spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'FELL!', '#8844ff');
      screenShake(4, 200);
    }
  }
}

// Shield-aware damage routing
function applyDamageToEnemy(enemy, damage, gameState) {
  if (enemy.shieldActive && enemy.shieldHealth > 0) {
    enemy.shieldHealth -= damage;
    if (enemy.shieldHealth <= 0) {
      // Shield break — overkill passes to HP
      const overkill = -enemy.shieldHealth;
      enemy.shieldHealth = 0;
      enemy.shieldActive = false;
      onShieldBreak(enemy, gameState);
      if (overkill > 0) {
        enemy.health -= overkill;
      }
    }
  } else {
    enemy.health -= damage;
  }
}

function onShieldBreak(enemy, gameState) {
  const shieldCfg = enemy.config.shield;

  // Remove shield mesh
  if (enemy.shieldMesh) {
    enemy.shieldMesh.visible = false;
    enemy.mesh.remove(enemy.shieldMesh);
    enemy.shieldMesh.material.dispose();
    enemy.shieldMesh = null;
  }

  // Stun the golem immediately
  stunEnemy(enemy, shieldCfg.stunDuration);

  // "BREAK" damage number in cyan
  spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'BREAK', '#88eeff');

  // Generic AoE: expanding ring + cascade stun on nearby enemies
  applyAoeEffect({
    x: enemy.pos.x,
    z: enemy.pos.z,
    radius: shieldCfg.stunRadius,
    durationMs: shieldCfg.breakRingDuration || 400,
    color: 0x88eeff,
    label: 'STUNNED',
    effectFn: (e) => stunEnemy(e, shieldCfg.stunDuration),
    gameState,
    excludeEnemy: enemy,
  });

  // Weaken post-break: drop knockback resist to 0 (same as goblin)
  enemy.knockbackResist = 0;

  // Visual: make golem semi-transparent (exposed without shield)
  if (enemy.bodyMesh) {
    enemy.bodyMesh.material.transparent = true;
    enemy.bodyMesh.material.opacity = 0.5;
  }
  if (enemy.headMesh) {
    enemy.headMesh.material.transparent = true;
    enemy.headMesh.material.opacity = 0.5;
  }

  // Screen shake
  screenShake(4, 200);
}

export function checkCollisions(gameState) {
  const playerPos = getPlayerPos();
  const playerR = PLAYER.size.radius;

  // === Player vs terrain + pits (skip during dash — dash phases through) ===
  if (!isPlayerDashing()) {
    const resolved = resolveMovementCollision(playerPos.x, playerPos.z, playerR);
    playerPos.x = resolved.x;
    playerPos.z = resolved.z;
  }

  // === Enemies vs terrain + pits (voluntary movement — edge-slide around pits) ===
  // Must happen BEFORE knockback so enemies slide around pits during normal movement
  for (const enemy of gameState.enemies) {
    if (enemy.isLeaping) continue; // airborne — skip ground collision entirely
    const resolved = resolveMovementCollision(enemy.pos.x, enemy.pos.z, enemy.config.size.radius);
    enemy.pos.x = resolved.x;
    enemy.pos.z = resolved.z;
    enemy.wasDeflected = resolved.wasDeflected;
    enemy.mesh.position.copy(enemy.pos);
  }

  // === Player projectiles vs enemies ===
  const playerProj = getPlayerProjectiles();
  for (let i = playerProj.length - 1; i >= 0; i--) {
    const p = playerProj[i];
    if (!p.mesh.visible) continue;

    // Projectile vs terrain
    if (pointHitsTerrain(p.mesh.position.x, p.mesh.position.z)) {
      releaseProjectile(p);
      continue;
    }

    for (const enemy of gameState.enemies) {
      const dx = p.mesh.position.x - enemy.pos.x;
      const dz = p.mesh.position.z - enemy.pos.z;
      const distSq = dx * dx + dz * dz;
      const hitR = enemy.config.size.radius + PLAYER.projectile.size;

      if (distSq < hitR * hitR) {
        // Hit — route through shield if active
        const wasShielded = enemy.shieldActive;
        applyDamageToEnemy(enemy, p.damage, gameState);
        releaseProjectile(p);

        // Damage number — cyan if shielded, green if HP
        const dmgColor = wasShielded ? '#88eeff' : '#44ff88';
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, p.damage, dmgColor);

        // Flash white
        enemy.flashTimer = 80;
        enemy.bodyMesh.material.emissive.setHex(0xffffff);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(0xffffff);

        break;
      }
    }
  }

  // === Enemy projectiles vs terrain + player ===
  const enemyProj = getEnemyProjectiles();
  for (let i = enemyProj.length - 1; i >= 0; i--) {
    const p = enemyProj[i];
    if (!p.mesh.visible) continue;

    // Projectile vs terrain
    if (pointHitsTerrain(p.mesh.position.x, p.mesh.position.z)) {
      releaseProjectile(p);
      continue;
    }

    // Projectile vs player
    if (!isPlayerInvincible()) {
      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      const hitR = playerR + 0.1;

      if (distSq < hitR * hitR) {
        gameState.playerHealth -= p.damage;
        releaseProjectile(p);
        screenShake(3, 100);

        // Damage number on player (red)
        spawnDamageNumber(playerPos.x, playerPos.z, p.damage, '#ff4466');

        if (gameState.playerHealth <= 0) {
          gameState.playerHealth = 0;
          gameState.phase = 'gameOver';
        }
        break;
      }
    }
  }

  // === Melee enemies vs player ===
  if (!isPlayerInvincible()) {
    const now = performance.now();
    for (const enemy of gameState.enemies) {
      if (enemy.behavior === 'kite') continue;
      if (enemy.stunTimer > 0) continue; // stunned enemies can't melee

      const dx = enemy.pos.x - playerPos.x;
      const dz = enemy.pos.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      const hitR = playerR + enemy.config.size.radius;

      if (distSq < hitR * hitR) {
        const attackCooldown = enemy.config.attackRate || 1000;
        if (now - enemy.lastAttackTime > attackCooldown) {
          const chargeMult = (enemy.config.tank && enemy.config.tank.chargeDamageMult) || 1.5;
          const dmg = enemy.isCharging ? enemy.config.damage * chargeMult : enemy.config.damage;
          gameState.playerHealth -= dmg;
          enemy.lastAttackTime = now;
          screenShake(enemy.isCharging ? 5 : 2, enemy.isCharging ? 150 : 80);

          // Damage number on player (red)
          spawnDamageNumber(playerPos.x, playerPos.z, dmg, '#ff4466');

          if (gameState.playerHealth <= 0) {
            gameState.playerHealth = 0;
            gameState.phase = 'gameOver';
          }
        }
      }
    }
  }

  // === Force Push knockback ===
  const pushEvt = consumePushEvent();
  if (pushEvt) {
    const dirX = pushEvt.dirX;
    const dirZ = pushEvt.dirZ;
    for (const enemy of gameState.enemies) {
      if (enemy.health <= 0) continue;
      if (enemy.isLeaping) continue; // can't push airborne enemies
      const enemyRadius = enemy.config.size.radius;
      if (isInRotatedRect(enemy.pos.x, enemy.pos.z, pushEvt.x, pushEvt.z,
                           pushEvt.width, pushEvt.length, pushEvt.rotation, enemyRadius)) {
        // Capture old position for afterimages
        const oldX = enemy.pos.x;
        const oldZ = enemy.pos.z;

        const kbMult = 1 - (enemy.knockbackResist ?? enemy.config.knockbackResist ?? 0);
        const kbDist = pushEvt.force * kbMult;
        enemy.pos.x += dirX * kbDist;
        enemy.pos.z += dirZ * kbDist;
        enemy.mesh.position.copy(enemy.pos);

        // Spawn push afterimages along travel path
        spawnPushGhosts(enemy, oldX, oldZ, enemy.pos.x, enemy.pos.z);

        // Flash feedback
        enemy.flashTimer = 100;
        enemy.bodyMesh.material.emissive.setHex(0x44ffaa);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(0x44ffaa);

        spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'PUSH', '#44ffaa');
      }
    }
  }

  // === Enemies vs terrain (post-knockback — obstacles+walls only, NOT pits) ===
  // Only needed when Force Push actually fired this frame
  if (pushEvt) {
    for (const enemy of gameState.enemies) {
      if (enemy.isLeaping) continue; // airborne — skip ground collision
      const resolved = resolveTerrainCollision(enemy.pos.x, enemy.pos.z, enemy.config.size.radius);
      enemy.pos.x = resolved.x;
      enemy.pos.z = resolved.z;
      enemy.mesh.position.copy(enemy.pos);
    }
  }
}
