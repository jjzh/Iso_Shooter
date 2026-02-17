# Vertical Combat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Y-axis physics, jump, launch, grab/dunk, terrain height zones, and ground/air moveset split to create a DMC-inspired aerial combat sandbox from an isometric camera.

**Architecture:** Fork `explore/vertical` from `explore/hades`, cherry-pick QoL from `explore/rule-bending`. Extend existing 2D XZ physics with Y component (gravity, air control, landing). Contextual verb system: same inputs produce different actions grounded vs. airborne. AABB height zones for Supervive-style multi-tier terrain.

**Tech Stack:** Three.js (CDN global), TypeScript, esbuild, vitest

**Design doc:** `docs/plans/2026-02-16-vertical-combat-design.md`

---

## Phase 0: Branch Setup & Cherry-Pick

### Task 0.1: Create explore/vertical branch from explore/hades

**Step 1: Create the branch**

```bash
git checkout explore/hades
git checkout -b explore/vertical
```

**Step 2: Verify starting point**

Run: `npm test`
Expected: 552+ tests passing

Run: `npm run build`
Expected: Clean build

**Step 3: Commit a marker**

```bash
git commit --allow-empty -m "chore: start explore/vertical branch from explore/hades"
```

### Task 0.2: Cherry-pick collision fixes from rule-bending

These 9 commits fix wall sliding, nudging, visual/collision sync, and physics object persistence. They primarily modify `src/engine/physics.ts`.

**Step 1: Cherry-pick collision fixes one at a time**

```bash
git cherry-pick 68cef01  # fix: objects slide along walls instead of getting stuck
git cherry-pick 7f46457  # fix: nudge objects off walls when pushed to prevent sticking
git cherry-pick 235a5e2  # fix: visual/collision mismatch + solid body blocking
git cherry-pick e9fb3ca  # fix: objects against walls no longer lose collision
git cherry-pick fa10c05  # fix: objects can no longer be pushed through wall-pinned objects
git cherry-pick f3a5117  # fix: wall nudge uses wall normal instead of push direction
git cherry-pick c0be667  # fix: crate visual now fits inside collision circle
git cherry-pick f099773  # fix: replace box geometry with 6-sided cylinder for crates
git cherry-pick e72184b  # fix: physics objects no longer become ghost objects on wall slam
```

If conflicts arise on any commit: resolve manually, `git add .`, `git cherry-pick --continue`.

**Step 2: Test after batch**

Run: `npm run build && npm test`
Expected: Build succeeds. Tests pass (some new test files may come along).

### Task 0.3: Cherry-pick physics objects + level editor from rule-bending

These commits add the PhysicsObject system, destructible obstacles, and the full level editor.

**Step 1: Cherry-pick physics object system**

```bash
git cherry-pick 1755573  # feat: add physics object config + factory function
git cherry-pick 0a7f9b3  # feat: add object velocity integration with wall slam + pit fall
git cherry-pick 47ad76b  # feat: add object-object and object-enemy collision
git cherry-pick bafda52  # feat: force push now affects physics objects
git cherry-pick 93d87c2  # feat: destructible obstacles take damage from physics objects
git cherry-pick b7339d9  # feat: rooms spawn physics objects
git cherry-pick cd78aa2  # feat: tuning panel for physics objects + pit fall safety net
git cherry-pick 4fa9839  # feat: physics object meshes + destructible visual distinction
git cherry-pick fd25c46  # feat: audio + particle feedback for object collisions
```

**Step 2: Cherry-pick level editor**

```bash
git cherry-pick e4015a2  # feat: level editor with spatial resize handles
```

Note: commit 36c73c2 (targetable object highlights) and d712a18 (force push release fix) contain bend-specific code. Skip these — extract any useful parts manually if needed.

**Step 3: Test after batch**

Run: `npm run build && npm test`
Expected: Build succeeds, all tests pass.

**Step 4: Commit any conflict resolution**

If you had to resolve conflicts, ensure everything is committed cleanly.

### Task 0.4: Remap input — LMB hold for force push, E for launch, Shift for dash

This task rewires the control scheme before adding new mechanics. Currently: LMB = attack, E = force push (ultimate), Space = dash. New: LMB tap = attack, LMB hold = force push, E = launch/grab/dunk (new), Space = jump, Shift = dash.

**Files:**
- Modify: `src/engine/input.ts` — remap keys
- Modify: `src/entities/player.ts` — consume new input signals
- Modify: `src/engine/game.ts` — if any input routing there

**Step 1: Write failing tests**

Create: `tests/input-remap.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Input remapping', () => {
  it('Space should map to jump (not dash)', () => {
    // Verify inputState.jump is set on Space keydown
    // Verify inputState.dash is NOT set on Space keydown
  });

  it('Left Shift should map to dash', () => {
    // Verify inputState.dash is set on ShiftLeft keydown
  });

  it('E should map to launch action (not ultimate/force push)', () => {
    // Verify inputState.launch is set on KeyE keydown
    // Verify inputState.ultimate is NOT set on KeyE keydown
  });

  it('LMB hold (>200ms) should trigger force push charge', () => {
    // Verify: mousedown sets inputState.attack = true
    // Verify: if held > 200ms without release, inputState.chargeStarted = true
  });

  it('LMB tap (<200ms) should trigger melee attack', () => {
    // Verify: quick mousedown+mouseup sets inputState.attack = true
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/input-remap.test.ts`
Expected: FAIL

**Step 3: Implement input remapping**

In `src/engine/input.ts`:
- Change Space (`' '`) from setting `dash = true` to setting `jump = true`
- Add `jump: boolean` to inputState
- Change `ShiftLeft` to set `dash = true`
- Change `KeyE` from setting `ultimate = true` to setting `launch = true`
- Add `launch: boolean` to inputState
- Add LMB hold detection: track `mouseDownTime`, if held > 200ms set `chargeStarted = true`
- Add `chargeStarted: boolean` to inputState
- Update `consumeInput()` to reset new fields

In `src/types/index.ts`:
- Add `jump: boolean`, `launch: boolean` to InputState type

In `src/entities/player.ts`:
- Wire `inputState.jump` to trigger jump (placeholder — actual jump physics in Task 1.2)
- Wire `inputState.launch` to trigger launch (placeholder — actual launch in Task 3.1)
- Wire LMB hold to trigger force push charge (move existing `inputState.ultimate` logic to LMB hold)
- Keep LMB tap as melee attack

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/input-remap.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass. Some existing tests may need input field updates.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: remap inputs — LMB hold for force push, E for launch, Shift for dash, Space for jump"
```

---

## Phase 1: Y-Axis Physics Foundation

### Task 1.1: Add Y-axis to velocity and position types

**Files:**
- Modify: `src/types/index.ts` — add `y` to vel
- Modify: `src/engine/physics.ts` — update velocity integration
- Modify: `src/config/physics.ts` — add gravity/air physics config
- Test: `tests/vertical-physics.test.ts`

**Step 1: Write failing tests**

Create: `tests/vertical-physics.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';

describe('Y-axis physics config', () => {
  it('should have gravity config', () => {
    expect(PHYSICS.gravity).toBeGreaterThan(0);
    expect(PHYSICS.gravity).toBeLessThan(100);
  });

  it('should have terminal velocity', () => {
    expect(PHYSICS.terminalVelocity).toBeGreaterThan(0);
  });

  it('should have air control multiplier', () => {
    expect(PHYSICS.airControlMult).toBeGreaterThanOrEqual(0);
    expect(PHYSICS.airControlMult).toBeLessThanOrEqual(1);
  });
});

describe('Y-axis velocity integration', () => {
  it('entity with positive velY should rise', () => {
    // Create mock enemy with vel.y = 10, pos.y = 0
    // Call applyVelocities with dt = 0.016
    // Expect pos.y > 0
  });

  it('gravity should decelerate upward velocity', () => {
    // Create mock enemy with vel.y = 10
    // After applyVelocities, vel.y should be less than 10
  });

  it('entity should not fall below ground height 0', () => {
    // Create mock enemy with pos.y = 0.1, vel.y = -20
    // After applyVelocities, pos.y should be >= 0
    // vel.y should be 0 (landed)
  });

  it('airborne entity should have full XZ movement (air control = 1.0)', () => {
    // Create mock enemy with pos.y = 5 (airborne)
    // XZ friction should not apply while airborne
  });

  it('XZ friction applies only when grounded', () => {
    // Create mock enemy with pos.y = 0 (grounded), vel.x = 5
    // After applyVelocities, vel.x should be reduced by friction
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/vertical-physics.test.ts`
Expected: FAIL

**Step 3: Add Y-axis physics config**

In `src/config/physics.ts`, add to PHYSICS object:

```typescript
// Y-axis / vertical physics
gravity: 25,              // units/s² downward acceleration
terminalVelocity: 20,     // max downward Y velocity
airControlMult: 1.0,      // XZ movement multiplier while airborne (1.0 = full control)
landingLagBase: 50,       // ms of landing lag (minimum)
landingLagPerSpeed: 10,   // ms of landing lag per unit of fall speed
groundEpsilon: 0.05,      // height threshold for "grounded" detection
```

**Step 4: Extend velocity type**

In `src/types/index.ts`, find the Enemy vel type and change:
```typescript
vel: { x: number; y: number; z: number };  // was { x: number; z: number }
```

**Step 5: Update applyVelocities in physics.ts**

In `src/engine/physics.ts`, function `applyVelocities()` (~line 229):

1. After `const vel = (enemy as any).vel;` — ensure vel.y exists: `if (vel.y === undefined) vel.y = 0;`
2. In the substep loop (line 252-266), add Y integration:
   ```typescript
   enemy.pos.y += vel.y * subDt;
   ```
3. After the substep loop, add gravity:
   ```typescript
   // Apply gravity
   if (enemy.pos.y > PHYSICS.groundEpsilon) {
     vel.y -= PHYSICS.gravity * dt;
     vel.y = Math.max(vel.y, -PHYSICS.terminalVelocity);
   }
   ```
4. Add ground clamping:
   ```typescript
   // Ground collision
   const groundHeight = 0; // TODO: getGroundHeight(enemy.pos.x, enemy.pos.z) in Task 2.1
   if (enemy.pos.y < groundHeight) {
     enemy.pos.y = groundHeight;
     vel.y = 0;
   }
   ```
5. Make XZ friction conditional on grounded:
   ```typescript
   const isGrounded = enemy.pos.y <= groundHeight + PHYSICS.groundEpsilon;
   if (isGrounded) {
     // existing XZ friction code
   }
   // If airborne, no XZ friction (full air control)
   ```
6. Update the speed calculation (line 237) to include Y:
   ```typescript
   const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z); // Keep 2D for XZ friction
   const speed3D = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z); // For min velocity check
   ```

**Step 6: Initialize vel.y on enemy spawn**

In `src/entities/enemy.ts`, find where `vel: { x: 0, z: 0 }` is set (~line 114) and change to:
```typescript
vel: { x: 0, y: 0, z: 0 }
```

**Step 7: Sync mesh Y position**

In `src/engine/physics.ts`, everywhere `(enemy as any).mesh.position.copy(enemy.pos)` is called, this already works because `pos` is a Vector3 with a `y` component. Verify that `enemy.pos.y` flows through to `mesh.position.y`.

**Step 8: Run tests**

Run: `npx vitest run tests/vertical-physics.test.ts`
Expected: PASS

Run: `npm test`
Expected: All existing tests still pass (vel.y = 0 by default, no behavioral change for grounded entities).

**Step 9: Commit**

```bash
git add -A && git commit -m "feat: add Y-axis velocity, gravity, ground clamping to physics system"
```

### Task 1.2: Player jump

**Files:**
- Modify: `src/entities/player.ts` — add jump state machine
- Modify: `src/engine/input.ts` — ensure jump input wired (from Task 0.4)
- Test: `tests/player-jump.test.ts`

**Step 1: Write failing tests**

Create: `tests/player-jump.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Player jump', () => {
  it('jump input sets player velY to jumpVelocity', () => {
    // Simulate jump input while grounded
    // Expect player velY = JUMP.initialVelocity (positive, upward)
  });

  it('cannot jump while airborne', () => {
    // Set player posY > 0 (airborne)
    // Simulate jump input
    // Expect no change to velY
  });

  it('cannot jump during dash', () => {
    // Set player isDashing = true
    // Simulate jump input
    // Expect no change
  });

  it('gravity pulls player down after jump apex', () => {
    // Set player posY = 3, velY = 0 (at apex)
    // Update one frame
    // Expect posY decreased, velY negative
  });

  it('player lands when posY reaches ground', () => {
    // Set player posY = 0.1, velY = -5
    // Update one frame
    // Expect posY = 0, velY = 0, isGrounded = true
  });

  it('player has full air control while airborne', () => {
    // Set player posY = 3 (airborne)
    // Provide moveX/moveZ input
    // Expect XZ movement at airControlMult * speed
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/player-jump.test.ts`
Expected: FAIL

**Step 3: Add jump config**

In `src/config/player.ts`, add:
```typescript
export const JUMP = {
  initialVelocity: 12,    // upward velocity on jump
  gravity: 25,             // player gravity (may differ from enemy gravity)
  airControlMult: 1.0,     // XZ speed multiplier while airborne
  landingLag: 50,          // ms of end-lag on landing
  coyoteTime: 80,          // ms of grace period after walking off ledge
};
```

**Step 4: Implement player jump**

In `src/entities/player.ts`:

1. Add state variables:
   ```typescript
   let playerVelY = 0;
   let playerPosY = 0;
   let isPlayerAirborne = false;
   let landingLagTimer = 0;
   ```

2. In `updatePlayer()`, add jump trigger (after dash check, before movement):
   ```typescript
   // Jump
   if (input.jump && !isPlayerAirborne && !isDashing && landingLagTimer <= 0) {
     playerVelY = JUMP.initialVelocity;
     isPlayerAirborne = true;
     emit({ type: 'playerJump', position: { x: playerPos.x, z: playerPos.z } });
   }
   ```

3. Add Y-axis physics for player (after XZ movement):
   ```typescript
   // Player Y physics
   if (isPlayerAirborne) {
     playerVelY -= JUMP.gravity * dt;
     playerPosY += playerVelY * dt;

     if (playerPosY <= 0) { // TODO: getGroundHeight in Task 2.1
       playerPosY = 0;
       playerVelY = 0;
       isPlayerAirborne = false;
       landingLagTimer = JUMP.landingLag;
       emit({ type: 'playerLand', position: { x: playerPos.x, z: playerPos.z }, fallSpeed: Math.abs(playerVelY) });
     }
   }
   playerPos.y = playerPosY;
   ```

4. Export `isPlayerAirborne` and `getPlayerPosY()` for other systems.

5. Add `'playerJump'` and `'playerLand'` to event types in `src/engine/events.ts`.

**Step 5: Run tests**

Run: `npx vitest run tests/player-jump.test.ts`
Expected: PASS

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: player jump with gravity, air control, landing lag"
```

### Task 1.3: Ground shadows for height readability

**Files:**
- Modify: `src/entities/player.ts` or `src/engine/renderer.ts` — add shadow meshes
- Modify: `src/entities/enemy.ts` — add shadow meshes to enemies

**Step 1: Implement ground shadows**

For every entity (player + enemies), create a flat dark circle mesh:

```typescript
const shadowGeo = new THREE.CircleGeometry(radius * 0.8, 16);
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});
const shadow = new THREE.Mesh(shadowGeo, shadowMat);
shadow.rotation.x = -Math.PI / 2; // Lay flat on ground
shadow.position.y = 0.01; // Slightly above ground to prevent z-fighting
```

Each frame, update shadow:
```typescript
shadow.position.x = entity.pos.x;
shadow.position.z = entity.pos.z;
shadow.position.y = groundHeight + 0.01; // TODO: getGroundHeight in Task 2.1
const altitude = entity.pos.y - groundHeight;
const scale = Math.max(0.3, 1 - altitude * 0.1); // Shrinks with height
shadow.scale.set(scale, scale, 1);
shadow.material.opacity = Math.max(0.1, 0.3 - altitude * 0.03);
```

**Step 2: Test visually**

Run: `npm run build`
Open in browser, jump with Space. Verify:
- Shadow stays on ground
- Shadow shrinks as player rises
- Shadow fades slightly with altitude

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: ground shadows for player and enemies — height readability"
```

---

## Phase 2: Terrain Height Zones

### Task 2.1: Height zone data model and ground sampling

**Files:**
- Create: `src/config/terrain.ts` — HeightZone type and getGroundHeight function
- Modify: `src/config/rooms.ts` — add heightZones to room definitions
- Modify: `src/config/arena.ts` — store current room's height zones
- Test: `tests/terrain.test.ts`

**Step 1: Write failing tests**

Create: `tests/terrain.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Terrain height zones', () => {
  it('getGroundHeight returns 0 for empty terrain', () => {
    // No height zones set
    // Expect getGroundHeight(5, 5) === 0
  });

  it('getGroundHeight returns zone height when inside zone', () => {
    // Set one zone: { x: 0, z: 0, width: 4, depth: 4, height: 3 }
    // Expect getGroundHeight(0, 0) === 3
    // Expect getGroundHeight(1.5, 1.5) === 3
  });

  it('getGroundHeight returns 0 when outside all zones', () => {
    // Same zone as above
    // Expect getGroundHeight(10, 10) === 0
  });

  it('overlapping zones returns highest', () => {
    // Zone A: height 2, Zone B (overlapping): height 5
    // Expect getGroundHeight at overlap === 5
  });

  it('entity is airborne when posY > groundHeight + epsilon', () => {
    // Zone height 3, entity posY 3.1 → airborne
    // Entity posY 3.0 → grounded
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/terrain.test.ts`
Expected: FAIL

**Step 3: Implement terrain system**

Create `src/config/terrain.ts`:

```typescript
export interface HeightZone {
  x: number;      // center X
  z: number;      // center Z
  width: number;  // full width (not half)
  depth: number;  // full depth (not half)
  height: number; // floor height of this platform
}

let currentHeightZones: HeightZone[] = [];

export function setHeightZones(zones: HeightZone[]): void {
  currentHeightZones = zones;
}

export function getHeightZones(): HeightZone[] {
  return currentHeightZones;
}

export function getGroundHeight(x: number, z: number): number {
  let maxHeight = 0;
  for (const zone of currentHeightZones) {
    const halfW = zone.width / 2;
    const halfD = zone.depth / 2;
    if (x >= zone.x - halfW && x <= zone.x + halfW &&
        z >= zone.z - halfD && z <= zone.z + halfD) {
      if (zone.height > maxHeight) maxHeight = zone.height;
    }
  }
  return maxHeight;
}
```

**Step 4: Wire into room loading**

In `src/config/rooms.ts`, add `heightZones: HeightZone[]` to room definitions (empty array for existing rooms).

In `src/engine/roomManager.ts`, when loading a room, call `setHeightZones(room.heightZones)`.

**Step 5: Wire into physics**

In `src/engine/physics.ts`, replace hardcoded `groundHeight = 0` with `getGroundHeight(enemy.pos.x, enemy.pos.z)`.

In `src/entities/player.ts`, replace hardcoded `0` ground checks with `getGroundHeight(playerPos.x, playerPos.z)`.

**Step 6: Run tests**

Run: `npx vitest run tests/terrain.test.ts`
Expected: PASS

Run: `npm test`
Expected: All tests pass (existing rooms have empty heightZones, so getGroundHeight returns 0 everywhere — no behavioral change).

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: AABB height zones with getGroundHeight sampling"
```

### Task 2.2: Terrain rendering — platforms with cliff faces

**Files:**
- Modify: `src/engine/renderer.ts` or create `src/engine/terrainRenderer.ts`

**Step 1: Implement platform rendering**

For each HeightZone, render:
1. **Top surface**: BoxGeometry with the zone's dimensions, positioned at zone.height
2. **Cliff faces**: The sides of the box below the top surface. Use a darker material.

```typescript
function renderHeightZone(zone: HeightZone, scene: THREE.Scene): THREE.Mesh {
  const geo = new THREE.BoxGeometry(zone.width, zone.height, zone.depth);
  const topMat = new THREE.MeshStandardMaterial({ color: 0x556655 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x334433 });
  const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]; // +x,-x,+y,-y,+z,-z
  const mesh = new THREE.Mesh(geo, materials);
  mesh.position.set(zone.x, zone.height / 2, zone.z);
  scene.add(mesh);
  return mesh;
}
```

**Step 2: Wire into room loading**

When room loads, call `renderHeightZone` for each zone. When room unloads, remove meshes.

**Step 3: Add a test room with height zones**

Add height zones to one room definition in `rooms.ts` for testing:

```typescript
heightZones: [
  { x: -5, z: 5, width: 6, depth: 6, height: 2 },   // low platform
  { x: 5, z: -5, width: 4, depth: 4, height: 4 },    // high platform
]
```

**Step 4: Test visually**

Run: `npm run build`, play through to the test room. Verify platforms render with visible cliff faces and the player can jump onto them.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: terrain rendering — platform boxes with cliff face materials"
```

### Task 2.3: Ledge walking — fall off edges, can't walk up

**Files:**
- Modify: `src/entities/player.ts` — check ground height changes during movement
- Modify: `src/engine/physics.ts` — enemy ledge falling

**Step 1: Write failing tests**

Add to `tests/terrain.test.ts`:

```typescript
describe('Ledge behavior', () => {
  it('entity walking off platform edge should become airborne', () => {
    // Platform at x=0..4, height 3. Entity at x=3.9, posY=3
    // Move entity to x=4.1 (off edge)
    // getGroundHeight(4.1, z) = 0
    // Entity posY (3) > groundHeight (0) → airborne, gravity takes over
  });

  it('entity cannot walk onto higher platform from ground level', () => {
    // Platform height 3. Entity at ground (posY=0), walking toward platform
    // Platform edge is like a wall at ground level — collide, don't walk through
    // This requires treating platform edges as collision bounds when entity is below platform height
  });
});
```

**Step 2: Implement ledge physics**

The key insight: height zones need to act as **collision walls** for entities that are below the platform height. An entity at posY=0 can't walk through a height=3 platform — it's a wall. An entity at posY=3 can walk on top of it.

In collision detection (`resolveMovementCollision` / `resolveTerrainCollisionEx`):
```typescript
for (const zone of getHeightZones()) {
  const entityHeight = entity.pos.y;
  // If entity is below the platform top, treat it as a wall
  if (entityHeight < zone.height - stepHeight) {
    // Add zone AABB to collision bounds
  }
  // If entity is at or above platform height, it's walkable (no collision)
}
```

`stepHeight` is a small threshold (e.g. 0.3) — entities can auto-step up tiny height differences but not tall platforms.

**Step 3: Run tests**

Run: `npx vitest run tests/terrain.test.ts`
Expected: PASS

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: ledge physics — fall off edges, platforms block below-height entities"
```

---

## Phase 3: Launch, Aerial Strike, and Self-Slam

### Task 3.1: Launch verb (E while grounded)

**Files:**
- Modify: `src/entities/player.ts` — add launch action
- Modify: `src/engine/physics.ts` — apply upward velocity to enemies
- Create: `src/config/launch.ts` — launch config
- Test: `tests/launch.test.ts`

**Step 1: Write failing tests**

Create: `tests/launch.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Launch mechanic', () => {
  it('E while grounded applies upward velocity to enemies in cone', () => {
    // Player at origin, facing +Z
    // Enemy at (0, 0, 2) — in front, within range
    // Trigger launch
    // Expect enemy.vel.y > 0 (launched upward)
  });

  it('launch does not affect enemies outside range', () => {
    // Enemy at distance > LAUNCH.range
    // Trigger launch
    // Expect enemy.vel.y === 0
  });

  it('launch does not affect enemies behind player', () => {
    // Enemy behind player (outside arc)
    // Trigger launch
    // Expect enemy.vel.y === 0
  });

  it('launched enemy becomes airborne', () => {
    // After launch, update physics for a few frames
    // Expect enemy.pos.y > 0
  });

  it('launch has a cooldown', () => {
    // Trigger launch, immediately try again
    // Second launch should not fire
  });

  it('heavier enemies get less launch velocity', () => {
    // Goblin (mass 1) vs Golem (mass 3)
    // Same launch, golem vel.y should be less
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/launch.test.ts`
Expected: FAIL

**Step 3: Create launch config**

Create `src/config/launch.ts`:

```typescript
export const LAUNCH = {
  range: 3.0,            // max distance to hit
  arc: 2.0,              // radians (~115°) — generous cone
  upwardVelocity: 15,    // base upward vel applied to enemies
  cooldown: 500,         // ms between launches
  screenShake: 2.0,      // shake intensity
  hitPause: 30,          // ms freeze frame
};
```

**Step 4: Implement launch in player.ts**

In `src/entities/player.ts`:

1. Add launch state:
   ```typescript
   let launchCooldownTimer = 0;
   ```

2. In `updatePlayer()`, after existing melee/dash checks:
   ```typescript
   // Launch (E while grounded)
   if (input.launch && !isPlayerAirborne && launchCooldownTimer <= 0 && !isDashing) {
     launchCooldownTimer = LAUNCH.cooldown;
     // Find enemies in launch cone using existing arc math (meleemath.ts)
     const launchDir = aimAngle;
     const enemies = findEnemiesInArc(gameState.enemies, playerPos, launchDir, LAUNCH.range, LAUNCH.arc);
     for (const enemy of enemies) {
       const mass = enemy.config.mass ?? 1;
       enemy.vel.y = LAUNCH.upwardVelocity / mass;
       emit({ type: 'enemyLaunched', enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
     }
     emit({ type: 'playerLaunch', position: { x: playerPos.x, z: playerPos.z }, direction: { x: Math.sin(launchDir), z: Math.cos(launchDir) } });
   }
   launchCooldownTimer = Math.max(0, launchCooldownTimer - dt * 1000);
   ```

3. Add `'playerLaunch'` and `'enemyLaunched'` to events.ts.

**Step 5: Run tests**

Run: `npx vitest run tests/launch.test.ts`
Expected: PASS

Run: `npm test`
Expected: All pass

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: launch verb — E pops enemies upward with mass-based scaling"
```

### Task 3.2: Aerial melee strike (LMB while airborne)

**Files:**
- Modify: `src/entities/player.ts` — aerial attack state
- Modify: `src/engine/physics.ts` — aerial hit detection with tall hitbox
- Test: `tests/aerial-strike.test.ts`

**Step 1: Write failing tests**

Create: `tests/aerial-strike.test.ts`

```typescript
describe('Aerial melee strike', () => {
  it('LMB while airborne triggers aerial strike (not ground melee)', () => {
    // Player airborne (posY > 0)
    // Trigger attack
    // Expect aerial strike state, not ground swing
  });

  it('aerial strike hitbox is vertically generous', () => {
    // Player at posY = 4, enemy at posY = 2
    // Aerial strike should still hit (tall capsule hitbox)
  });

  it('aerial strike has downward angle knockback', () => {
    // Hit an airborne enemy with aerial strike
    // Expect vel.y component is negative (pushed downward)
  });
});
```

**Step 2: Implement aerial melee**

In `src/entities/player.ts`, modify the melee trigger:

```typescript
if (input.attack && meleeCooldownTimer <= 0 && !isDashing) {
  if (isPlayerAirborne) {
    // Aerial strike — different arc, downward knockback
    startAerialStrike(aimAngle, gameState);
  } else {
    // Ground melee — existing code
    startMeleeSwing(aimAngle, gameState);
  }
}
```

In `src/engine/physics.ts`, for aerial hit detection:
```typescript
function checkAerialHits(gameState: GameState): void {
  // Similar to checkMeleeHits but:
  // - Uses tall vertical hitbox (check Y distance tolerance, e.g. ±3 units)
  // - Knockback direction has downward Y component
  // - Can hit enemies at different heights
}
```

**Step 3: Run tests, commit**

```bash
git add -A && git commit -m "feat: aerial melee strike with tall hitbox and downward knockback"
```

### Task 3.3: Self-slam (E while airborne, no enemy nearby)

**Files:**
- Modify: `src/entities/player.ts` — self-slam state
- Test: `tests/self-slam.test.ts`

**Step 1: Write failing tests**

```typescript
describe('Self-slam', () => {
  it('E while airborne with no nearby airborne enemy triggers self-slam', () => {
    // Player at posY = 5, no airborne enemies within grab range
    // Press E
    // Expect player velY set to large negative (fast drop)
  });

  it('self-slam landing deals AoE damage', () => {
    // Player self-slams, lands near grounded enemies
    // Expect enemies in radius take damage
  });

  it('self-slam does not trigger if airborne enemy is within grab range', () => {
    // Player airborne, enemy airborne and within range
    // Press E → should trigger grab (Task 4), not self-slam
  });
});
```

**Step 2: Implement self-slam**

In `src/entities/player.ts`:

```typescript
// E while airborne
if (input.launch && isPlayerAirborne) {
  const nearbyAirborne = findNearbyAirborneEnemy(gameState, playerPos, GRAB.range);
  if (nearbyAirborne) {
    startGrab(nearbyAirborne); // Task 4
  } else {
    startSelfSlam(); // Fast drop
  }
}
```

Self-slam:
```typescript
function startSelfSlam() {
  isSelfSlamming = true;
  playerVelY = -SLAM.downwardVelocity; // e.g. -30, very fast
  emit({ type: 'playerSelfSlam', position: { x: playerPos.x, z: playerPos.z } });
}
```

On landing while self-slamming:
```typescript
if (isSelfSlamming && !isPlayerAirborne) {
  // AoE damage to nearby grounded enemies
  const radius = SLAM.aoeRadius;
  for (const enemy of gameState.enemies) {
    const dist = distance2D(playerPos, enemy.pos);
    if (dist < radius && enemy.pos.y < PHYSICS.groundEpsilon) {
      applyDamageToEnemy(enemy, SLAM.aoeDamage, gameState);
      // Knockback away from landing point
    }
  }
  isSelfSlamming = false;
  emit({ type: 'playerSlamLand', position: { x: playerPos.x, z: playerPos.z } });
}
```

Create `src/config/slam.ts`:
```typescript
export const SLAM = {
  downwardVelocity: 30,  // very fast drop
  aoeDamage: 20,
  aoeRadius: 3,
  aoeKnockback: 8,
  screenShake: 4,
  landingLag: 200,       // longer than normal landing
};
```

**Step 3: Run tests, commit**

```bash
git add -A && git commit -m "feat: self-slam — E while airborne drops fast with AoE on landing"
```

---

## Phase 4: Grab and Dunk

### Task 4.1: Grab mechanic (E near airborne enemy while airborne)

**Files:**
- Modify: `src/entities/player.ts` — grab state machine
- Create: `src/config/grab.ts` — grab/dunk config
- Test: `tests/grab-dunk.test.ts`

**Step 1: Write failing tests**

Create: `tests/grab-dunk.test.ts`

```typescript
describe('Grab mechanic', () => {
  it('E near airborne enemy while airborne starts grab', () => {
    // Player airborne, enemy airborne, within grab range
    // Press E → grab state active
  });

  it('gravity pauses for player and grabbed enemy during hold', () => {
    // Grab active
    // Update several frames
    // Expect player posY unchanged, enemy posY unchanged
    // Expect player velY = 0, enemy velY = 0
  });

  it('grab has a maximum hold duration', () => {
    // Grab active, wait beyond holdDuration
    // Expect grab ends, default dunk (straight down)
  });

  it('grab range check uses 3D distance', () => {
    // Player at (0, 5, 0), enemy at (0, 5, 2) — close in XZ, same height → in range
    // Player at (0, 5, 0), enemy at (0, 1, 1) — close in XZ, far in Y → out of range
  });
});

describe('Dunk mechanic', () => {
  it('releasing grab with aim sends enemy toward aim point', () => {
    // Grab active, cursor aimed at (5, 0, 5)
    // Release → enemy gets velocity toward that point
  });

  it('default dunk (no aim) sends enemy straight down', () => {
    // Grab expires without aim input
    // Enemy gets large negative velY, zero XZ
  });

  it('dunked enemy deals wall slam damage on wall impact', () => {
    // Dunk enemy toward wall
    // Expect wall slam event fires
  });

  it('dunked enemy deals collision damage to other enemies', () => {
    // Dunk enemy into another grounded enemy
    // Expect enemy-enemy collision damage
  });

  it('dunked enemy into pit is instant kill', () => {
    // Dunk enemy toward pit location
    // Enemy should fall in pit and die
  });

  it('player resumes falling after dunk release', () => {
    // After dunk fires, player gravity resumes
    // Player should start falling
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/grab-dunk.test.ts`
Expected: FAIL

**Step 3: Create grab/dunk config**

Create `src/config/grab.ts`:

```typescript
export const GRAB = {
  range: 3.0,           // max distance to grab airborne enemy
  holdDuration: 350,    // ms of gravity pause (aim window)
  dunkVelocity: 25,     // speed at which enemy is spiked
  dunkDamage: 15,       // bonus damage on dunk impact
  screenShake: 3,
  hitPause: 50,         // freeze frame on grab connect
};
```

**Step 4: Implement grab state machine**

In `src/entities/player.ts`:

```typescript
// Grab state
let isGrabbing = false;
let grabTarget: any = null;
let grabTimer = 0;
let grabAimAngle = 0;

function startGrab(enemy: any) {
  isGrabbing = true;
  grabTarget = enemy;
  grabTimer = GRAB.holdDuration;
  // Freeze both
  playerVelY = 0;
  enemy.vel.y = 0;
  enemy.vel.x = 0;
  enemy.vel.z = 0;
  // Position enemy near player
  emit({ type: 'grabStart', enemy, position: { x: playerPos.x, z: playerPos.z } });
}

function updateGrab(dt: number, input: InputState) {
  if (!isGrabbing || !grabTarget) return;

  grabTimer -= dt * 1000;

  // Keep enemy locked near player
  grabTarget.pos.x = playerPos.x + Math.sin(aimAngle) * 0.5;
  grabTarget.pos.z = playerPos.z + Math.cos(aimAngle) * 0.5;
  grabTarget.pos.y = playerPosY;
  grabTarget.mesh.position.copy(grabTarget.pos);

  // Gravity paused — don't update playerVelY or playerPosY

  // Check for dunk release (attack input or timer expires)
  if (input.attack || grabTimer <= 0) {
    executeDunk();
  }
}

function executeDunk() {
  if (!grabTarget) return;

  // Calculate dunk direction from player to cursor aim point
  const aimWorld = getInputState().aimWorldPos;
  const dx = aimWorld.x - grabTarget.pos.x;
  const dz = aimWorld.z - grabTarget.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 0.5) {
    // Aimed dunk — spike toward cursor
    const nx = dx / dist;
    const nz = dz / dist;
    grabTarget.vel.x = nx * GRAB.dunkVelocity;
    grabTarget.vel.z = nz * GRAB.dunkVelocity;
    grabTarget.vel.y = -GRAB.dunkVelocity * 0.5; // Angled downward
  } else {
    // Default — straight down
    grabTarget.vel.y = -GRAB.dunkVelocity;
    grabTarget.vel.x = 0;
    grabTarget.vel.z = 0;
  }

  emit({ type: 'dunk', enemy: grabTarget, position: { x: grabTarget.pos.x, z: grabTarget.pos.z } });

  // Resume player gravity
  isGrabbing = false;
  grabTarget = null;
}
```

**Step 5: Add events**

In `src/engine/events.ts`, add:
```typescript
| { type: 'grabStart'; enemy: any; position: { x: number; z: number } }
| { type: 'dunk'; enemy: any; position: { x: number; z: number } }
| { type: 'playerJump'; position: { x: number; z: number } }
| { type: 'playerLand'; position: { x: number; z: number }; fallSpeed: number }
| { type: 'playerLaunch'; position: { x: number; z: number }; direction: { x: number; z: number } }
| { type: 'enemyLaunched'; enemy: any; position: { x: number; z: number } }
| { type: 'playerSelfSlam'; position: { x: number; z: number } }
| { type: 'playerSlamLand'; position: { x: number; z: number } }
```

**Step 6: Run tests**

Run: `npx vitest run tests/grab-dunk.test.ts`
Expected: PASS

Run: `npm test`
Expected: All pass

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: grab and dunk — E grabs airborne enemy, gravity pauses, aim and spike"
```

---

## Phase 5: Animations

### Task 5.1: Jump and fall animations

**Files:**
- Modify: `src/entities/playerAnimator.ts` — add jump, fall, land states

**Step 1: Extend AnimState**

In `playerAnimator.ts` line 68:
```typescript
type AnimState = 'idle' | 'run' | 'dash' | 'endLag' | 'swing' | 'jump' | 'fall' | 'land' | 'aerialStrike' | 'launch' | 'grab' | 'dunk' | 'selfSlam' | 'airDash';
```

**Step 2: Add state transition logic**

In `updateAnimation()` (line 188–226), add before the existing checks:
```typescript
if (isSelfSlamming) {
  if (anim.currentState !== 'selfSlam') transitionTo(anim, 'selfSlam', 0);
} else if (isGrabbing) {
  if (anim.currentState !== 'grab') transitionTo(anim, 'grab', 0);
} else if (isDunking) {
  if (anim.currentState !== 'dunk') transitionTo(anim, 'dunk', 0);
} else if (isAerialStriking) {
  if (anim.currentState !== 'aerialStrike') transitionTo(anim, 'aerialStrike', 0);
} else if (isAirborne && velY > 0) {
  if (anim.currentState !== 'jump') transitionTo(anim, 'jump', C.jumpBlend);
} else if (isAirborne && velY <= 0) {
  if (anim.currentState !== 'fall') transitionTo(anim, 'fall', C.fallBlend);
} else if (isLanding) {
  if (anim.currentState !== 'land') transitionTo(anim, 'land', 0);
}
// ... then existing dash/endLag/swing/run/idle checks
```

**Step 3: Implement pose functions**

```typescript
function applyJump(joints: PlayerJoints, anim: AnimatorState) {
  const t = Math.min(anim.stateTimer / 0.3, 1); // 300ms to full pose
  // Legs tuck up
  joints.thighL.rotation.x = -0.6 * t;
  joints.thighR.rotation.x = -0.6 * t;
  joints.shinL.rotation.x = 0.8 * t;
  joints.shinR.rotation.x = 0.8 * t;
  // Arms rise
  joints.upperArmL.rotation.x = -0.5 * t;
  joints.upperArmR.rotation.x = -0.5 * t;
  // Slight forward lean
  joints.rigRoot.rotation.x = 0.1 * t;
}

function applyFall(joints: PlayerJoints, anim: AnimatorState) {
  const t = Math.min(anim.stateTimer / 0.2, 1);
  // Legs extend down
  joints.thighL.rotation.x = 0.3 * t;
  joints.thighR.rotation.x = 0.3 * t;
  joints.shinL.rotation.x = 0.1 * t;
  joints.shinR.rotation.x = 0.1 * t;
  // Arms spread for balance
  joints.upperArmL.rotation.z = 0.6 * t;
  joints.upperArmR.rotation.z = -0.6 * t;
}

function applyLand(joints: PlayerJoints, anim: AnimatorState) {
  const t = Math.min(anim.stateTimer / 0.1, 1); // 100ms squash
  const squash = 1 - 0.2 * (1 - t); // 0.8 → 1.0
  joints.rigRoot.scale.y = squash;
  joints.rigRoot.scale.x = 2 - squash; // Inverse squash on XZ
  joints.rigRoot.scale.z = 2 - squash;
  joints.thighL.rotation.x = 0.5 * (1 - t);
  joints.thighR.rotation.x = 0.5 * (1 - t);
}
```

**Step 4: Add similar pose functions for aerial strike, launch, grab, dunk, self-slam**

Each follows the same pattern — trigonometric joint rotations based on state timer progress. Exact values will be tuned via the tuning panel.

**Step 5: Add to tuning config C**

```typescript
// Jump/fall/land
jumpBlend: 40,       // ms blend into jump
fallBlend: 60,       // ms blend into fall
landSquash: 0.2,     // how much Y compresses on land
landDuration: 100,   // ms of land animation
```

**Step 6: Test visually, commit**

```bash
git add -A && git commit -m "feat: jump, fall, land, aerial strike, launch, grab, dunk animations"
```

### Task 5.2: Enemy airborne visual states

**Files:**
- Modify: `src/entities/enemy.ts` — add airborne pose transforms

**Step 1: Implement enemy airborne visuals**

In the enemy update loop, after position sync:

```typescript
// Airborne visual state
const isAirborne = enemy.pos.y > PHYSICS.groundEpsilon;
if (isAirborne) {
  // Tilt back (launched pose)
  enemy.mesh.rotation.x = -0.4;
  // Slight spin for visual interest
  enemy.mesh.rotation.z = Math.sin(Date.now() * 0.005) * 0.2;
} else {
  enemy.mesh.rotation.x = 0;
  enemy.mesh.rotation.z = 0;
}
```

For grabbed state:
```typescript
if (enemy.isGrabbed) {
  // Compress (squished in grab)
  enemy.mesh.scale.set(0.8, 0.7, 0.8);
} else {
  enemy.mesh.scale.set(1, 1, 1);
}
```

Landing squash (when transitioning from airborne to grounded):
```typescript
if (wasAirborne && !isAirborne) {
  // Landing squash — scale Y to 0.7, XZ to 1.2, ease back over 150ms
  enemy.landSquashTimer = 150;
}
if (enemy.landSquashTimer > 0) {
  const t = enemy.landSquashTimer / 150;
  enemy.mesh.scale.y = 1 - 0.3 * t;
  enemy.mesh.scale.x = 1 + 0.2 * t;
  enemy.mesh.scale.z = 1 + 0.2 * t;
  enemy.landSquashTimer -= dt * 1000;
}
```

**Step 2: Test visually, commit**

```bash
git add -A && git commit -m "feat: enemy airborne visual states — tilt, spin, grab compress, landing squash"
```

---

## Phase 6: Audio, Particles, and Tuning

### Task 6.1: Audio for vertical events

**Files:**
- Modify: `src/engine/audio.ts` — add launch, slam, grab, dunk sounds

**Step 1: Add procedural sounds**

Subscribe to new events and play synthesized sounds:

| Event | Sound description |
|-------|------------------|
| `playerJump` | Short upward pitch sweep (100→400Hz, 80ms) |
| `playerLand` | Low thump (80Hz, 50ms, noise burst) |
| `playerLaunch` | Rising whoosh (200→800Hz, 150ms, with noise) |
| `enemyLaunched` | Upward "pop" (300→600Hz, 100ms) |
| `grabStart` | Catch sound — mid tone + click (400Hz, 30ms) |
| `dunk` | Heavy downward sweep (600→100Hz, 200ms) + impact thump |
| `playerSlamLand` | Large impact — noise burst + low oscillator (60Hz, 200ms) |

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: procedural audio for jump, launch, grab, dunk, slam"
```

### Task 6.2: Particles for vertical events

**Files:**
- Modify: `src/engine/particles.ts` — add vertical particle presets

**Step 1: Add particle presets**

| Event | Particle effect |
|-------|----------------|
| `playerJump` | Dust burst at feet (downward, brown, 8 particles) |
| `playerLand` | Ground impact ring (outward from landing point, 12 particles) |
| `enemyLaunched` | Upward streak (vertical, yellow-white, 6 particles) |
| `dunk` | Downward streak trail (follows enemy, 4 particles) |
| `playerSlamLand` | Explosive ring (large outward burst, 16 particles) |
| `grabStart` | Convergence effect (particles pull toward grab point, 6 particles) |

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: particle effects for jump, launch, grab, dunk, slam"
```

### Task 6.3: Tuning panel sections for vertical mechanics

**Files:**
- Modify: `src/ui/tuning.ts` — add sections

**Step 1: Add tuning sections**

Add collapsible sections:

**"Jump" section:**
- `JUMP.initialVelocity` (1–30)
- `JUMP.gravity` (5–50)
- `JUMP.airControlMult` (0–1)
- `JUMP.landingLag` (0–200ms)

**"Launch" section:**
- `LAUNCH.range` (1–8)
- `LAUNCH.arc` (0.5–3.14)
- `LAUNCH.upwardVelocity` (5–30)
- `LAUNCH.cooldown` (100–1000ms)

**"Grab/Dunk" section:**
- `GRAB.range` (1–6)
- `GRAB.holdDuration` (100–800ms)
- `GRAB.dunkVelocity` (10–40)
- `GRAB.dunkDamage` (5–40)

**"Slam" section:**
- `SLAM.downwardVelocity` (10–50)
- `SLAM.aoeDamage` (5–40)
- `SLAM.aoeRadius` (1–6)

**"Vertical Physics" section:**
- `PHYSICS.gravity` (5–50)
- `PHYSICS.terminalVelocity` (5–40)
- `PHYSICS.airControlMult` (0–1)

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: tuning panel sections for jump, launch, grab, dunk, slam, vertical physics"
```

---

## Phase 7: Air Dash and Force Push Remap

### Task 7.1: Air dash (Shift while airborne)

**Files:**
- Modify: `src/entities/player.ts` — air dash variant

**Step 1: Implement air dash**

When dash input fires while airborne:
- Horizontal burst in aim direction (same speed as ground dash)
- Maintain current height briefly (gravity paused for dash duration)
- Afterimages like ground dash
- No i-frames? Or same i-frames? (tunable)

```typescript
if (input.dash && dashCooldownRemaining <= 0) {
  if (isPlayerAirborne) {
    startAirDash(aimAngle);
  } else {
    startDash(aimAngle); // existing ground dash
  }
}
```

Air dash freezes Y velocity for its duration, then resumes gravity.

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: air dash — Shift while airborne, horizontal burst, gravity paused during dash"
```

### Task 7.2: Force push on LMB hold (remap from E)

**Files:**
- Modify: `src/entities/player.ts` — wire LMB hold to charge
- Modify: `src/engine/input.ts` — LMB hold detection

**Step 1: Implement LMB hold → force push**

The existing charge/force push system (currently on E) needs to trigger from LMB hold instead:

In input.ts:
```typescript
let mouseDownTime = 0;
const HOLD_THRESHOLD = 200; // ms

// On mousedown: record time, set attack = true
// On each frame while held: if (now - mouseDownTime > HOLD_THRESHOLD) set chargeStarted = true
// On mouseup: if charge was started, set chargeReleased = true
```

In player.ts:
```typescript
// LMB tap (<200ms) → melee attack (existing)
// LMB hold (>200ms) → force push charge (moved from E key)
if (input.chargeStarted && !isCharging) {
  startCharge(); // existing function
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: force push on LMB hold, melee on LMB tap"
```

---

## Phase 8: Integration and Polish

### Task 8.1: Wire dunk outcomes to existing physics

**Files:**
- Modify: `src/engine/physics.ts` — ensure dunked enemies interact with walls, enemies, pits, objects

**Step 1: Verify dunk → wall slam**

A dunked enemy has high velocity. When they hit a wall, the existing wall slam code in `applyVelocities()` should trigger naturally (speed > wallSlamMinSpeed → damage + stun + bounce). Verify this works with the Y component — wall slam detection currently only checks XZ speed, which is correct (walls are vertical, Y speed doesn't contribute to wall impact).

**Step 2: Verify dunk → enemy bowling**

A dunked enemy with high XZ velocity colliding with another enemy should trigger the existing `resolveEnemyCollisions()` momentum transfer and impact damage. Verify the mass-weighted collision handles a fast-moving dunked enemy hitting a stationary one.

**Step 3: Verify dunk → pit kill**

A dunked enemy with XZ velocity toward a pit should get caught by `pointInPit()` check during velocity substeps in `applyVelocities()`. The existing pit fall code handles the rest.

**Step 4: Verify dunk → physics object interaction**

If physics objects are present (cherry-picked from rule-bending), a dunked enemy hitting a physics object should transfer momentum. This depends on the physics object collision code handling enemy-object interactions.

**Step 5: Test all dunk outcomes manually, commit**

```bash
git add -A && git commit -m "fix: verify and tune dunk outcomes — wall slam, bowling, pit kill, object interaction"
```

### Task 8.2: Update HANDOFF.md for explore/vertical

**Files:**
- Create/modify: `HANDOFF.md` in branch root

Document:
- Vision (vertical combat sandbox)
- Current state (what's implemented)
- Verb table
- Config files and tuning panel sections
- What to playtest
- Open questions
- Merge candidates

**Step 1: Commit**

```bash
git add HANDOFF.md && git commit -m "docs: HANDOFF.md for explore/vertical branch"
```

### Task 8.3: Full test suite and build verification

**Step 1: Run full tests**

Run: `npm test`
Expected: All tests pass (original 552+ from hades, plus new vertical tests)

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Clean build

**Step 4: Manual playtest**

Test the core loop:
1. Walk into room with goblins
2. Launch one with E — verify it pops up, shadow stays on ground
3. Jump (Space) — verify player rises, shadow shrinks
4. Grab (E near airborne enemy) — verify gravity pause, enemy locked near you
5. Aim cursor at another enemy, release — verify dunked enemy bowls into target
6. Self-slam (E while airborne, no enemy) — verify fast drop, AoE on landing
7. Air dash (Shift while airborne) — verify horizontal burst
8. Force push (LMB hold) — verify horizontal push still works
9. Melee (LMB tap) while airborne — verify aerial strike
10. Walk off platform edge — verify fall + shadow readability

---

## Task Dependency Graph

```
Phase 0: Branch setup
  0.1 Create branch ──→ 0.2 Cherry-pick collision ──→ 0.3 Cherry-pick physics/editor ──→ 0.4 Input remap

Phase 1: Y-axis foundation (depends on 0.4)
  1.1 Y-axis physics ──→ 1.2 Player jump ──→ 1.3 Ground shadows

Phase 2: Terrain (depends on 1.1)
  2.1 Height zones ──→ 2.2 Terrain rendering ──→ 2.3 Ledge physics

Phase 3: Launch/Strike/Slam (depends on 1.2)
  3.1 Launch ──→ 3.2 Aerial strike ──→ 3.3 Self-slam

Phase 4: Grab/Dunk (depends on 3.1)
  4.1 Grab + Dunk

Phase 5: Animations (depends on 3.3 + 4.1)
  5.1 Player animations ──→ 5.2 Enemy airborne visuals

Phase 6: Audio/Particles/Tuning (depends on 4.1)
  6.1 Audio ──→ 6.2 Particles ──→ 6.3 Tuning panel

Phase 7: Air dash + Force push remap (depends on 1.2)
  7.1 Air dash ──→ 7.2 Force push remap

Phase 8: Integration (depends on all above)
  8.1 Dunk outcomes ──→ 8.2 HANDOFF.md ──→ 8.3 Full verification
```

**Phases 2, 3, and 7 can run in parallel** after Phase 1 completes.
**Phase 6 can start as soon as Phase 4 is done.**

## Estimated Task Count

- Phase 0: 4 tasks (branch setup)
- Phase 1: 3 tasks (Y-axis foundation)
- Phase 2: 3 tasks (terrain)
- Phase 3: 3 tasks (launch/strike/slam)
- Phase 4: 1 task (grab/dunk)
- Phase 5: 2 tasks (animations)
- Phase 6: 3 tasks (polish)
- Phase 7: 2 tasks (air dash + remap)
- Phase 8: 3 tasks (integration)
- **Total: 24 tasks**
