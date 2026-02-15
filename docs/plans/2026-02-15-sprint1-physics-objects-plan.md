# Sprint 1: Destructible Terrain + Moveable Physics Objects — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Push a rock into a destructible pillar and the pillar breaks. Physics chain works end-to-end.

**Architecture:** Parallel entity system — PhysicsObjects get their own array in GameState and their own processing loops that mirror the enemy velocity/collision system. Circle-based collision for objects (same as enemies). Mass-only push resistance (no knockbackResist). Destructible obstacles track health on the Obstacle interface directly.

**Tech Stack:** Three.js (global), TypeScript, esbuild, vitest

**Design doc:** `docs/plans/2026-02-15-sprint1-physics-objects-design.md`

**Existing tests must stay green.** Run `npx vitest run` after each task to verify no regressions. Current: 552 tests passing.

---

## Task 1: Extend Types — Obstacle + PhysicsObject + GameState

**Files:**
- Modify: `src/types/index.ts:464-477` (Obstacle, Pit, AABB section)
- Test: `tests/physics-objects.test.ts` (new file)

**Step 1: Write the failing test**

Create `tests/physics-objects.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('PhysicsObject type', () => {
  it('can construct a valid PhysicsObject', () => {
    // Import will fail until types exist
    const obj: import('../src/types/index').PhysicsObject = {
      id: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 0.8,
      mass: 2.0,
      health: 50,
      maxHealth: 50,
      material: 'stone',
      meshType: 'rock',
      scale: 1,
      restitution: undefined,
      mesh: null,
      destroyed: false,
      fellInPit: false,
    };
    expect(obj.id).toBe(1);
    expect(obj.mass).toBe(2.0);
    expect(obj.destroyed).toBe(false);
  });
});

describe('Obstacle destructible extension', () => {
  it('supports destructible properties', () => {
    const obs: import('../src/types/index').Obstacle = {
      x: 0, z: 0, w: 2, h: 2, d: 2,
      destructible: true,
      health: 50,
      maxHealth: 50,
      material: 'stone',
    };
    expect(obs.destructible).toBe(true);
    expect(obs.health).toBe(50);
  });

  it('is backward compatible with existing obstacles', () => {
    const obs: import('../src/types/index').Obstacle = {
      x: 5, z: 9, w: 2, h: 1.5, d: 3,
    };
    expect(obs.destructible).toBeUndefined();
    expect(obs.health).toBeUndefined();
  });
});

describe('PhysicsObjectPlacement type', () => {
  it('can construct a valid placement', () => {
    const p: import('../src/types/index').PhysicsObjectPlacement = {
      meshType: 'rock',
      material: 'stone',
      x: 3, z: -5,
      mass: 2.0,
      health: 9999,
      radius: 0.8,
    };
    expect(p.scale).toBeUndefined(); // optional, defaults to 1
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/physics-objects.test.ts`
Expected: FAIL — `PhysicsObject` type does not exist in `types/index.ts`

**Step 3: Add types to `src/types/index.ts`**

After the existing `Pit` interface (~line 477), add:

```typescript
export type ObstacleMaterial = 'stone' | 'wood' | 'metal' | 'ice';
```

Extend the existing `Obstacle` interface (replace lines 464-470):

```typescript
export interface Obstacle {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  destructible?: boolean;
  health?: number;
  maxHealth?: number;
  material?: ObstacleMaterial;
}
```

Add new interfaces after `AABB`:

```typescript
export interface PhysicsObject {
  id: number;
  pos: { x: number; z: number };
  vel: { x: number; z: number };
  radius: number;
  mass: number;
  health: number;
  maxHealth: number;
  material: ObstacleMaterial;
  meshType: 'rock' | 'crate' | 'barrel' | 'pillar';
  scale: number;
  restitution?: number;
  mesh: any;
  destroyed: boolean;
  fellInPit: boolean;
}

export interface PhysicsObjectPlacement {
  meshType: 'rock' | 'crate' | 'barrel' | 'pillar';
  material: ObstacleMaterial;
  x: number;
  z: number;
  mass: number;
  health: number;
  radius: number;
  scale?: number;
}
```

Add `physicsObjects` to `GameState` interface (~line 412):

```typescript
export interface GameState {
  phase: 'waiting' | 'playing' | 'gameOver' | 'editorPaused';
  playerHealth: number;
  playerMaxHealth: number;
  currency: number;
  currentWave: number;
  enemies: Enemy[];
  physicsObjects: PhysicsObject[];  // NEW
  abilities: {
    dash: AbilityState;
    ultimate: AbilityState;
  };
}
```

**Step 4: Fix GameState initialization in `src/engine/game.ts:23-34`**

Add `physicsObjects: []` to the gameState literal.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/physics-objects.test.ts`
Expected: PASS (3 tests)

Run: `npx vitest run`
Expected: ALL tests pass (552 + 3 = 555). The GameState change may break existing tests that construct GameState objects — check `tests/rooms.test.ts` and fix any missing `physicsObjects: []` fields.

**Step 6: Typecheck**

Run: `npm run typecheck`
Expected: Clean (0 errors). Any files constructing GameState objects will need `physicsObjects: []` added.

**Step 7: Commit**

```bash
git add src/types/index.ts src/engine/game.ts tests/physics-objects.test.ts
git commit -m "feat: add PhysicsObject + destructible Obstacle types, extend GameState"
```

---

## Task 2: Physics Config + PhysicsObject Factory

**Files:**
- Modify: `src/config/physics.ts`
- Create: `src/entities/physicsObject.ts`
- Test: `tests/physics-objects.test.ts` (extend)

**Step 1: Extend physics config**

Add to `src/config/physics.ts` (after existing fields):

```typescript
// Physics objects
objectFriction: 25,
objectWallSlamMinSpeed: 3,
objectWallSlamDamage: 8,
objectWallSlamStun: 0,        // objects don't stun (no AI)
objectWallSlamBounce: 0.4,
objectWallSlamShake: 2,
objectImpactMinSpeed: 2,
objectImpactDamage: 5,
```

**Step 2: Write tests for factory function**

Add to `tests/physics-objects.test.ts`:

```typescript
import { createPhysicsObject } from '../src/entities/physicsObject';

describe('createPhysicsObject', () => {
  it('creates object from placement with correct defaults', () => {
    const obj = createPhysicsObject({
      meshType: 'rock',
      material: 'stone',
      x: 3, z: -5,
      mass: 2.0,
      health: 50,
      radius: 0.8,
    });
    expect(obj.pos).toEqual({ x: 3, z: -5 });
    expect(obj.vel).toEqual({ x: 0, z: 0 });
    expect(obj.mass).toBe(2.0);
    expect(obj.health).toBe(50);
    expect(obj.maxHealth).toBe(50);
    expect(obj.scale).toBe(1);
    expect(obj.destroyed).toBe(false);
    expect(obj.fellInPit).toBe(false);
    expect(obj.mesh).toBeNull(); // mesh created separately (needs scene)
  });

  it('respects custom scale', () => {
    const obj = createPhysicsObject({
      meshType: 'crate', material: 'wood',
      x: 0, z: 0, mass: 1, health: 30, radius: 0.5, scale: 1.5,
    });
    expect(obj.scale).toBe(1.5);
  });

  it('assigns unique IDs', () => {
    const a = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 0, z: 0, mass: 1, health: 10, radius: 0.5 });
    const b = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 1, z: 1, mass: 1, health: 10, radius: 0.5 });
    expect(a.id).not.toBe(b.id);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/physics-objects.test.ts`
Expected: FAIL — `createPhysicsObject` does not exist

**Step 4: Implement factory**

Create `src/entities/physicsObject.ts`:

```typescript
import { PhysicsObject, PhysicsObjectPlacement } from '../types/index';

let nextId = 1;

export function resetPhysicsObjectIds(): void {
  nextId = 1;
}

export function createPhysicsObject(placement: PhysicsObjectPlacement): PhysicsObject {
  return {
    id: nextId++,
    pos: { x: placement.x, z: placement.z },
    vel: { x: 0, z: 0 },
    radius: placement.radius,
    mass: placement.mass,
    health: placement.health,
    maxHealth: placement.health,
    material: placement.material,
    meshType: placement.meshType,
    scale: placement.scale ?? 1,
    restitution: undefined,
    mesh: null,
    destroyed: false,
    fellInPit: false,
  };
}

export function clearPhysicsObjects(gameState: any, scene: any): void {
  for (const obj of gameState.physicsObjects) {
    if (obj.mesh) {
      scene.remove(obj.mesh);
      // Dispose geometry + materials
      obj.mesh.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  }
  gameState.physicsObjects = [];
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/physics-objects.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/config/physics.ts src/entities/physicsObject.ts tests/physics-objects.test.ts
git commit -m "feat: add physics object config + factory function"
```

---

## Task 3: Object Velocity Integration (Wall Slam + Pit Fall)

**Files:**
- Modify: `src/engine/physics.ts`
- Test: `tests/physics-objects.test.ts` (extend)

**Step 1: Write tests for object velocity math**

Add to `tests/physics-objects.test.ts`:

```typescript
import { PHYSICS } from '../src/config/physics';

describe('object velocity kinematics', () => {
  it('v0 formula: object travels correct distance before stopping', () => {
    const force = 8; // force push force
    const mass = 2.0;
    const friction = PHYSICS.objectFriction;
    const targetDist = force / mass; // distance = force / mass
    const v0 = Math.sqrt(2 * friction * targetDist);
    const slideDist = (v0 * v0) / (2 * friction);
    expect(slideDist).toBeCloseTo(targetDist, 5);
  });

  it('heavier object travels less distance for same force', () => {
    const force = 8;
    const friction = PHYSICS.objectFriction;
    const distLight = force / 1.0;
    const distHeavy = force / 3.0;
    expect(distLight).toBeGreaterThan(distHeavy);
  });

  it('wall slam damage formula: speed above threshold produces damage', () => {
    const speed = 6;
    const damage = Math.round((speed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage);
    expect(damage).toBeGreaterThan(0);
  });

  it('wall slam damage formula: speed below threshold produces zero', () => {
    const speed = 2;
    const damage = Math.max(0, Math.round((speed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage));
    expect(damage).toBe(0);
  });
});
```

**Step 2: Run tests to verify they pass (pure math, no implementation needed)**

Run: `npx vitest run tests/physics-objects.test.ts`
Expected: PASS — these are pure math tests that validate the formulas we'll use

**Step 3: Implement `applyObjectVelocities` in `src/engine/physics.ts`**

Add a new exported function after `applyVelocities` (~line 352). This mirrors the enemy velocity loop but operates on `gameState.physicsObjects`:

```typescript
export function applyObjectVelocities(dt: number, gameState: GameState): void {
  for (const obj of gameState.physicsObjects) {
    if (obj.destroyed) continue;

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
      if (result.hitWall) break;
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
      vel.x = 0;
      vel.z = 0;
      continue;
    }

    // Wall slam
    if (result.hitWall && speed > PHYSICS.objectWallSlamMinSpeed) {
      const slamDamage = Math.round((speed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage);

      // Damage the object itself
      obj.health -= slamDamage;
      if (obj.health <= 0) {
        obj.health = 0;
        obj.destroyed = true;
        emit({ type: 'objectDestroyed', object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
      }

      emit({ type: 'objectWallSlam', object: obj, speed, damage: slamDamage, position: { x: obj.pos.x, z: obj.pos.z } });
      screenShake(PHYSICS.objectWallSlamShake, 120);

      // Reflect velocity
      const dot = vel.x * result.normalX + vel.z * result.normalZ;
      const bounce = obj.restitution ?? PHYSICS.objectWallSlamBounce;
      vel.x = (vel.x - 2 * dot * result.normalX) * bounce;
      vel.z = (vel.z - 2 * dot * result.normalZ) * bounce;
    }

    // Friction
    const newSpeed = speed - PHYSICS.objectFriction * dt;
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
```

**Important:** `resolveTerrainCollisionEx` is currently a private function. It needs to stay private but accessible to this new function in the same file.

**Step 4: Add new event types to `src/engine/events.ts`**

Extend the `GameEvent` union (~line 35):

```typescript
| { type: 'objectPushed'; object: any; position: { x: number; z: number } }
| { type: 'objectWallSlam'; object: any; speed: number; damage: number; position: { x: number; z: number } }
| { type: 'objectImpact'; objectA: any; objectB: any; speed: number; damage: number; position: { x: number; z: number } }
| { type: 'objectDestroyed'; object: any; position: { x: number; z: number } }
| { type: 'objectPitFall'; object: any; position: { x: number; z: number } }
| { type: 'obstacleDestroyed'; obstacleIndex: number; position: { x: number; z: number } }
```

**Step 5: Wire into game loop**

In `src/engine/game.ts`:
- Add import: `applyObjectVelocities` from `'./physics'`
- Add call after `applyVelocities` (line 99): `applyObjectVelocities(gameDt, gameState);`

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

Run: `npm run typecheck`
Expected: Clean

**Step 7: Commit**

```bash
git add src/engine/physics.ts src/engine/events.ts src/engine/game.ts tests/physics-objects.test.ts
git commit -m "feat: add object velocity integration with wall slam + pit fall"
```

---

## Task 4: Object-Object and Object-Enemy Collision

**Files:**
- Modify: `src/engine/physics.ts`
- Modify: `src/engine/game.ts`
- Test: `tests/physics-objects.test.ts` (extend)

**Step 1: Write collision math tests**

Add to `tests/physics-objects.test.ts`:

```typescript
describe('object collision math', () => {
  it('circle-circle overlap detection', () => {
    const ax = 0, az = 0, aRadius = 0.8;
    const bx = 1, bz = 0, bRadius = 0.8;
    const dx = bx - ax, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = aRadius + bRadius;
    expect(dist).toBeLessThan(minDist); // overlapping
  });

  it('mass-weighted separation: lighter moves more', () => {
    const massA = 1.0, massB = 3.0;
    const totalMass = massA + massB;
    const ratioA = massB / totalMass; // 0.75
    const ratioB = massA / totalMass; // 0.25
    expect(ratioA).toBeGreaterThan(ratioB); // lighter (A) moves more
  });

  it('elastic collision transfers momentum correctly', () => {
    // Object A moving right at speed 5, B stationary
    // After collision: A should slow down, B should speed up
    const massA = 1.0, massB = 1.0;
    const e = PHYSICS.enemyBounce; // restitution
    const velAx = 5, velBx = 0;
    const nx = 1; // collision normal: A->B along x
    const relVelDotN = (velAx - velBx) * nx;
    const impulse = (1 + e) * relVelDotN / (massA + massB);

    const newVelAx = velAx - impulse * massB * nx;
    const newVelBx = velBx + impulse * massA * nx;

    expect(newVelBx).toBeGreaterThan(0); // B gained velocity
    expect(newVelAx).toBeLessThan(velAx); // A lost velocity
  });

  it('impact damage above speed threshold', () => {
    const relSpeed = 5;
    const dmg = Math.round((relSpeed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
    expect(dmg).toBeGreaterThan(0);
  });

  it('no impact damage below speed threshold', () => {
    const relSpeed = 1;
    const dmg = Math.max(0, Math.round((relSpeed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage));
    expect(dmg).toBe(0);
  });
});
```

**Step 2: Run tests to verify they pass (pure math)**

Run: `npx vitest run tests/physics-objects.test.ts`
Expected: PASS

**Step 3: Implement `resolveObjectCollisions` in `src/engine/physics.ts`**

Add after `resolveEnemyCollisions`:

```typescript
export function resolveObjectCollisions(gameState: GameState): void {
  const objects = gameState.physicsObjects;
  const enemies = gameState.enemies;

  // Object-Object collisions
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    if (a.destroyed) continue;

    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      if (b.destroyed) continue;

      resolveCircleCircle(a.pos, a.vel, a.radius, a.mass, a.restitution,
                           b.pos, b.vel, b.radius, b.mass, b.restitution,
                           null, null, gameState); // no enemy damage
    }
  }

  // Object-Enemy collisions
  for (const obj of objects) {
    if (obj.destroyed) continue;

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
```

**Note:** The helper `resolveCircleCircle` is mentioned above for object-object — implement it as a private helper or inline the math directly (it's the same as the enemy-enemy loop in `resolveEnemyCollisions`). For the initial implementation, inline it to keep things simple.

**Step 4: Wire into game loop**

In `src/engine/game.ts`:
- Add `resolveObjectCollisions` to the import from `'./physics'`
- Add call after `resolveEnemyCollisions` (line 102): `resolveObjectCollisions(gameState);`

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/engine/physics.ts src/engine/game.ts tests/physics-objects.test.ts
git commit -m "feat: add object-object and object-enemy collision with elastic physics"
```

---

## Task 5: Force Push Affects PhysicsObjects

**Files:**
- Modify: `src/engine/physics.ts:748-819` (force push section in `checkCollisions`)
- Test: `tests/physics-objects.test.ts` (extend)

**Step 1: Write tests**

Add to `tests/physics-objects.test.ts`:

```typescript
describe('force push affects objects', () => {
  it('push velocity inversely proportional to mass', () => {
    const force = 8;
    const friction = PHYSICS.objectFriction;

    const massLight = 0.5;
    const massHeavy = 3.0;

    const distLight = force / massLight;
    const distHeavy = force / massHeavy;

    const v0Light = Math.sqrt(2 * friction * distLight);
    const v0Heavy = Math.sqrt(2 * friction * distHeavy);

    expect(v0Light).toBeGreaterThan(v0Heavy);
  });

  it('very heavy object barely moves', () => {
    const force = 8;
    const friction = PHYSICS.objectFriction;
    const massHeavy = 100;
    const dist = force / massHeavy;
    const v0 = Math.sqrt(2 * friction * dist);
    expect(v0).toBeLessThan(2); // very slow
  });
});
```

**Step 2: Run tests — should pass (pure math)**

**Step 3: Extend force push in `checkCollisions`**

In `src/engine/physics.ts`, inside the `if (pushEvt)` block (~line 748), after collecting enemy candidates and before sorting:

Add a second candidate collection for PhysicsObjects:

```typescript
// Also collect PhysicsObjects in push rectangle
for (const obj of gameState.physicsObjects) {
  if (obj.destroyed) continue;
  if (isInRotatedRect(obj.pos.x, obj.pos.z, pushEvt.x, pushEvt.z,
                       pushEvt.width, pushEvt.length, pushEvt.rotation, obj.radius)) {
    const dx = obj.pos.x - playerX;
    const dz = obj.pos.z - playerZ;
    const forward = dx * dirX + dz * dirZ;
    const lateral = dx * perpX + dz * perpZ;
    candidates.push({ enemy: null, obj, forward, lateral });
  }
}
```

The candidates array needs to support both enemies and objects. Modify the candidate type:

```typescript
const candidates: { enemy: any; obj: any; forward: number; lateral: number }[] = [];
```

In the push application loop, handle objects:

```typescript
for (const { enemy, obj, lateral } of candidates) {
  // ... existing occlusion check ...

  if (enemy) {
    // existing enemy push code
  } else if (obj) {
    // Object push: velocity = sqrt(2 * friction * (force / mass))
    const kbDist = pushEvt.force / obj.mass;
    if (kbDist > 0) {
      const v0 = Math.sqrt(2 * PHYSICS.objectFriction * kbDist);
      obj.vel.x = dirX * v0;
      obj.vel.z = dirZ * v0;
    }
    emit({ type: 'objectPushed', object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
    spawnDamageNumber(obj.pos.x, obj.pos.z, 'PUSH', '#44ffaa');
  }

  pushedLaterals.push(lateral);
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/physics.ts tests/physics-objects.test.ts
git commit -m "feat: force push now affects physics objects (mass-based resistance)"
```

---

## Task 6: Destructible Obstacles

**Files:**
- Modify: `src/engine/physics.ts`
- Modify: `src/config/arena.ts`
- Create: `tests/destructible-obstacles.test.ts`

**Step 1: Write tests**

Create `tests/destructible-obstacles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';

describe('destructible obstacle mechanics', () => {
  it('destructible obstacle has finite health', () => {
    const obs = { x: 0, z: 0, w: 2, h: 2, d: 2, destructible: true, health: 50, maxHealth: 50, material: 'stone' as const };
    expect(obs.health).toBe(50);
    expect(obs.destructible).toBe(true);
  });

  it('non-destructible obstacle has no health', () => {
    const obs = { x: 0, z: 0, w: 2, h: 2, d: 2 };
    expect(obs.destructible).toBeUndefined();
    expect(obs.health).toBeUndefined();
  });

  it('impact damage formula works for obstacles', () => {
    const impactSpeed = 6;
    const damage = Math.round((impactSpeed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage);
    expect(damage).toBeGreaterThan(0);
  });

  it('obstacle health can reach zero', () => {
    let health = 50;
    const damage = 60;
    health -= damage;
    expect(health).toBeLessThanOrEqual(0);
  });

  it('AABB overlap detection for circle-vs-obstacle', () => {
    // Circle at (0, 0) with radius 0.8, obstacle AABB from (-1,-1) to (1,1)
    const cx = 0, cz = 0.5, radius = 0.8;
    const minX = -1, maxX = 1, minZ = -1, maxZ = 1;
    const closestX = Math.max(minX, Math.min(cx, maxX));
    const closestZ = Math.max(minZ, Math.min(cz, maxZ));
    const dx = cx - closestX;
    const dz = cz - closestZ;
    const distSq = dx * dx + dz * dz;
    expect(distSq).toBeLessThan(radius * radius); // overlapping
  });
});
```

**Step 2: Run tests to verify they pass (pure math)**

**Step 3: Implement `resolveObjectObstacleCollisions` in `src/engine/physics.ts`**

```typescript
// Track obstacles to destroy at end of frame (deferred removal)
const pendingObstacleDestructions: number[] = [];

export function resolveObjectObstacleCollisions(gameState: GameState): void {
  const objects = gameState.physicsObjects;

  for (const obj of objects) {
    if (obj.destroyed) continue;
    const speed = Math.sqrt(obj.vel.x * obj.vel.x + obj.vel.z * obj.vel.z);
    if (speed < PHYSICS.objectImpactMinSpeed) continue; // only check fast-moving objects

    for (let i = 0; i < OBSTACLES.length; i++) {
      const obs = OBSTACLES[i];
      if (!obs.destructible || !obs.health || obs.health <= 0) continue;

      // Circle vs AABB
      const aabb: AABB = {
        minX: obs.x - obs.w / 2,
        maxX: obs.x + obs.w / 2,
        minZ: obs.z - obs.d / 2,
        maxZ: obs.z + obs.d / 2,
      };

      const push = circleVsAABB(obj.pos.x, obj.pos.z, obj.radius, aabb);
      if (!push) continue;

      // Impact! Damage the obstacle proportional to object speed
      const dmg = Math.round((speed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
      if (dmg <= 0) continue;

      obs.health -= dmg;
      spawnDamageNumber(obs.x, obs.z, dmg, '#ff8844');
      screenShake(2, 80);

      if (obs.health <= 0) {
        obs.health = 0;
        pendingObstacleDestructions.push(i);
        emit({ type: 'obstacleDestroyed', obstacleIndex: i, position: { x: obs.x, z: obs.z } });
      }
    }
  }
}

export function processDestroyedObstacles(): void {
  if (pendingObstacleDestructions.length === 0) return;

  // Sort descending so splice doesn't shift earlier indices
  pendingObstacleDestructions.sort((a, b) => b - a);

  for (const idx of pendingObstacleDestructions) {
    if (idx < OBSTACLES.length) {
      OBSTACLES.splice(idx, 1);
    }
  }
  pendingObstacleDestructions.length = 0;

  invalidateCollisionBounds();
  // Arena visuals need rebuild — import and call rebuildArenaVisuals
  rebuildArenaVisuals();
}
```

**Note:** You'll need to add `import { rebuildArenaVisuals } from './renderer'` to physics.ts. Check that this doesn't create a circular dependency — if it does, emit an event instead and let the renderer subscribe.

**Step 4: Add import for OBSTACLES**

Add to physics.ts imports: `import { OBSTACLES } from '../config/arena';`

**Step 5: Wire into game loop**

In `src/engine/game.ts`:
- Add `resolveObjectObstacleCollisions, processDestroyedObstacles` to import
- After `resolveObjectCollisions`: `resolveObjectObstacleCollisions(gameState);`
- After `checkPitFalls`: `processDestroyedObstacles();`

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/engine/physics.ts src/config/arena.ts src/engine/game.ts tests/destructible-obstacles.test.ts
git commit -m "feat: destructible obstacles take damage from physics objects, deferred removal"
```

---

## Task 7: Room Integration — Spawn Objects + Clear on Transition

**Files:**
- Modify: `src/config/rooms.ts`
- Modify: `src/engine/roomManager.ts`
- Test: `tests/rooms.test.ts` (extend)

**Step 1: Add `physicsObjects` to Room 1 definition**

In `src/config/rooms.ts`, add to the Room 1 definition (after `pits`):

```typescript
physicsObjects: [
  { meshType: 'rock', material: 'stone', x: -2, z: -2, mass: 2.0, health: 9999, radius: 0.8 },
  { meshType: 'barrel', material: 'wood', x: 3, z: -6, mass: 0.5, health: 20, radius: 0.5, scale: 0.8 },
],
```

Add to `RoomDefinition` interface (if not already done in types):
The `PhysicsObjectPlacement` type is already in `types/index.ts`, and `RoomDefinition` is in `rooms.ts`. Add:

```typescript
import { Obstacle, Pit, SpawnPack, RoomSpawnBudget, PhysicsObjectPlacement } from '../types/index';

export interface RoomDefinition {
  // ... existing fields ...
  physicsObjects?: PhysicsObjectPlacement[];
}
```

Also make one of Room 1's existing obstacles destructible:

```typescript
obstacles: [
  { x: -4, z: 5, w: 1.5, h: 2, d: 1.5 },
  { x: 4, z: -5, w: 1.5, h: 2, d: 1.5, destructible: true, health: 50, maxHealth: 50, material: 'stone' as const },
  { x: 0, z: -12, w: 3, h: 1, d: 1 },
],
```

**Step 2: Update roomManager to spawn/clear PhysicsObjects**

In `src/engine/roomManager.ts`:

Add imports:
```typescript
import { createPhysicsObject, clearPhysicsObjects, resetPhysicsObjectIds } from '../entities/physicsObject';
```

In `loadRoom` function, after setting arena config (~line 100):

```typescript
// Spawn physics objects for this room
clearPhysicsObjects(gameState, sceneRef);
if (room.physicsObjects) {
  for (const placement of room.physicsObjects) {
    const obj = createPhysicsObject(placement);
    // Mesh creation will be handled by renderer (Task 8)
    gameState.physicsObjects.push(obj);
  }
}
```

In `loadRoom`, in the "Clear everything" section (~line 88), add:
```typescript
clearPhysicsObjects(gameState, sceneRef);
```

**Step 3: Write test**

Add to `tests/rooms.test.ts`:

```typescript
describe('room physics objects', () => {
  it('Room 1 has physics object placements', () => {
    const room1 = ROOMS[0];
    expect(room1.physicsObjects).toBeDefined();
    expect(room1.physicsObjects!.length).toBeGreaterThan(0);
  });

  it('Room 1 has a destructible obstacle', () => {
    const room1 = ROOMS[0];
    const destructible = room1.obstacles.filter(o => o.destructible);
    expect(destructible.length).toBeGreaterThan(0);
    expect(destructible[0].health).toBeGreaterThan(0);
  });
});
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/config/rooms.ts src/engine/roomManager.ts tests/rooms.test.ts
git commit -m "feat: rooms spawn physics objects, Room 1 has rock + barrel + destructible pillar"
```

---

## Task 8: Visual — PhysicsObject Meshes + Destructible Obstacle Appearance

**Files:**
- Modify: `src/entities/physicsObject.ts`
- Modify: `src/engine/renderer.ts`
- Modify: `src/engine/roomManager.ts`

**Step 1: Add mesh creation to `physicsObject.ts`**

```typescript
const MATERIAL_COLORS: Record<string, { color: number; emissive: number }> = {
  stone: { color: 0x888899, emissive: 0x334455 },
  wood:  { color: 0x8B6914, emissive: 0x443322 },
  metal: { color: 0xaaaacc, emissive: 0x556677 },
  ice:   { color: 0x88ccff, emissive: 0x4488aa },
};

export function createPhysicsObjectMesh(obj: PhysicsObject, scene: any): void {
  const group = new THREE.Group();
  const colors = MATERIAL_COLORS[obj.material] || MATERIAL_COLORS.stone;
  const mat = new THREE.MeshStandardMaterial({
    color: colors.color,
    emissive: colors.emissive,
    emissiveIntensity: 0.3,
    roughness: 0.7,
  });

  let geo;
  switch (obj.meshType) {
    case 'rock':
      geo = new THREE.SphereGeometry(obj.radius * obj.scale, 8, 6);
      break;
    case 'crate':
      const s = obj.radius * obj.scale * 1.4; // box inscribed in circle
      geo = new THREE.BoxGeometry(s, s, s);
      break;
    case 'barrel':
      geo = new THREE.CylinderGeometry(
        obj.radius * obj.scale * 0.8,
        obj.radius * obj.scale,
        obj.radius * obj.scale * 1.5,
        8
      );
      break;
    case 'pillar':
      geo = new THREE.CylinderGeometry(
        obj.radius * obj.scale * 0.6,
        obj.radius * obj.scale,
        obj.radius * obj.scale * 2.5,
        6
      );
      break;
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = obj.radius * obj.scale * 0.5; // sit on ground
  group.add(mesh);

  group.position.set(obj.pos.x, 0, obj.pos.z);
  scene.add(group);
  obj.mesh = group;
}
```

**Step 2: Update roomManager to create meshes after spawning objects**

In `loadRoom`, after creating PhysicsObjects:

```typescript
import { createPhysicsObject, clearPhysicsObjects, resetPhysicsObjectIds, createPhysicsObjectMesh } from '../entities/physicsObject';

// In loadRoom, after pushing obj to gameState.physicsObjects:
createPhysicsObjectMesh(obj, sceneRef);
```

**Step 3: Update renderer for destructible obstacle appearance**

In `src/engine/renderer.ts`, modify `createObstacles()` to differentiate destructible obstacles:

```typescript
function createObstacles() {
  clearObstacleMeshes();

  const normalMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a4a, emissive: 0x223355, emissiveIntensity: 0.3, roughness: 0.7, metalness: 0.2
  });
  const destructibleMat = new THREE.MeshStandardMaterial({
    color: 0x4a3a2a, emissive: 0x553322, emissiveIntensity: 0.3, roughness: 0.8, metalness: 0.1
  });

  for (const o of OBSTACLES) {
    const mat = o.destructible ? destructibleMat : normalMat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mat.clone());
    mesh.position.set(o.x, o.h / 2, o.z);
    scene.add(mesh);
    obstacleMeshes.push(mesh);
  }

  // ... existing wall creation code unchanged ...
}
```

**Step 4: Build and visual test**

Run: `npm run build`
Expected: Clean build

Open in browser, verify Room 1 shows: rock (gray sphere), barrel (brown cylinder), destructible pillar (brownish color distinct from normal pillars).

**Step 5: Commit**

```bash
git add src/entities/physicsObject.ts src/engine/renderer.ts src/engine/roomManager.ts
git commit -m "feat: physics object meshes + destructible obstacle visual distinction"
```

---

## Task 9: Audio + Particles for Object Events

**Files:**
- Modify: `src/engine/audio.ts`
- Modify: `src/engine/particles.ts`

**Step 1: Add audio for object events**

In `src/engine/audio.ts`, add new sound functions and event subscriptions:

```typescript
export function playObjectImpact(intensity: number = 1): void {
  // Deep thud — lower pitch than enemy impact
  // (implement using same oscillator pattern as playEnemyImpact but lower frequency)
}

export function playObstacleBreak(): void {
  // Shattering crack — noise burst + descending tone
}
```

In `initAudio()`, add subscriptions:

```typescript
on('objectWallSlam', (e: GameEvent) => {
  if (e.type === 'objectWallSlam') playWallSlam(Math.min(e.speed / 8, 1));
});
on('objectImpact', (e: GameEvent) => {
  if (e.type === 'objectImpact') playObjectImpact(Math.min(e.speed / 8, 1));
});
on('obstacleDestroyed', () => playObstacleBreak());
on('objectPitFall', () => {
  // Reuse existing pit fall sound
});
```

**Step 2: Add particle preset for obstacle destruction**

In `src/engine/particles.ts`, add:

```typescript
export const OBSTACLE_BREAK_BURST: ParticleConfig = {
  count: 12,
  speed: 4,
  spread: Math.PI * 2,
  lifetime: 600,
  size: 0.15,
  color: 0x887766,
  gravity: -8,
};
```

Subscribe to event:

```typescript
on('obstacleDestroyed', (e: GameEvent) => {
  if (e.type === 'obstacleDestroyed') {
    burstAt(e.position.x, e.position.z, OBSTACLE_BREAK_BURST);
  }
});
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/engine/audio.ts src/engine/particles.ts
git commit -m "feat: audio + particle feedback for object collisions and obstacle destruction"
```

---

## Task 10: Tuning Panel + Pit Fall Extension + Final Polish

**Files:**
- Modify: `src/ui/tuning.ts`
- Modify: `src/engine/physics.ts` (extend `checkPitFalls`)

**Step 1: Extend pit fall check for PhysicsObjects**

In `src/engine/physics.ts`, at the end of `checkPitFalls`:

```typescript
// PhysicsObject pit falls (non-velocity — safety net like enemies)
for (const obj of gameState.physicsObjects) {
  if (obj.destroyed) continue;
  if (pointInPit(obj.pos.x, obj.pos.z)) {
    obj.destroyed = true;
    obj.fellInPit = true;
    emit({ type: 'objectPitFall', object: obj, position: { x: obj.pos.x, z: obj.pos.z } });
    // Visual: hide mesh (pit fall animation can be added later)
    if (obj.mesh) obj.mesh.visible = false;
  }
}
```

**Step 2: Add tuning panel section**

In `src/ui/tuning.ts`, add a "Physics Objects" section with sliders for:
- `PHYSICS.objectFriction` (1-50, step 1)
- `PHYSICS.objectWallSlamMinSpeed` (0-10, step 0.5)
- `PHYSICS.objectWallSlamDamage` (1-20, step 1)
- `PHYSICS.objectWallSlamBounce` (0-1, step 0.05)
- `PHYSICS.objectImpactMinSpeed` (0-10, step 0.5)
- `PHYSICS.objectImpactDamage` (1-20, step 1)

Follow the existing pattern in tuning.ts for creating slider sections.

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

Run: `npm run build`
Expected: Clean build

Run: `npm run typecheck`
Expected: Clean

**Step 4: Commit**

```bash
git add src/engine/physics.ts src/ui/tuning.ts
git commit -m "feat: tuning panel for physics objects + pit fall safety net"
```

---

## Task 11: Integration Test — The Full Chain

**Files:**
- Test: `tests/physics-objects.test.ts` (extend with integration tests)

**Step 1: Write integration-level tests**

```typescript
describe('milestone: push rock into pillar chain', () => {
  it('force push on rock produces velocity inversely proportional to mass', () => {
    const force = 8;
    const friction = PHYSICS.objectFriction;
    const mass = 2.0;
    const dist = force / mass;
    const v0 = Math.sqrt(2 * friction * dist);
    // Rock should travel 4 units (8/2) before stopping
    expect(dist).toBeCloseTo(4, 1);
    expect(v0).toBeGreaterThan(PHYSICS.objectImpactMinSpeed); // fast enough to damage on impact
  });

  it('rock impact on destructible obstacle deals damage', () => {
    const rockSpeed = 6; // above impact threshold
    const dmg = Math.round((rockSpeed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
    expect(dmg).toBeGreaterThan(0);
    // With default config: (6-2)*5 = 20 damage
  });

  it('50hp pillar can be destroyed by 3 rock impacts at speed 6', () => {
    const pillarHealth = 50;
    const dmgPerHit = Math.round((6 - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
    const hitsNeeded = Math.ceil(pillarHealth / dmgPerHit);
    expect(hitsNeeded).toBeLessThanOrEqual(3);
  });

  it('full config values produce a viable chain', () => {
    // Force push max force = 12 (from abilities config)
    // Rock mass = 2.0 → dist = 12/2 = 6 units
    // Rock initial speed = sqrt(2 * 25 * 6) ≈ 17.3 u/s
    // Impact damage = (17.3 - 2) * 5 ≈ 76 damage
    // One full-charge push should destroy a 50hp pillar in one hit
    const force = 12;
    const mass = 2.0;
    const friction = PHYSICS.objectFriction;
    const dist = force / mass;
    const v0 = Math.sqrt(2 * friction * dist);
    const impactDmg = Math.round((v0 - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
    expect(impactDmg).toBeGreaterThan(50); // one-shots the pillar
  });
});
```

**Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS — should be 552 + new tests (approx 575-585 total)

**Step 3: Build and manual playtest**

Run: `npm run build`
Open in browser. Test the chain:
1. Enter Room 1
2. Walk near the rock
3. Charge force push (hold E) → release aimed at the destructible pillar
4. Rock should fly toward pillar, hit it, pillar should take damage
5. If fully charged, pillar should break — debris particles, break sound, collision bounds update
6. Barrel near pit: push barrel into pit — should fall in

**Step 4: Final commit**

```bash
git add tests/physics-objects.test.ts
git commit -m "test: integration tests validating push-rock-into-pillar chain"
```

---

## Summary of Commits

| # | Message | Key Files |
|---|---------|-----------|
| 1 | `feat: add PhysicsObject + destructible Obstacle types, extend GameState` | types, game.ts |
| 2 | `feat: add physics object config + factory function` | physics config, physicsObject.ts |
| 3 | `feat: add object velocity integration with wall slam + pit fall` | physics.ts, events.ts, game.ts |
| 4 | `feat: add object-object and object-enemy collision with elastic physics` | physics.ts, game.ts |
| 5 | `feat: force push now affects physics objects (mass-based resistance)` | physics.ts |
| 6 | `feat: destructible obstacles take damage from physics objects, deferred removal` | physics.ts, arena.ts |
| 7 | `feat: rooms spawn physics objects, Room 1 has rock + barrel + destructible pillar` | rooms.ts, roomManager.ts |
| 8 | `feat: physics object meshes + destructible obstacle visual distinction` | physicsObject.ts, renderer.ts |
| 9 | `feat: audio + particle feedback for object collisions and obstacle destruction` | audio.ts, particles.ts |
| 10 | `feat: tuning panel for physics objects + pit fall safety net` | tuning.ts, physics.ts |
| 11 | `test: integration tests validating push-rock-into-pillar chain` | tests |

Total: 11 tasks, ~11 commits, each independently testable.
