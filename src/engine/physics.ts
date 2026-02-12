import { getPlayerPos, isPlayerInvincible, isPlayerDashing, consumePushEvent } from '../entities/player';
import { getPlayerProjectiles, getEnemyProjectiles, releaseProjectile } from '../entities/projectile';
import { stunEnemy } from '../entities/enemy';
import { getIceEffects } from '../entities/mortarProjectile';
import { triggerHitReaction } from '../entities/enemyRig';
import { screenShake, getScene } from './renderer';
import { PLAYER } from '../config/player';
import { getCollisionBounds, getPitBounds } from '../config/arena';
import { spawnDamageNumber } from '../ui/damageNumbers';
import { applyAoeEffect, isInRotatedRect, createAoeRing } from './aoeTelegraph';
import { AABB, GameState, Enemy } from '../types/index';
import type { Group, CylinderGeometry, SphereGeometry, Mesh, MeshBasicMaterial, Material } from 'three';

// Cache collision bounds (invalidated when arena layout changes)
let collisionBounds: AABB[] | null = null;
let pitBounds: AABB[] | null = null;
let movementBounds: AABB[] | null = null;

// Invalidate cached bounds — called by level editor when obstacles/pits change
export function invalidateCollisionBounds(): void {
  collisionBounds = null;
  pitBounds = null;
  movementBounds = null;
}

// Effect ghosts — push afterimages + pit fall sinking ghosts
interface EffectGhost {
  type: 'fade' | 'sink';
  mesh: Group;
  life: number;
  maxLife: number;
}
const effectGhosts: EffectGhost[] = [];

// Shared unit geometries for ghost meshes (scaled per-instance)
let _ghostBodyGeo: CylinderGeometry | null = null;
let _ghostHeadGeo: SphereGeometry | null = null;

function createGhostMesh(x: number, z: number, radius: number, height: number, color: number): Group {
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
  const head = new THREE.Mesh(_ghostHeadGeo!, headMat);
  head.scale.set(headR, headR, headR);
  head.position.y = height * 0.75;
  group.add(head);

  group.position.set(x, 0, z);
  getScene().add(group);
  return group;
}

function spawnPushGhosts(enemy: Enemy, oldX: number, oldZ: number, newX: number, newZ: number): void {
  const cfg = enemy.config;
  const r = cfg.size.radius;
  const h = cfg.size.height;
  for (let t = 0.33; t < 1; t += 0.33) {
    const gx = oldX + (newX - oldX) * t;
    const gz = oldZ + (newZ - oldZ) * t;
    const mesh = createGhostMesh(gx, gz, r, h, 0x44ffaa);
    effectGhosts.push({ type: 'fade', mesh, life: 0, maxLife: 300 });
  }
}

function spawnPitFallGhost(enemy: Enemy): void {
  const cfg = enemy.config;
  const r = cfg.size.radius;
  const h = cfg.size.height;
  const mesh = createGhostMesh(enemy.pos.x, enemy.pos.z, r, h, 0x8844ff);
  mesh.children.forEach(child => {
    ((child as Mesh).material as MeshBasicMaterial).opacity = 0.7;
  });
  effectGhosts.push({ type: 'sink', mesh, life: 0, maxLife: 500 });
}

export function updateEffectGhosts(dt: number): void {
  const dtMs = dt * 1000;
  const scene = getScene();

  for (let i = effectGhosts.length - 1; i >= 0; i--) {
    const g = effectGhosts[i];
    g.life += dtMs;
    const t = Math.min(g.life / g.maxLife, 1);

    if (g.type === 'fade') {
      const alpha = 0.4 * (1 - t);
      g.mesh.children.forEach(child => {
        ((child as Mesh).material as MeshBasicMaterial).opacity = alpha;
      });
    } else if (g.type === 'sink') {
      const scale = 1 - t;
      g.mesh.scale.set(scale, scale, scale);
      g.mesh.position.y = -1.5 * t;
      const alpha = 0.7 * (1 - t * t);
      g.mesh.children.forEach(child => {
        ((child as Mesh).material as MeshBasicMaterial).opacity = alpha;
      });
    }

    if (t >= 1) {
      g.mesh.children.forEach(child => {
        ((child as Mesh).material as Material).dispose();
      });
      scene.remove(g.mesh);
      effectGhosts.splice(i, 1);
    }
  }
}

export function clearEffectGhosts(): void {
  const scene = getScene();
  for (const g of effectGhosts) {
    g.mesh.children.forEach(child => {
      ((child as Mesh).material as Material).dispose();
    });
    scene.remove(g.mesh);
  }
  effectGhosts.length = 0;
}

function getBounds(): AABB[] {
  if (!collisionBounds) collisionBounds = getCollisionBounds();
  return collisionBounds;
}

function getPits(): AABB[] {
  if (!pitBounds) pitBounds = getPitBounds();
  return pitBounds;
}

function getMoveBounds(): AABB[] {
  if (!movementBounds) movementBounds = [...getBounds(), ...getPits()];
  return movementBounds;
}

function circleVsAABB(cx: number, cz: number, radius: number, box: AABB): { x: number; z: number } | null {
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));

  const dx = cx - closestX;
  const dz = cz - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq < radius * radius) {
    const dist = Math.sqrt(distSq);
    if (dist === 0) {
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

function pointVsAABB(px: number, pz: number, box: AABB): boolean {
  return px >= box.minX && px <= box.maxX && pz >= box.minZ && pz <= box.maxZ;
}

export function resolveTerrainCollision(x: number, z: number, radius: number): { x: number; z: number } {
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

export function pointHitsTerrain(px: number, pz: number): boolean {
  const bounds = getBounds();
  for (const box of bounds) {
    if (pointVsAABB(px, pz, box)) return true;
  }
  return false;
}

export function resolveMovementCollision(x: number, z: number, radius: number): { x: number; z: number; wasDeflected: boolean } {
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

export function pointInPit(px: number, pz: number): boolean {
  const pits = getPits();
  for (const pit of pits) {
    if (px >= pit.minX && px <= pit.maxX && pz >= pit.minZ && pz <= pit.maxZ) {
      return true;
    }
  }
  return false;
}

export function checkPitFalls(gameState: GameState): void {
  const playerPos = getPlayerPos();

  if (!isPlayerDashing() && !isPlayerInvincible()) {
    if (pointInPit(playerPos.x, playerPos.z)) {
      gameState.playerHealth = 0;
      gameState.phase = 'gameOver';
      screenShake(5, 200);
      spawnDamageNumber(playerPos.x, playerPos.z, 'FELL!', '#ff4466');
    }
  }

  for (const enemy of gameState.enemies) {
    if (enemy.health <= 0) continue;
    if ((enemy as any).isLeaping) continue;
    if (pointInPit(enemy.pos.x, enemy.pos.z)) {
      spawnPitFallGhost(enemy);
      createAoeRing(enemy.pos.x, enemy.pos.z, 2.5, 500, 0x8844ff);

      enemy.health = 0;
      (enemy as any).fellInPit = true;
      enemy.stunTimer = 9999;
      spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'FELL!', '#8844ff');
      screenShake(4, 200);
    }
  }
}

function applyDamageToEnemy(enemy: Enemy, damage: number, gameState: GameState): void {
  if ((enemy as any).shieldActive && (enemy as any).shieldHealth > 0) {
    (enemy as any).shieldHealth -= damage;
    if ((enemy as any).shieldHealth <= 0) {
      const overkill = -(enemy as any).shieldHealth;
      (enemy as any).shieldHealth = 0;
      (enemy as any).shieldActive = false;
      onShieldBreak(enemy, gameState);
      if (overkill > 0) {
        enemy.health -= overkill;
      }
    }
  } else {
    enemy.health -= damage;
  }
  // Trigger squash/bounce hit reaction
  if ((enemy as any).hitReaction) {
    triggerHitReaction((enemy as any).hitReaction);
  }
}

function onShieldBreak(enemy: Enemy, gameState: GameState): void {
  const shieldCfg = enemy.config.shield;
  if (!shieldCfg) return;

  if ((enemy as any).shieldMesh) {
    (enemy as any).shieldMesh.visible = false;
    (enemy as any).mesh.remove((enemy as any).shieldMesh);
    (enemy as any).shieldMesh.material.dispose();
    (enemy as any).shieldMesh = null;
  }

  stunEnemy(enemy, shieldCfg.stunDuration);
  spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'BREAK', '#88eeff');

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

  (enemy as any).knockbackResist = 0;

  if ((enemy as any).bodyMesh) {
    (enemy as any).bodyMesh.material.transparent = true;
    (enemy as any).bodyMesh.material.opacity = 0.5;
  }
  if ((enemy as any).headMesh) {
    (enemy as any).headMesh.material.transparent = true;
    (enemy as any).headMesh.material.opacity = 0.5;
  }

  screenShake(4, 200);
}

export function checkCollisions(gameState: GameState): void {
  const playerPos = getPlayerPos();
  const playerR = PLAYER.size.radius;

  if (!isPlayerDashing()) {
    const resolved = resolveMovementCollision(playerPos.x, playerPos.z, playerR);
    playerPos.x = resolved.x;
    playerPos.z = resolved.z;
  }

  for (const enemy of gameState.enemies) {
    if ((enemy as any).isLeaping) continue;
    const resolved = resolveMovementCollision(enemy.pos.x, enemy.pos.z, enemy.config.size.radius);
    enemy.pos.x = resolved.x;
    enemy.pos.z = resolved.z;
    (enemy as any).wasDeflected = resolved.wasDeflected;
    (enemy as any).mesh.position.copy(enemy.pos);
  }

  const playerProj = getPlayerProjectiles();
  for (let i = playerProj.length - 1; i >= 0; i--) {
    const p = playerProj[i];
    if (!p.mesh.visible) continue;

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
        const wasShielded = (enemy as any).shieldActive;
        applyDamageToEnemy(enemy, p.damage, gameState);
        releaseProjectile(p);

        const dmgColor = wasShielded ? '#88eeff' : '#44ff88';
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, p.damage, dmgColor);

        enemy.flashTimer = 80;
        (enemy as any).bodyMesh.material.emissive.setHex(0xffffff);
        if ((enemy as any).headMesh) (enemy as any).headMesh.material.emissive.setHex(0xffffff);

        break;
      }
    }
  }

  const enemyProj = getEnemyProjectiles();
  for (let i = enemyProj.length - 1; i >= 0; i--) {
    const p = enemyProj[i];
    if (!p.mesh.visible) continue;

    if (pointHitsTerrain(p.mesh.position.x, p.mesh.position.z)) {
      releaseProjectile(p);
      continue;
    }

    if (!isPlayerInvincible()) {
      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      const hitR = playerR + 0.1;

      if (distSq < hitR * hitR) {
        gameState.playerHealth -= p.damage;
        releaseProjectile(p);
        screenShake(3, 100);

        spawnDamageNumber(playerPos.x, playerPos.z, p.damage, '#ff4466');

        if (gameState.playerHealth <= 0) {
          gameState.playerHealth = 0;
          gameState.phase = 'gameOver';
        }
        break;
      }
    }
  }

  if (!isPlayerInvincible()) {
    const now = performance.now();
    for (const enemy of gameState.enemies) {
      if (enemy.behavior === 'kite') continue;
      if (enemy.stunTimer > 0) continue;

      const dx = enemy.pos.x - playerPos.x;
      const dz = enemy.pos.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      const hitR = playerR + enemy.config.size.radius;

      if (distSq < hitR * hitR) {
        const attackCooldown = enemy.config.attackRate || 1000;
        if (now - (enemy as any).lastAttackTime > attackCooldown) {
          const chargeMult = (enemy.config.tank && enemy.config.tank.chargeDamageMult) || 1.5;
          const dmg = (enemy as any).isCharging ? enemy.config.damage * chargeMult : enemy.config.damage;
          gameState.playerHealth -= dmg;
          (enemy as any).lastAttackTime = now;
          screenShake((enemy as any).isCharging ? 5 : 2, (enemy as any).isCharging ? 150 : 80);

          spawnDamageNumber(playerPos.x, playerPos.z, dmg, '#ff4466');

          if (gameState.playerHealth <= 0) {
            gameState.playerHealth = 0;
            gameState.phase = 'gameOver';
          }
        }
      }
    }
  }

  const pushEvt = consumePushEvent();
  if (pushEvt) {
    const dirX = pushEvt.dirX;
    const dirZ = pushEvt.dirZ;
    for (const enemy of gameState.enemies) {
      if (enemy.health <= 0) continue;
      if ((enemy as any).isLeaping) continue;
      const enemyRadius = enemy.config.size.radius;
      if (isInRotatedRect(enemy.pos.x, enemy.pos.z, pushEvt.x, pushEvt.z,
                           pushEvt.width, pushEvt.length, pushEvt.rotation, enemyRadius)) {
        const oldX = enemy.pos.x;
        const oldZ = enemy.pos.z;

        const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
        const kbMult = 1 - ((enemy as any).knockbackResist ?? enemy.config.knockbackResist ?? 0);
        const kbDist = pushEvt.force * kbMult * iceEffects.knockbackMult;
        enemy.pos.x += dirX * kbDist;
        enemy.pos.z += dirZ * kbDist;
        (enemy as any).mesh.position.copy(enemy.pos);

        spawnPushGhosts(enemy, oldX, oldZ, enemy.pos.x, enemy.pos.z);

        enemy.flashTimer = 100;
        (enemy as any).bodyMesh.material.emissive.setHex(0x44ffaa);
        if ((enemy as any).headMesh) (enemy as any).headMesh.material.emissive.setHex(0x44ffaa);

        spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'PUSH', '#44ffaa');
      }
    }
  }

  if (pushEvt) {
    for (const enemy of gameState.enemies) {
      if ((enemy as any).isLeaping) continue;
      const resolved = resolveTerrainCollision(enemy.pos.x, enemy.pos.z, enemy.config.size.radius);
      enemy.pos.x = resolved.x;
      enemy.pos.z = resolved.z;
      (enemy as any).mesh.position.copy(enemy.pos);
    }
  }
}
