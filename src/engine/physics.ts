import { getPlayerPos, isPlayerInvincible, isPlayerDashing, consumePushEvent, isMeleeSwinging, getMeleeSwingDir, getMeleeHitEnemies } from '../entities/player';
import { getLaunchedEntry } from './aerialVerbs';
import { getPlayerProjectiles, getEnemyProjectiles, releaseProjectile } from '../entities/projectile';
import { stunEnemy } from '../entities/enemy';
import { getIceEffects } from '../entities/mortarProjectile';
import { triggerHitReaction } from '../entities/enemyRig';
import { emit } from './events';
import { getCurrentRoom } from './roomManager';
import { screenShake, getScene } from './renderer';
import { PLAYER, MELEE } from '../config/player';
import { PHYSICS } from '../config/physics';
import { getGroundHeight } from '../config/terrain';
import { isInMeleeArc } from './meleemath';
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

export function getBounds(): AABB[] {
  if (!collisionBounds) collisionBounds = getCollisionBounds();
  return collisionBounds;
}

export function getPits(): AABB[] {
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

export function resolveTerrainCollision(x: number, z: number, radius: number, entityY = 0): { x: number; z: number } {
  const bounds = getBounds();
  let rx = x, rz = z;
  for (const box of bounds) {
    if (box.maxY !== undefined && entityY >= box.maxY) continue;
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

export function resolveMovementCollision(x: number, z: number, radius: number, entityY = 0): { x: number; z: number; wasDeflected: boolean } {
  const bounds = getMoveBounds();
  let rx = x, rz = z;
  let wasDeflected = false;
  for (const box of bounds) {
    if (box.maxY !== undefined && entityY >= box.maxY) continue;
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
      wasDeflected = true;
    }
  }
  return { x: rx, z: rz, wasDeflected };
}

// Enhanced terrain collision that returns wall normal info (for wall slam detection)
interface CollisionResult {
  x: number;
  z: number;
  hitWall: boolean;
  normalX: number;
  normalZ: number;
}

function resolveTerrainCollisionEx(x: number, z: number, radius: number, entityY = 0): CollisionResult {
  const bounds = getBounds();
  let rx = x, rz = z;
  let hitWall = false;
  let totalNX = 0, totalNZ = 0;

  for (const box of bounds) {
    if (box.maxY !== undefined && entityY >= box.maxY) continue;
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
      hitWall = true;
      // Accumulate push direction as wall normal
      const len = Math.sqrt(push.x * push.x + push.z * push.z);
      if (len > 0.001) {
        totalNX += push.x / len;
        totalNZ += push.z / len;
      }
    }
  }

  // Normalize accumulated normal
  const nLen = Math.sqrt(totalNX * totalNX + totalNZ * totalNZ);
  if (nLen > 0.001) {
    totalNX /= nLen;
    totalNZ /= nLen;
  }

  return { x: rx, z: rz, hitWall, normalX: totalNX, normalZ: totalNZ };
}

// ─── Velocity Integration + Wall Slam ───

export function applyVelocities(dt: number, gameState: GameState): void {
  for (const enemy of gameState.enemies) {
    if (enemy.health <= 0) continue;
    if ((enemy as any).isLeaping) continue;
    if ((enemy as any).isCarrierPayload) continue;

    const vel = (enemy as any).vel;
    if (!vel) continue;

    // Ensure vel.y exists (backwards compat with old enemy data)
    if (vel.y === undefined) vel.y = 0;

    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const hasXZVelocity = speed >= PHYSICS.minVelocity;

    if (!hasXZVelocity && vel.y === 0 && enemy.pos.y <= PHYSICS.groundEpsilon) {
      vel.x = 0;
      vel.z = 0;
      continue;
    }

    // ─── XZ Movement (stepped to prevent wall tunneling) ───
    if (hasXZVelocity) {
      const moveDist = speed * dt;
      const enemyRadius = enemy.config.size.radius;
      const moveSteps = Math.ceil(moveDist / enemyRadius);
      const subDt = dt / Math.max(moveSteps, 1);

      let fellInPit = false;
      let result: CollisionResult = { x: enemy.pos.x, z: enemy.pos.z, hitWall: false, normalX: 0, normalZ: 0 };

      for (let s = 0; s < moveSteps; s++) {
        enemy.pos.x += vel.x * subDt;
        enemy.pos.z += vel.z * subDt;

        // Check for pit fall (only if grounded — airborne enemies fly over pits)
        const isGrounded = enemy.pos.y <= PHYSICS.groundEpsilon;
        if (isGrounded && pointInPit(enemy.pos.x, enemy.pos.z)) {
          fellInPit = true;
          break;
        }

        result = resolveTerrainCollisionEx(enemy.pos.x, enemy.pos.z, enemyRadius, enemy.pos.y);
        enemy.pos.x = result.x;
        enemy.pos.z = result.z;
        if (result.hitWall) break; // Stop stepping on wall hit — wall slam will handle the rest
      }

      // Pit fall — enemy was knocked into a pit by velocity
      if (fellInPit) {
        spawnPitFallGhost(enemy);
        emit({ type: 'pitFall', position: { x: enemy.pos.x, z: enemy.pos.z }, isPlayer: false });
        createAoeRing(enemy.pos.x, enemy.pos.z, 2.5, 500, 0x8844ff);
        enemy.health = 0;
        (enemy as any).fellInPit = true;
        enemy.stunTimer = 9999;
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'FELL!', '#8844ff');
        screenShake(4, 200);
        vel.x = 0;
        vel.y = 0;
        vel.z = 0;
        continue; // Skip wall slam + friction — enemy is gone
      }

      // Wall slam detection
      if (result.hitWall && speed > PHYSICS.wallSlamMinSpeed) {
        const room = getCurrentRoom();
        const wallSlamEnabled = room?.enableWallSlamDamage ?? true;

        if (wallSlamEnabled) {
          const slamDamage = Math.round((speed - PHYSICS.wallSlamMinSpeed) * PHYSICS.wallSlamDamage);
          applyDamageToEnemy(enemy, slamDamage, gameState);
          stunEnemy(enemy, PHYSICS.wallSlamStun);

          // Feedback
          emit({ type: 'wallSlam', enemy, speed, damage: slamDamage, position: { x: enemy.pos.x, z: enemy.pos.z } });
          spawnDamageNumber(enemy.pos.x, enemy.pos.z, slamDamage, '#ff8844');
          screenShake(PHYSICS.wallSlamShake, 120);

          // Flash enemy
          enemy.flashTimer = 120;
          if ((enemy as any).bodyMesh) (enemy as any).bodyMesh.material.emissive.setHex(0xff8844);
          if ((enemy as any).headMesh) (enemy as any).headMesh.material.emissive.setHex(0xff8844);

          // Impact ring at slam point (terrain flash)
          createAoeRing(enemy.pos.x, enemy.pos.z, 1.5, 300, 0xff8844);
        }

        // Reflect velocity off wall normal (always — physics still works, just no damage)
        const dot = vel.x * result.normalX + vel.z * result.normalZ;
        vel.x = (vel.x - 2 * dot * result.normalX) * PHYSICS.wallSlamBounce;
        vel.z = (vel.z - 2 * dot * result.normalZ) * PHYSICS.wallSlamBounce;
      }
    } else {
      vel.x = 0;
      vel.z = 0;
    }

    // ─── Y-axis Integration (gravity + ground clamping) ───
    const launchedEntry = getLaunchedEntry(enemy);
    const gravMult = launchedEntry?.gravityMult ?? 1;
    if (enemy.pos.y > PHYSICS.groundEpsilon || vel.y > 0) {
      // Apply Y velocity
      enemy.pos.y += vel.y * dt;
      // Apply gravity (scaled by launch registry override)
      vel.y -= PHYSICS.gravity * gravMult * dt;
      vel.y = Math.max(vel.y, -PHYSICS.terminalVelocity);
    }

    // Ground clamping
    const groundHeight = getGroundHeight(enemy.pos.x, enemy.pos.z);
    if (enemy.pos.y < groundHeight) {
      enemy.pos.y = groundHeight;
      vel.y = 0;
    }

    // Sync mesh position (includes Y now)
    (enemy as any).mesh.position.copy(enemy.pos);

    // Apply XZ friction only when grounded (airborne = no XZ friction)
    const isGroundedNow = enemy.pos.y <= groundHeight + PHYSICS.groundEpsilon;
    if (isGroundedNow && speed >= PHYSICS.minVelocity) {
      const newSpeed = speed - PHYSICS.friction * dt;
      if (newSpeed <= PHYSICS.minVelocity) {
        vel.x = 0;
        vel.z = 0;
      } else {
        const scale = newSpeed / speed;
        vel.x *= scale;
        vel.z *= scale;
      }
    }
  }
}

// ─── PhysicsObject Velocity Integration ───

export function applyObjectVelocities(dt: number, gameState: GameState): void {
  for (const obj of gameState.physicsObjects) {
    if (obj.destroyed) continue;
    if (obj.suspended) continue;

    const vel = obj.vel;
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (speed < PHYSICS.minVelocity) {
      vel.x = 0;
      vel.z = 0;
      continue;
    }

    // Stepped movement to prevent wall tunneling
    const moveDist = speed * dt;
    const moveSteps = Math.ceil(moveDist / obj.radius);
    const subDt = dt / Math.max(moveSteps, 1);
    let result: CollisionResult = { x: obj.pos.x, z: obj.pos.z, hitWall: false, normalX: 0, normalZ: 0 };

    let fellInPit = false;
    for (let s = 0; s < moveSteps; s++) {
      obj.pos.x += vel.x * subDt;
      obj.pos.z += vel.z * subDt;

      if (pointInPit(obj.pos.x, obj.pos.z)) {
        fellInPit = true;
        break;
      }

      result = resolveTerrainCollisionEx(obj.pos.x, obj.pos.z, obj.radius);
      obj.pos.x = result.x;
      obj.pos.z = result.z;

      if (result.hitWall) {
        // Slide along wall: remove velocity component into the wall normal
        const dot = vel.x * result.normalX + vel.z * result.normalZ;
        if (dot < 0) {
          vel.x -= dot * result.normalX;
          vel.z -= dot * result.normalZ;
        }
        const slideSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        if (slideSpeed < PHYSICS.minVelocity) break;
      }

      // Check collision with other physics objects during stepping.
      // This prevents a fast-moving object from tunneling through another.
      let hitObject = false;
      for (const other of gameState.physicsObjects) {
        if (other === obj || other.destroyed) continue;
        const odx = obj.pos.x - other.pos.x;
        const odz = obj.pos.z - other.pos.z;
        const oDistSq = odx * odx + odz * odz;
        const oMinDist = obj.radius + other.radius;
        if (oDistSq < oMinDist * oMinDist && oDistSq > 0.0001) {
          // Push this object back out and stop stepping
          const oDist = Math.sqrt(oDistSq);
          const oOverlap = oMinDist - oDist;
          const onx = odx / oDist;
          const onz = odz / oDist;
          obj.pos.x += onx * oOverlap;
          obj.pos.z += onz * oOverlap;

          // Remove velocity component into the other object
          const vDot = vel.x * (-onx) + vel.z * (-onz);
          if (vDot > 0) {
            vel.x += vDot * onx;
            vel.z += vDot * onz;
          }
          hitObject = true;
          break;
        }
      }
      if (hitObject) break;
    }

    // Sync mesh position
    if (obj.mesh) {
      obj.mesh.position.set(obj.pos.x, 0, obj.pos.z);
    }

    // Pit fall
    if (fellInPit) {
      obj.destroyed = true;
      obj.fellInPit = true;
      emit({ type: 'objectPitFall', object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
      if (obj.mesh) obj.mesh.visible = false;
      vel.x = 0;
      vel.z = 0;
      continue;
    }

    // Wall slam — uses original speed (before wall slide) for damage calculation
    if (result.hitWall && speed > PHYSICS.objectWallSlamMinSpeed) {
      const slamDamage = Math.round((speed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage);

      // Damage the object itself (skip if indestructible)
      if (isFinite(obj.health)) {
        obj.health -= slamDamage;
        if (obj.health <= 0) {
          obj.health = 0;
          obj.destroyed = true;
          if (obj.mesh) obj.mesh.visible = false;
          emit({ type: 'objectDestroyed', object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
        }
      }

      emit({ type: 'objectWallSlam', object: obj, speed, damage: slamDamage, position: { x: obj.pos.x, z: obj.pos.z } });
      screenShake(PHYSICS.objectWallSlamShake, 120);

      // Apply bounce damping to remaining (slid) velocity — energy is lost on wall impact
      const bounce = obj.restitution ?? PHYSICS.objectWallSlamBounce;
      vel.x *= bounce;
      vel.z *= bounce;
    }

    // Friction — based on current velocity (may have been modified by wall slide/bounce)
    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    if (currentSpeed > PHYSICS.minVelocity) {
      const newSpeed = currentSpeed - PHYSICS.objectFriction * dt;
      if (newSpeed <= PHYSICS.minVelocity) {
        vel.x = 0;
        vel.z = 0;
      } else {
        const scale = newSpeed / currentSpeed;
        vel.x *= scale;
        vel.z *= scale;
      }
    } else {
      vel.x = 0;
      vel.z = 0;
    }
  }
}

// ─── Enemy-Enemy Collision + Momentum Transfer ───

export function resolveEnemyCollisions(gameState: GameState): void {
  const enemies = gameState.enemies;
  const len = enemies.length;

  for (let i = 0; i < len; i++) {
    const a = enemies[i];
    if (a.health <= 0) continue;
    if ((a as any).isLeaping) continue;
    if ((a as any).isCarrierPayload) continue;
    // Skip airborne enemies from XZ collision resolution
    if (a.pos.y > PHYSICS.groundEpsilon) continue;

    for (let j = i + 1; j < len; j++) {
      const b = enemies[j];
      if (b.health <= 0) continue;
      if ((b as any).isLeaping) continue;
      // Skip airborne enemies from XZ collision resolution
      if (b.pos.y > PHYSICS.groundEpsilon) continue;

      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const distSq = dx * dx + dz * dz;
      const radA = a.config.size.radius;
      const radB = b.config.size.radius;
      const minDist = radA + radB;

      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq);
      if (dist < 0.01) continue; // degenerate overlap

      const overlap = minDist - dist;
      const nx = dx / dist;
      const nz = dz / dist;

      // Mass-weighted separation
      const massA = a.config.mass ?? 1.0;
      const massB = b.config.mass ?? 1.0;
      const totalMass = massA + massB;
      const ratioA = massB / totalMass; // lighter = moves more
      const ratioB = massA / totalMass;

      // Push apart
      a.pos.x -= nx * overlap * ratioA;
      a.pos.z -= nz * overlap * ratioA;
      b.pos.x += nx * overlap * ratioB;
      b.pos.z += nz * overlap * ratioB;

      // Momentum transfer (only if at least one has velocity)
      const velA = (a as any).vel;
      const velB = (b as any).vel;
      if (!velA || !velB) continue;

      const relVelX = velA.x - velB.x;
      const relVelZ = velA.z - velB.z;
      const relVelDotN = relVelX * nx + relVelZ * nz;

      if (relVelDotN <= 0) continue; // moving apart, skip

      // 2D elastic collision with restitution
      const e = PHYSICS.enemyBounce;
      const impulse = (1 + e) * relVelDotN / totalMass;

      velA.x -= impulse * massB * nx;
      velA.z -= impulse * massB * nz;
      velB.x += impulse * massA * nx;
      velB.z += impulse * massA * nz;

      // Impact damage (if relative speed above threshold)
      const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);
      const room = getCurrentRoom();
      const collisionDmgEnabled = room?.enableEnemyCollisionDamage ?? true;
      if (collisionDmgEnabled && relSpeed > PHYSICS.impactMinSpeed) {
        const dmg = Math.round((relSpeed - PHYSICS.impactMinSpeed) * PHYSICS.impactDamage);
        const midX = (a.pos.x + b.pos.x) / 2;
        const midZ = (a.pos.z + b.pos.z) / 2;

        // Lighter enemy takes more damage
        const dmgA = Math.round(dmg * ratioA);
        const dmgB = Math.round(dmg * ratioB);

        if (dmgA > 0) {
          applyDamageToEnemy(a, dmgA, gameState);
          a.flashTimer = 100;
          if ((a as any).bodyMesh) (a as any).bodyMesh.material.emissive.setHex(0xffaa44);
          if ((a as any).headMesh) (a as any).headMesh.material.emissive.setHex(0xffaa44);
        }
        if (dmgB > 0) {
          applyDamageToEnemy(b, dmgB, gameState);
          b.flashTimer = 100;
          if ((b as any).bodyMesh) (b as any).bodyMesh.material.emissive.setHex(0xffaa44);
          if ((b as any).headMesh) (b as any).headMesh.material.emissive.setHex(0xffaa44);
        }

        stunEnemy(a, PHYSICS.impactStun);
        stunEnemy(b, PHYSICS.impactStun);

        spawnDamageNumber(midX, midZ, dmg, '#ffaa44');
        screenShake(2, 80);

        emit({
          type: 'enemyImpact',
          enemyA: a, enemyB: b,
          speed: relSpeed, damage: dmg,
          position: { x: midX, z: midZ }
        });
      }

      // Sync mesh positions
      (a as any).mesh.position.copy(a.pos);
      (b as any).mesh.position.copy(b.pos);
    }
  }
}

// ─── PhysicsObject Collisions (Object-Object + Object-Enemy) ───

export function resolveObjectCollisions(gameState: GameState): void {
  const objects = gameState.physicsObjects;
  const enemies = gameState.enemies;

  // Object-Object collisions — run multiple iterations to handle chain/wall cases
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < objects.length; i++) {
      const a = objects[i];
      if (a.destroyed) continue;
      if (a.suspended) continue;

      for (let j = i + 1; j < objects.length; j++) {
        const b = objects[j];
        if (b.destroyed) continue;
        if (b.suspended) continue;

        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const distSq = dx * dx + dz * dz;
        const minDist = a.radius + b.radius;

        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(distSq);
        if (dist < 0.01) continue;

        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // Check which objects are terrain-blocked (can't move in separation direction)
        const aTerrainCheck = resolveTerrainCollisionEx(
          a.pos.x - nx * 0.05, a.pos.z - nz * 0.05, a.radius);
        const bTerrainCheck = resolveTerrainCollisionEx(
          b.pos.x + nx * 0.05, b.pos.z + nz * 0.05, b.radius);
        const aBlocked = aTerrainCheck.hitWall;
        const bBlocked = bTerrainCheck.hitWall;

        // Distribute separation: blocked objects get 0 share
        let ratioA: number, ratioB: number;
        if (aBlocked && !bBlocked) {
          ratioA = 0; ratioB = 1;
        } else if (!aBlocked && bBlocked) {
          ratioA = 1; ratioB = 0;
        } else {
          const totalMass = a.mass + b.mass;
          ratioA = b.mass / totalMass;
          ratioB = a.mass / totalMass;
        }

        a.pos.x -= nx * overlap * ratioA;
        a.pos.z -= nz * overlap * ratioA;
        b.pos.x += nx * overlap * ratioB;
        b.pos.z += nz * overlap * ratioB;

        // Momentum transfer (only on first iteration to avoid double-counting)
        if (iter === 0) {
          const totalMass = a.mass + b.mass;
          const relVelX = a.vel.x - b.vel.x;
          const relVelZ = a.vel.z - b.vel.z;
          const relVelDotN = relVelX * nx + relVelZ * nz;
          if (relVelDotN > 0) {
            const e = PHYSICS.objectWallSlamBounce;
            const impulse = (1 + e) * relVelDotN / totalMass;

            a.vel.x -= impulse * b.mass * nx;
            a.vel.z -= impulse * b.mass * nz;
            b.vel.x += impulse * a.mass * nx;
            b.vel.z += impulse * a.mass * nz;
          }
        }

        // Sync meshes
        if (a.mesh) a.mesh.position.set(a.pos.x, 0, a.pos.z);
        if (b.mesh) b.mesh.position.set(b.pos.x, 0, b.pos.z);
      }
    }
  }

  // Object-Enemy collisions
  for (const obj of objects) {
    if (obj.destroyed) continue;
    if (obj.suspended) continue;

    for (const enemy of enemies) {
      if (enemy.health <= 0) continue;
      if ((enemy as any).isLeaping) continue;

      const dx = enemy.pos.x - obj.pos.x;
      const dz = enemy.pos.z - obj.pos.z;
      const distSq = dx * dx + dz * dz;
      const radObj = obj.radius;
      const radEnemy = enemy.config.size.radius;
      const minDist = radObj + radEnemy;

      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq);
      if (dist < 0.01) continue;

      const overlap = minDist - dist;
      const nx = dx / dist;
      const nz = dz / dist;

      const massObj = obj.mass;
      const massEnemy = enemy.config.mass ?? 1.0;
      const totalMass = massObj + massEnemy;
      const ratioObj = massEnemy / totalMass;
      const ratioEnemy = massObj / totalMass;

      // Separate
      obj.pos.x -= nx * overlap * ratioObj;
      obj.pos.z -= nz * overlap * ratioObj;
      enemy.pos.x += nx * overlap * ratioEnemy;
      enemy.pos.z += nz * overlap * ratioEnemy;

      // Momentum transfer
      const velEnemy = (enemy as any).vel;
      if (!velEnemy) continue;

      const relVelX = obj.vel.x - velEnemy.x;
      const relVelZ = obj.vel.z - velEnemy.z;
      const relVelDotN = relVelX * nx + relVelZ * nz;
      if (relVelDotN <= 0) continue;

      const e = obj.restitution ?? PHYSICS.enemyBounce;
      const impulse = (1 + e) * relVelDotN / totalMass;

      obj.vel.x -= impulse * massEnemy * nx;
      obj.vel.z -= impulse * massEnemy * nz;
      velEnemy.x += impulse * massObj * nx;
      velEnemy.z += impulse * massObj * nz;

      // Impact damage to enemy (if relative speed high enough)
      const relSpeed = Math.sqrt(relVelX * relVelX + relVelZ * relVelZ);
      if (relSpeed > PHYSICS.objectImpactMinSpeed) {
        const dmg = Math.round((relSpeed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
        if (dmg > 0) {
          applyDamageToEnemy(enemy, dmg, gameState);
          enemy.flashTimer = 100;
          if ((enemy as any).bodyMesh) (enemy as any).bodyMesh.material.emissive.setHex(0xffaa44);
          if ((enemy as any).headMesh) (enemy as any).headMesh.material.emissive.setHex(0xffaa44);
          spawnDamageNumber(enemy.pos.x, enemy.pos.z, dmg, '#ffaa44');
          screenShake(2, 80);

          emit({
            type: 'objectImpact',
            objectA: obj, objectB: enemy,
            speed: relSpeed, damage: dmg,
            position: { x: (obj.pos.x + enemy.pos.x) / 2, z: (obj.pos.z + enemy.pos.z) / 2 }
          });
        }
      }

      // Sync mesh positions
      if (obj.mesh) obj.mesh.position.set(obj.pos.x, 0, obj.pos.z);
      (enemy as any).mesh.position.copy(enemy.pos);
    }
  }
}

// ─── Physics Object Body Collisions ───
// Prevents player and enemies from walking through physics objects.
// Objects act as solid cylindrical blockers. The entity is always the one
// pushed out (objects only move via force push velocity, not body collision).

export function resolvePhysicsObjectBodyCollisions(gameState: GameState): void {
  const objects = gameState.physicsObjects;
  const playerPos = getPlayerPos();
  const playerR = PLAYER.size.radius;

  for (const obj of objects) {
    if (obj.destroyed) continue;
    if (obj.suspended) continue;

    // ─── Player vs Object ───
    const pdx = playerPos.x - obj.pos.x;
    const pdz = playerPos.z - obj.pos.z;
    const pDistSq = pdx * pdx + pdz * pdz;
    const pMinDist = playerR + obj.radius;

    if (pDistSq < pMinDist * pMinDist && pDistSq > 0.0001) {
      const pDist = Math.sqrt(pDistSq);
      const pOverlap = pMinDist - pDist;
      // Push player out entirely (object stays put)
      playerPos.x += (pdx / pDist) * pOverlap;
      playerPos.z += (pdz / pDist) * pOverlap;
    }

    // ─── Enemy vs Object ───
    for (const enemy of gameState.enemies) {
      if (enemy.health <= 0) continue;
      if ((enemy as any).isLeaping) continue;

      const edx = enemy.pos.x - obj.pos.x;
      const edz = enemy.pos.z - obj.pos.z;
      const eDistSq = edx * edx + edz * edz;
      const eRadEnemy = enemy.config.size.radius;
      const eMinDist = eRadEnemy + obj.radius;

      if (eDistSq < eMinDist * eMinDist && eDistSq > 0.0001) {
        const eDist = Math.sqrt(eDistSq);
        const eOverlap = eMinDist - eDist;
        // Push enemy out entirely (object stays put)
        enemy.pos.x += (edx / eDist) * eOverlap;
        enemy.pos.z += (edz / eDist) * eOverlap;
      }
    }
  }
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
      emit({ type: 'pitFall', position: { x: playerPos.x, z: playerPos.z }, isPlayer: true });
      spawnDamageNumber(playerPos.x, playerPos.z, 'FELL!', '#ff4466');
    }
  }

  for (const enemy of gameState.enemies) {
    if (enemy.health <= 0) continue;
    if ((enemy as any).isLeaping) continue;
    if (pointInPit(enemy.pos.x, enemy.pos.z)) {
      spawnPitFallGhost(enemy);
      emit({ type: 'pitFall', position: { x: enemy.pos.x, z: enemy.pos.z }, isPlayer: false });
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

  emit({ type: 'shieldBreak', enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });

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

function checkMeleeHits(gameState: GameState): void {
  if (!isMeleeSwinging()) return;

  const playerPos = getPlayerPos();
  const swingDir = getMeleeSwingDir();
  const hitEnemies = getMeleeHitEnemies();

  for (const enemy of gameState.enemies) {
    if (enemy.health <= 0) continue;
    if ((enemy as any).fellInPit) continue;
    if (hitEnemies.has(enemy)) continue; // already hit this swing

    if (!isInMeleeArc(playerPos.x, playerPos.z, swingDir, enemy.pos.x, enemy.pos.z, MELEE.range, MELEE.arc)) {
      continue;
    }

    // Hit!
    hitEnemies.add(enemy);

    const wasShielded = (enemy as any).shieldActive;
    applyDamageToEnemy(enemy, MELEE.damage, gameState);

    // No melee knockback — force push handles displacement.
    // Hit stun, flash, and screen shake remain for feedback.

    // Feedback
    emit({ type: 'enemyHit', enemy, damage: MELEE.damage, position: { x: enemy.pos.x, z: enemy.pos.z }, wasShielded });
    emit({ type: 'meleeHit', enemy, damage: MELEE.damage, position: { x: enemy.pos.x, z: enemy.pos.z } });

    const dmgColor = wasShielded ? '#88eeff' : '#ff8844';
    spawnDamageNumber(enemy.pos.x, enemy.pos.z, MELEE.damage, dmgColor);

    enemy.flashTimer = 100;
    (enemy as any).bodyMesh.material.emissive.setHex(0xffffff);
    if ((enemy as any).headMesh) (enemy as any).headMesh.material.emissive.setHex(0xffffff);

    screenShake(MELEE.screenShake, 80);
  }

}

export function checkCollisions(gameState: GameState): void {
  const playerPos = getPlayerPos();
  const playerR = PLAYER.size.radius;

  if (!isPlayerDashing()) {
    const resolved = resolveMovementCollision(playerPos.x, playerPos.z, playerR, playerPos.y);
    playerPos.x = resolved.x;
    playerPos.z = resolved.z;
  }

  for (const enemy of gameState.enemies) {
    if ((enemy as any).isLeaping) continue;
    if ((enemy as any).fellInPit) continue; // Don't push dead-in-pit enemies back out

    // Enemies with active velocity skip pit collision — they're allowed to be
    // knocked into pits. The pit fall is detected in applyVelocities().
    // Enemies walking under AI control still collide with pits as a safety net.
    const vel = (enemy as any).vel;
    const hasVelocity = vel && (vel.x * vel.x + vel.z * vel.z) > PHYSICS.minVelocity * PHYSICS.minVelocity;
    const bounds = hasVelocity ? getBounds() : getMoveBounds();
    let rx = enemy.pos.x, rz = enemy.pos.z;
    let wasDeflected = false;
    for (const box of bounds) {
      // Skip obstacles the enemy is above (airborne or on higher platform)
      if (box.maxY !== undefined && enemy.pos.y >= box.maxY) continue;
      const push = circleVsAABB(rx, rz, enemy.config.size.radius, box);
      if (push) {
        rx += push.x;
        rz += push.z;
        wasDeflected = true;
      }
    }
    enemy.pos.x = rx;
    enemy.pos.z = rz;
    (enemy as any).wasDeflected = wasDeflected;
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

        emit({ type: 'enemyHit', enemy, damage: p.damage, position: { x: enemy.pos.x, z: enemy.pos.z }, wasShielded });

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

        emit({ type: 'playerHit', damage: p.damage, position: { x: playerPos.x, z: playerPos.z } });
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
      if (enemy.config.melee) continue; // melee enemies use state machine, not contact damage
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

          emit({ type: 'playerHit', damage: dmg, position: { x: playerPos.x, z: playerPos.z } });
          spawnDamageNumber(playerPos.x, playerPos.z, dmg, '#ff4466');

          if (gameState.playerHealth <= 0) {
            gameState.playerHealth = 0;
            gameState.phase = 'gameOver';
          }
        }
      }
    }
  }

  // Melee hit detection
  checkMeleeHits(gameState);

  const pushEvt = consumePushEvent();
  if (pushEvt) {
    const dirX = pushEvt.dirX;
    const dirZ = pushEvt.dirZ;
    // Perpendicular direction (lateral axis in push-local space)
    const perpX = -dirZ;
    const perpZ = dirX;
    // Player position = rectangle center minus half-length along push direction
    const halfLen = pushEvt.length / 2;
    const playerX = pushEvt.x - dirX * halfLen;
    const playerZ = pushEvt.z - dirZ * halfLen;

    // 1. Collect all enemies AND physics objects in push rectangle
    const candidates: { enemy: any; obj: any; forward: number; lateral: number }[] = [];

    // Enemies
    for (const enemy of gameState.enemies) {
      if (enemy.health <= 0) continue;
      if ((enemy as any).isLeaping) continue;
      const enemyRadius = enemy.config.size.radius;
      if (isInRotatedRect(enemy.pos.x, enemy.pos.z, pushEvt.x, pushEvt.z,
                           pushEvt.width, pushEvt.length, pushEvt.rotation, enemyRadius)) {
        const dx = enemy.pos.x - playerX;
        const dz = enemy.pos.z - playerZ;
        const forward = dx * dirX + dz * dirZ;  // distance along push axis
        const lateral = dx * perpX + dz * perpZ; // offset perpendicular to push
        candidates.push({ enemy, obj: null, forward, lateral });
      }
    }

    // Physics objects
    for (const obj of gameState.physicsObjects) {
      if (obj.destroyed) continue;
      if (obj.suspended) continue;
      if (isInRotatedRect(obj.pos.x, obj.pos.z, pushEvt.x, pushEvt.z,
                           pushEvt.width, pushEvt.length, pushEvt.rotation, obj.radius)) {
        const dx = obj.pos.x - playerX;
        const dz = obj.pos.z - playerZ;
        const forward = dx * dirX + dz * dirZ;
        const lateral = dx * perpX + dz * perpZ;
        candidates.push({ enemy: null, obj, forward, lateral });
      }
    }

    // 2. Sort by forward distance (nearest to player first)
    candidates.sort((a, b) => a.forward - b.forward);

    // 3. Apply knockback with wave occlusion
    const pushedLaterals: number[] = [];
    const blockRadius = PHYSICS.pushWaveBlockRadius;

    for (const { enemy, obj, lateral } of candidates) {
      // Check if blocked by any already-pushed target
      let blocked = false;
      for (const pushedLat of pushedLaterals) {
        if (Math.abs(lateral - pushedLat) < blockRadius) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      if (enemy) {
        // Enemy push (existing behavior)
        const iceEffects = getIceEffects(enemy.pos.x, enemy.pos.z, false);
        const kbMult = 1 - ((enemy as any).knockbackResist ?? enemy.config.knockbackResist ?? 0);
        const kbDist = pushEvt.force * kbMult * iceEffects.knockbackMult;

        if (kbDist > 0) {
          const v0 = Math.sqrt(2 * PHYSICS.friction * kbDist);
          (enemy as any).vel.x = dirX * v0;
          (enemy as any).vel.z = dirZ * v0;
        }
        emit({ type: 'enemyPushed', enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });

        enemy.flashTimer = 100;
        (enemy as any).bodyMesh.material.emissive.setHex(0x44ffaa);
        if ((enemy as any).headMesh) (enemy as any).headMesh.material.emissive.setHex(0x44ffaa);

        spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'PUSH', '#44ffaa');
      } else if (obj) {
        // Object push: velocity = sqrt(2 * friction * (force / mass))
        const kbDist = pushEvt.force / obj.mass;
        if (kbDist > 0) {
          const v0 = Math.sqrt(2 * PHYSICS.objectFriction * kbDist);
          obj.vel.x = dirX * v0;
          obj.vel.z = dirZ * v0;

          // Nudge object off wall before velocity
          const nudgeResult = resolveTerrainCollisionEx(obj.pos.x, obj.pos.z, obj.radius);
          if (nudgeResult.hitWall) {
            obj.pos.x = nudgeResult.x + nudgeResult.normalX * 0.1;
            obj.pos.z = nudgeResult.z + nudgeResult.normalZ * 0.1;
            if (obj.mesh) obj.mesh.position.set(obj.pos.x, 0, obj.pos.z);
          }
        }
        emit({ type: 'objectPushed', object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
        spawnDamageNumber(obj.pos.x, obj.pos.z, 'PUSH', '#44ffaa');
      }

      pushedLaterals.push(lateral);
    }
  }

}
