# The Workshop (Rule-Bending Room) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Room 5 "The Workshop" showcasing enlarge/shrink rule-bending mechanics with physics objects, inserted before the vertical combat room.

**Architecture:** Copy 5 files from `explore/rule-bending` branch (bends config, bend system, bend mode, physics object, radial menu), extend types with PhysicsObject, add object physics functions to physics.ts, wire bend mode into game loop behind `getActiveProfile() === 'rule-bending'` profile gate.

**Tech Stack:** Three.js (global), TypeScript, esbuild, vitest

**Design doc:** `docs/plans/2026-02-19-the-workshop-room-design.md`

---

### Task 1: Add PhysicsObject types and GameState fields

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add types**

After the `AABB` interface (around line 500), add:

```typescript
export type ObstacleMaterial = 'stone' | 'wood' | 'metal' | 'ice';

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

**Step 2: Add fields to GameState**

In the `GameState` interface, add after `enemies: Enemy[]`:

```typescript
  physicsObjects: PhysicsObject[];
  bendMode: boolean;
  bendsPerRoom: number;
```

**Step 3: Add bendMode to InputState**

In the `InputState` interface, add:

```typescript
  bendMode: boolean;
```

**Step 4: Initialize GameState fields**

In `src/engine/game.ts`, add to the `gameState` initializer (after `enemies: []`):

```typescript
  physicsObjects: [],
  bendMode: false,
  bendsPerRoom: 3,
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new fields are optional/initialized)

**Step 6: Commit**

```
feat: add PhysicsObject types and GameState fields
```

---

### Task 2: Add physics config constants for objects

**Files:**
- Modify: `src/config/physics.ts`

**Step 1: Add object physics constants**

Add after the existing `impactStun` field in PHYSICS:

```typescript
  // Physics objects
  objectFriction: 25,
  objectWallSlamMinSpeed: 3,
  objectWallSlamDamage: 8,
  objectWallSlamBounce: 0.4,
  objectWallSlamShake: 2,
  objectImpactMinSpeed: 2,
  objectImpactDamage: 5,
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
feat: add physics object constants to PHYSICS config
```

---

### Task 3: Add bend/object event types

**Files:**
- Modify: `src/engine/events.ts`

**Step 1: Add event types to GameEvent union**

Add these event types to the `GameEvent` type union (around line 9-48):

```typescript
  | { type: 'bendModeActivated' }
  | { type: 'bendModeDeactivated' }
  | { type: 'bendApplied'; bendId: string; targetType: string; targetId: number; position: { x: number; z: number } }
  | { type: 'bendFailed'; bendId: string; reason: string }
  | { type: 'objectPitFall'; object: any; position: { x: number; z: number } }
  | { type: 'objectWallSlam'; object: any; speed: number; damage: number; position: { x: number; z: number } }
  | { type: 'objectDestroyed'; object: any; position: { x: number; z: number } }
  | { type: 'objectImpact'; objectA: any; objectB: any; speed: number; damage: number; position: { x: number; z: number } }
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
feat: add bend and physics object event types
```

---

### Task 4: Copy and adapt physicsObject.ts

**Files:**
- Create: `src/entities/physicsObject.ts`

**Step 1: Copy from branch**

Run: `git show explore/rule-bending:src/entities/physicsObject.ts > src/entities/physicsObject.ts`

**Step 2: Verify import compatibility**

The file imports `PhysicsObject` and `PhysicsObjectPlacement` from `'../types/index'`. These types were added in Task 1. Verify no other import issues.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
feat: add physicsObject entity (copied from explore/rule-bending)
```

---

### Task 5: Copy bends.ts config

**Files:**
- Create: `src/config/bends.ts`

**Step 1: Copy from branch**

Run: `git show explore/rule-bending:src/config/bends.ts > src/config/bends.ts`

This file is self-contained — defines `BendEffect`, `RuleBend`, and the `BENDS` array with Enlarge and Shrink.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
feat: add bends config (enlarge + shrink)
```

---

### Task 6: Copy and adapt bendSystem.ts

**Files:**
- Create: `src/engine/bendSystem.ts`

**Step 1: Copy from branch**

Run: `git show explore/rule-bending:src/engine/bendSystem.ts > src/engine/bendSystem.ts`

This file imports only from `'../config/bends'` (added in Task 5). Self-contained.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
feat: add bend system (apply/undo/reset with opposite-pole enforcement)
```

---

### Task 7: Copy and adapt radialMenu.ts

**Files:**
- Create: `src/ui/radialMenu.ts`

**Step 1: Copy from branch**

Run: `git show explore/rule-bending:src/ui/radialMenu.ts > src/ui/radialMenu.ts`

Imports only from `'../config/bends'`. Self-contained DOM overlay.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```
feat: add radial menu UI for bend selection
```

---

### Task 8: Copy and adapt bendMode.ts

**Files:**
- Create: `src/engine/bendMode.ts`

**Step 1: Copy from branch**

Run: `git show explore/rule-bending:src/engine/bendMode.ts > src/engine/bendMode.ts`

**Step 2: Fix imports for demo branch**

The file imports from:
- `'./bendSystem'` — added in Task 6 ✓
- `'../config/bends'` — added in Task 5 ✓
- `'./bulletTime'` — exists on demo branch ✓ (verify `activateBulletTime` is exported — it is at line 55)
- `'../ui/radialMenu'` — added in Task 7 ✓
- `'../entities/physicsObject'` — added in Task 4 ✓
- `'./renderer'` — exists, need to verify `getCamera` is exported (it is)
- `'./events'` — exists ✓

All imports should resolve. No changes needed.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```
feat: add bend mode (Q toggle, bullet time, raycasted targeting)
```

---

### Task 9: Add bendMode input binding

**Files:**
- Modify: `src/engine/input.ts`

**Step 1: Add bendMode to input state**

Add `bendMode: false` to the input state object (around line 7-22, after `bulletTime`).

**Step 2: Wire Q key to bendMode instead of bulletTime**

Currently Q maps to `bulletTime` (around line 57). Change the Q key handler logic:
- Q should set `bendMode: true` (bend mode owns Q, and internally activates bullet time)
- Remove Q from bulletTime binding
- Note: bulletTime can still be activated programmatically by bendMode and by detection events

Actually, looking more carefully at the rule-bending branch game.ts: Q triggers `toggleBendMode()` which internally calls `activateBulletTime()`. When bend mode is NOT active, Q triggers `toggleBulletTime()` as fallback. So the logic in game.ts is:

```typescript
if (input.bendMode) toggleBendMode();
if (!isBendModeActive() && input.bulletTime) toggleBulletTime();
```

**For profile-gated approach:** Keep Q mapped to `bulletTime` as-is. Add a SEPARATE `bendMode` field that also fires on Q. In game.ts, the profile gate will decide which one to use:

```typescript
// In game.ts game loop:
if (getActiveProfile() === 'rule-bending') {
  if (input.bendMode) toggleBendMode();
} else {
  if (input.bulletTime) toggleBulletTime();
}
```

So in input.ts, when Q is pressed, set BOTH `bulletTime: true` and `bendMode: true`. The game loop decides which to consume based on profile.

**Step 3: Add to consumeInput**

Add `state.bendMode = false` to the `consumeInput()` function.

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```
feat: add bendMode input binding (Q key, profile-gated in game loop)
```

---

### Task 10: Add object physics functions to physics.ts

**Files:**
- Modify: `src/engine/physics.ts`

This is the largest task. We need to add 3 functions from the rule-bending branch and modify the force push code to also push physics objects.

**Step 1: Add `resolveTerrainCollisionEx` helper**

This function exists on the rule-bending branch but not on demo. Add it after `resolveMovementCollision` (around line 215). It's an enhanced version of `resolveTerrainCollision` that also returns wall normal info.

```typescript
interface CollisionResult {
  x: number;
  z: number;
  hitWall: boolean;
  normalX: number;
  normalZ: number;
}

function resolveTerrainCollisionEx(x: number, z: number, radius: number): CollisionResult {
  const bounds = getBounds();
  let rx = x, rz = z;
  let hitWall = false;
  let totalNX = 0, totalNZ = 0;

  for (const box of bounds) {
    const push = circleVsAABB(rx, rz, radius, box);
    if (push) {
      rx += push.x;
      rz += push.z;
      hitWall = true;
      const len = Math.sqrt(push.x * push.x + push.z * push.z);
      if (len > 0.001) {
        totalNX += push.x / len;
        totalNZ += push.z / len;
      }
    }
  }

  const nLen = Math.sqrt(totalNX * totalNX + totalNZ * totalNZ);
  if (nLen > 0.001) {
    totalNX /= nLen;
    totalNZ /= nLen;
  }

  return { x: rx, z: rz, hitWall, normalX: totalNX, normalZ: totalNZ };
}
```

**Step 2: Add `applyObjectVelocities`**

Copy the full `applyObjectVelocities` function from the rule-bending branch (lines 356-488 of explore/rule-bending:src/engine/physics.ts). This handles:
- Stepped movement to prevent tunneling
- Pit fall detection
- Wall slide (not bounce — objects slide along walls)
- Object-object collision during stepping
- Wall slam damage to the object itself
- Friction

Export it: `export function applyObjectVelocities(dt: number, gameState: GameState): void`

**Step 3: Add `resolveObjectCollisions`**

Copy the full `resolveObjectCollisions` function (lines 599-761). This handles:
- Object-object elastic collisions (3 iterations for chain resolution)
- Object-enemy collisions (separation + momentum transfer + impact damage)
- Terrain-aware separation (wall-pinned objects don't move)

Export it: `export function resolveObjectCollisions(gameState: GameState): void`

**Step 4: Add `resolvePhysicsObjectBodyCollisions`**

Copy the full function (lines 762-810). Prevents player and enemies from walking through physics objects.

Export it: `export function resolvePhysicsObjectBodyCollisions(gameState: GameState): void`

**Step 5: Modify force push to also push physics objects**

In `checkCollisions` (the force push section around line 804-875), modify the candidates collection to also include physics objects. The rule-bending branch version uses a unified `candidates` array with `{ enemy, obj, forward, lateral }` entries.

Change the candidates type from `{ enemy: any; forward: number; lateral: number }[]` to `{ enemy: any; obj: any; forward: number; lateral: number }[]`.

After the enemy collection loop (around line 830), add:

```typescript
    // Physics objects
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

And in the knockback application loop, handle the `obj` case:

```typescript
      if (enemy) {
        // existing enemy push code...
      } else if (obj) {
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
        spawnDamageNumber(obj.pos.x, obj.pos.z, 'PUSH', '#44ffaa');
      }
```

**Step 6: Add missing import**

Add `PHYSICS` import if not already present (check — it's imported on the demo branch already at line 7).

**Step 7: Update exports in the import at game.ts**

In `src/engine/game.ts` line 8, add the new functions to the physics import:

```typescript
import { checkCollisions, checkPitFalls, updateEffectGhosts, applyVelocities, resolveEnemyCollisions, applyObjectVelocities, resolveObjectCollisions, resolvePhysicsObjectBodyCollisions } from './physics';
```

**Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 9: Run tests**

Run: `npm test`
Expected: All existing tests pass

**Step 10: Commit**

```
feat: add physics object velocity, collision, and body-blocking functions
```

---

### Task 11: Wire bend mode and object physics into game loop

**Files:**
- Modify: `src/engine/game.ts`

**Step 1: Add imports**

Add at the top:

```typescript
import { initBendMode, toggleBendMode, isBendModeActive, isBendTargeting, handleBendClick, enterTargeting, resetBendMode, updateBendMode, updateBendHover } from './bendMode';
import { initRadialMenu, setOnBendSelected } from '../ui/radialMenu';
import { getActiveProfile } from './profileManager';
```

**Step 2: Wire bend mode toggle in game loop (profile-gated)**

In the input section of the game loop (around line 84-89), replace the bullet time toggle with:

```typescript
  // 1b. Bend Mode toggle (Q key) — profile-gated
  if (getActiveProfile() === 'rule-bending') {
    if (input.bendMode) toggleBendMode();
    // Bullet time is handled internally by bend mode
  } else {
    if (input.bulletTime) toggleBulletTime();
  }
  updateBulletTime(dt);
  const gameDt = dt * getBulletTimeScale();
```

**Step 3: Add bend targeting click and hover update**

After the gameDt calculation, add:

```typescript
  // 1c. Bend targeting click
  if (isBendModeActive() && isBendTargeting() && input.attack) {
    handleBendClick(input.mouseNDC, gameState);
  }

  // 1d. Bend mode update (highlights + hover)
  updateBendMode(dt, gameState);
  if (isBendModeActive() && isBendTargeting()) {
    updateBendHover(input.mouseNDC, gameState);
  }
```

**Step 4: Gate combat input during bend mode**

Wrap the player update (line 92) to gate combat input when bend mode is active:

```typescript
  if (isBendModeActive()) {
    const gatedInput = { ...input, attack: false, dash: false, ultimate: false, ultimateHeld: false };
    updatePlayer(gatedInput, dt, gameState);
  } else {
    updatePlayer(input, dt, gameState);
  }
```

**Step 5: Add object physics steps to collision section**

After `applyVelocities(gameDt, gameState)` (line 117) and `resolveEnemyCollisions(gameState)` (line 120), add:

```typescript
  // 6a1. Physics object velocities (profile-gated but safe to always run — no-ops when array empty)
  applyObjectVelocities(gameDt, gameState);

  // 6a3. Object-object + object-enemy collision
  resolveObjectCollisions(gameState);

  // 6a3b. Physics objects as solid bodies
  resolvePhysicsObjectBodyCollisions(gameState);
```

These functions all iterate `gameState.physicsObjects` — when the array is empty (non-rule-bending rooms), they no-op naturally.

**Step 6: Wire init**

In the `init` function (find where `initBulletTime()` is called), add after it:

```typescript
  initRadialMenu();
  setOnBendSelected((bendId: string) => { enterTargeting(); });
  initBendMode();
```

**Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 8: Commit**

```
feat: wire bend mode and object physics into game loop (profile-gated)
```

---

### Task 12: Add physics object spawning and cleanup to roomManager

**Files:**
- Modify: `src/engine/roomManager.ts`

**Step 1: Add imports**

```typescript
import { createPhysicsObject, createPhysicsObjectMesh, clearPhysicsObjects } from '../entities/physicsObject';
import { resetBendMode } from '../engine/bendMode';
```

**Step 2: Add cleanup to loadRoom**

In the cleanup sequence (around line 98-115), add:

```typescript
  clearPhysicsObjects(gameState, scene);
  resetBendMode();
```

**Step 3: Add physics object spawning**

After `initGroundShadows()` (around line 123), add:

```typescript
  // Spawn physics objects (if room defines them)
  if (room.physicsObjects) {
    for (const placement of room.physicsObjects) {
      const obj = createPhysicsObject(placement);
      createPhysicsObjectMesh(obj, scene);
      gameState.physicsObjects.push(obj);
    }
  }
```

**Step 4: Extend RoomDefinition**

In `src/config/rooms.ts`, add to the `RoomDefinition` interface:

```typescript
  physicsObjects?: PhysicsObjectPlacement[];
```

Add the import: `import { PhysicsObjectPlacement } from '../types/index';`

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```
feat: add physics object spawning and cleanup to room manager
```

---

### Task 13: Add Room 5 "The Workshop" definition and renumber Arena

**Files:**
- Modify: `src/config/rooms.ts`

**Step 1: Insert Room 5 before The Arena**

The Arena is currently index 4 (Room 5). Insert "The Workshop" at index 4, pushing Arena to index 5.

```typescript
  // Room 5: The Workshop — rule-bending (enlarge/shrink + physics objects)
  {
    name: 'The Workshop',
    profile: 'rule-bending' as PlayerProfile,
    sandboxMode: true,
    commentary: 'What if you could bend the rules? Enlarge a rock, shrink a crate...',
    arenaHalfX: 7,
    arenaHalfZ: 7,
    obstacles: [
      // Walls for wall slam combos
      { x: -4, z: 0, w: 1, h: 2, d: 6 },    // left wall segment
      { x: 4, z: -2, w: 1, h: 2, d: 4 },     // right wall segment
    ],
    pits: [
      { x: 3, z: 4, w: 2.5, d: 2.5 },        // pit near right-back
      { x: -3, z: -4, w: 2.5, d: 2.5 },       // pit near left-front
    ],
    physicsObjects: [
      { meshType: 'rock', material: 'stone', x: 0, z: 1, mass: 2.0, health: 50, radius: 0.6 },
      { meshType: 'crate', material: 'wood', x: 2, z: -1, mass: 5.0, health: 80, radius: 0.8 },
    ],
    spawnBudget: {
      maxConcurrent: 6,
      telegraphDuration: 1500,
      packs: [
        { enemies: [{ type: 'goblin' }, { type: 'goblin' }, { type: 'goblin' }], spawnZone: 'ahead' },
      ],
    },
    playerStart: { x: 0, z: 5 },
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
    highlights: [
      { target: 'pits', color: 0xff4444 },
    ],
  },
```

Key layout decisions:
- **Crate (mass 5.0)** — too heavy for a normal force push to move meaningfully. Shrink it → mass becomes 1.5 → easy to push out of the way.
- **Rock (mass 2.0)** — moveable at normal size, but enlarge it → mass 4.0 + radius doubled → massive bowling ball for pit kills or pressure plate activation.
- 2 pits positioned on diagonals so enlarged objects can bowl enemies into them.
- 2 wall segments for wall slam combos.

**Step 2: Verify Arena is now index 5**

The Arena should be the last room (index 5, Room 6). No changes to Arena definition needed.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```
feat: add Room 5 "The Workshop" with physics objects, renumber Arena to Room 6
```

---

### Task 14: Update tests

**Files:**
- Modify: `tests/rooms.test.ts`
- Create: `tests/physics-objects.test.ts` (if not already from rule-bending branch)
- Create: `tests/bends.test.ts`

**Step 1: Update room count and add Workshop tests**

In `tests/rooms.test.ts`:
- Change `expect(ROOMS.length).toBe(5)` to `expect(ROOMS.length).toBe(6)`
- Add Room 5 test block:

```typescript
  describe('Room 5: The Workshop', () => {
    const room = ROOMS[4];

    it('should have rule-bending profile', () => {
      expect(room.profile).toBe('rule-bending');
    });

    it('should have physics objects', () => {
      expect(room.physicsObjects).toBeDefined();
      expect(room.physicsObjects!.length).toBe(2);
    });

    it('should have a rock and a crate', () => {
      const types = room.physicsObjects!.map(o => o.meshType);
      expect(types).toContain('rock');
      expect(types).toContain('crate');
    });

    it('should have 2 pits', () => {
      expect(room.pits.length).toBe(2);
    });

    it('should have wall slam enabled', () => {
      expect(room.enableWallSlamDamage).toBe(true);
    });
  });
```

- Update Room 5 "The Arena" test references to Room 6 (index 5 → index 5 still, but room name references):

```typescript
  describe('Room 6: The Arena', () => {
    const room = ROOMS[5];  // was ROOMS[4]
    // ... existing tests unchanged
  });
```

**Step 2: Add bend system tests**

Create `tests/bends.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BENDS, getBendById } from '../src/config/bends';
import { createBendSystem } from '../src/engine/bendSystem';

describe('Bend config', () => {
  it('should have 2 bends (enlarge + shrink)', () => {
    expect(BENDS.length).toBe(2);
  });

  it('should have enlarge and shrink', () => {
    expect(getBendById('enlarge')).toBeDefined();
    expect(getBendById('shrink')).toBeDefined();
  });

  it('enlarge should be size/positive', () => {
    const bend = getBendById('enlarge')!;
    expect(bend.property).toBe('size');
    expect(bend.pole).toBe('positive');
  });

  it('shrink should be size/negative', () => {
    const bend = getBendById('shrink')!;
    expect(bend.property).toBe('size');
    expect(bend.pole).toBe('negative');
  });
});

describe('Bend system', () => {
  it('should start with max bends remaining', () => {
    const sys = createBendSystem(3);
    expect(sys.bendsRemaining()).toBe(3);
  });

  it('should apply a bend to a target', () => {
    const sys = createBendSystem(3);
    const target = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    const result = sys.applyBend('enlarge', 'physicsObject', target);
    expect(result.success).toBe(true);
    expect(sys.bendsRemaining()).toBe(2);
    expect(target.scale).toBe(2.5);   // 1 * 2.5
    expect(target.mass).toBe(4);       // 2 * 2
    expect(target.radius).toBe(1.2);   // 0.6 * 2
  });

  it('should prevent opposite pole on same target', () => {
    const sys = createBendSystem(3);
    const target = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    sys.applyBend('enlarge', 'physicsObject', target);
    const result = sys.applyBend('shrink', 'physicsObject', target);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('opposite_pole');
  });

  it('should enforce max bends', () => {
    const sys = createBendSystem(1);
    const t1 = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    sys.applyBend('enlarge', 'physicsObject', t1);
    const t2 = { id: 2, scale: 1, mass: 2, radius: 0.6 };
    const result = sys.applyBend('shrink', 'physicsObject', t2);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_bends_remaining');
  });

  it('should reset all bends and restore original values', () => {
    const sys = createBendSystem(3);
    const target = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    sys.applyBend('enlarge', 'physicsObject', target);
    expect(target.scale).toBe(2.5);
    sys.resetAll();
    expect(target.scale).toBe(1);
    expect(target.mass).toBe(2);
    expect(target.radius).toBe(0.6);
    expect(sys.bendsRemaining()).toBe(3);
  });
});
```

**Step 3: Add physics object creation test**

Create `tests/physics-objects-demo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createPhysicsObject } from '../src/entities/physicsObject';

describe('PhysicsObject creation', () => {
  it('should create a rock with correct properties', () => {
    const obj = createPhysicsObject({
      meshType: 'rock', material: 'stone',
      x: 1, z: 2, mass: 2.0, health: 50, radius: 0.6,
    });
    expect(obj.pos.x).toBe(1);
    expect(obj.pos.z).toBe(2);
    expect(obj.mass).toBe(2.0);
    expect(obj.radius).toBe(0.6);
    expect(obj.vel.x).toBe(0);
    expect(obj.vel.z).toBe(0);
    expect(obj.destroyed).toBe(false);
  });

  it('should create a crate with correct properties', () => {
    const obj = createPhysicsObject({
      meshType: 'crate', material: 'wood',
      x: 3, z: 4, mass: 5.0, health: 80, radius: 0.8,
    });
    expect(obj.meshType).toBe('crate');
    expect(obj.material).toBe('wood');
    expect(obj.mass).toBe(5.0);
  });

  it('should assign unique ids', () => {
    const a = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 0, z: 0, mass: 1, health: 10, radius: 0.5 });
    const b = createPhysicsObject({ meshType: 'crate', material: 'wood', x: 1, z: 1, mass: 2, health: 20, radius: 0.6 });
    expect(a.id).not.toBe(b.id);
  });
});
```

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass (existing + new)

**Step 5: Commit**

```
test: add bend system, physics object, and room definition tests
```

---

### Task 15: Add HUD bend counter display

**Files:**
- Modify: `src/ui/hud.ts`

**Step 1: Add bend counter element**

In `initHUD()`, after the bullet time meter creation (around line 99), add a bend counter element:

```typescript
  // Bend counter (visible only in rule-bending rooms)
  const bendCounter = document.createElement('div');
  bendCounter.id = 'bend-counter';
  bendCounter.style.cssText = `
    position: fixed;
    top: 60px;
    left: 16px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    color: rgba(100, 180, 255, 0.9);
    letter-spacing: 2px;
    text-shadow: 0 0 8px rgba(100, 140, 255, 0.4);
    display: none;
  `;
  document.body.appendChild(bendCounter);
```

**Step 2: Update bend counter in updateHUD**

In `updateHUD()`, add:

```typescript
  // Bend counter
  const bendCounterEl = document.getElementById('bend-counter');
  if (bendCounterEl) {
    if (getActiveProfile() === 'rule-bending') {
      bendCounterEl.style.display = 'block';
      bendCounterEl.textContent = `BENDS: ${getBendsRemaining()}/${getMaxBends()}`;
    } else {
      bendCounterEl.style.display = 'none';
    }
  }
```

**Step 3: Add imports**

```typescript
import { getActiveProfile } from '../engine/profileManager';
import { getBendsRemaining, getMaxBends } from '../engine/bendMode';
```

**Step 4: Add bend ability to grayed-out HUD abilities**

In the ability graying logic (wherever profiles determine which abilities are dimmed), add the bend/Q ability as grayed out for non-rule-bending rooms. This follows the progressive reveal pattern.

**Step 5: Run typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS

**Step 6: Commit**

```
feat: add HUD bend counter for rule-bending rooms
```

---

### Task 16: Add mobile bend button

**Files:**
- Modify: `src/ui/hud.ts`

**Step 1: Add mobile bend button**

In the mobile button creation section, add a bend toggle button. Follow the existing pattern for mobile-btn-dash/jump/etc.

```typescript
  // Bend toggle button (mobile, rule-bending profile only)
  const bendBtn = document.createElement('div');
  bendBtn.id = 'mobile-btn-bend';
  bendBtn.className = 'mobile-btn';
  bendBtn.textContent = 'Q';
  // ... style similar to other mobile buttons
```

**Step 2: Wire touch handler**

On touch, set `bendMode: true` in the input state (same as Q key press).

**Step 3: Profile gate visibility**

In `updateMobileButtons()`, show/hide based on profile:

```typescript
  const bendBtn = document.getElementById('mobile-btn-bend');
  if (bendBtn) bendBtn.style.display = getActiveProfile() === 'rule-bending' ? 'flex' : 'none';
```

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```
feat: add mobile bend toggle button (profile-gated)
```

---

### Task 17: Build, test, and verify full integration

**Files:** None (verification only)

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Manual playtest checklist**

- [ ] Start game → room selector shows 6 rooms
- [ ] Room 5 "The Workshop" appears in selector
- [ ] Enter Workshop → rock and crate visible in arena
- [ ] Press Q → bullet time activates, radial menu appears with Enlarge/Shrink
- [ ] Select Enlarge → targeting cursor appears
- [ ] Click rock → rock scales up, glows blue, bend counter decrements
- [ ] Press Q to exit bend mode → bullet time deactivates
- [ ] Force push the enlarged rock → it moves with altered physics (heavier, bigger collision)
- [ ] Force push rock into goblin → goblin takes impact damage, gets knocked back
- [ ] Force push rock toward pit → if enemy is between rock and pit, they fall in
- [ ] Press Q again → select Shrink → click crate → crate shrinks, becomes light
- [ ] Force push the shrunk crate → it flies much further
- [ ] Walk through door to Room 6 → no physics objects leak, no bend mode artifacts
- [ ] Navigate back to Room 4 → no artifacts
- [ ] Room selector → jump to Room 1 → clean state

**Step 5: Commit**

```
feat: complete Workshop room integration — 6 playable demo rooms
```

---

## Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | PhysicsObject types + GameState fields | types/index.ts, game.ts |
| 2 | Physics config constants | config/physics.ts |
| 3 | Event types | engine/events.ts |
| 4 | Copy physicsObject.ts | entities/physicsObject.ts (new) |
| 5 | Copy bends.ts | config/bends.ts (new) |
| 6 | Copy bendSystem.ts | engine/bendSystem.ts (new) |
| 7 | Copy radialMenu.ts | ui/radialMenu.ts (new) |
| 8 | Copy bendMode.ts | engine/bendMode.ts (new) |
| 9 | bendMode input binding | engine/input.ts |
| 10 | Object physics functions | engine/physics.ts (largest) |
| 11 | Wire into game loop | engine/game.ts |
| 12 | Room spawning + cleanup | engine/roomManager.ts, config/rooms.ts |
| 13 | Room 5 definition + renumber | config/rooms.ts |
| 14 | Tests | rooms.test.ts, bends.test.ts, physics-objects-demo.test.ts |
| 15 | HUD bend counter | ui/hud.ts |
| 16 | Mobile bend button | ui/hud.ts |
| 17 | Full integration verification | (verification only) |

## Stretch: Pressure Plate

After core integration is verified, add a pressure plate system:

- New type: `PressurePlate { x, z, radius, massThreshold, activated, mesh }`
- Add to RoomDefinition: `pressurePlates?: PressurePlate[]`
- Render as glowing floor circle
- Each frame: check if any physics object with mass >= threshold has velocity < 0.1 and overlaps the plate
- On activation: emit event, particle burst, audio sting, glow intensifies
- Place one in Workshop room — position it so the enlarged rock (mass 4.0) triggers it but normal rock (mass 2.0) doesn't (threshold ~3.0)
