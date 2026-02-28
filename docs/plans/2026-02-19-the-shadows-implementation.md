# Room 5: "The Shadows" Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Room 5 ("The Shadows") to the portfolio demo — a patrol maze with vision cones, detection-based aggro, and bullet time, integrating assassin mechanics from `explore/assassin`.

**Architecture:** Profile-gated superset, same as Phase 2. All assassin mechanics gated behind `getActiveProfile() === 'assassin'`. Non-assassin rooms are untouched. Bullet time is already integrated (Phase 2) and auto-triggers on `enemyAggroed` — we just need to emit that event.

**Tech Stack:** Three.js (global), TypeScript, esbuild, Vitest

**Key Discovery:** `bulletTime.ts` already exists in `game.ts` with full HUD integration (meter, vignette, ceremony text). It already subscribes to `enemyAggroed` but that event was never emitted on demo/portfolio. Once we emit it from enemy.ts, bullet time auto-activates on detection. Zero bullet time work needed.

---

### Task 1: Copy visionCone.ts from explore/assassin

**Files:**
- Create: `src/engine/visionCone.ts`

**Step 1: Copy the file**

```bash
git show explore/assassin:src/engine/visionCone.ts > src/engine/visionCone.ts
```

This file is self-contained — uses THREE globals, exports `initVisionCones`, `addVisionCone`, `updateVisionCones`, `updateIdleFacing`, `removeVisionCone`, `clearVisionCones`, `isInsideVisionCone`, and `VISION_CONE_CONFIG`. The raycast function is injected at init time to avoid import chains.

**Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build (visionCone.ts is not imported yet, so no effect).

**Step 3: Commit**

```bash
git add src/engine/visionCone.ts
git commit -m "feat: copy visionCone.ts from explore/assassin"
```

---

### Task 2: Extend types, events, and enemy config

**Files:**
- Modify: `src/engine/events.ts` (add `enemyAggroed` event)
- Modify: `src/types/index.ts` (add `patrol` to EnemyConfig)
- Modify: `src/config/enemies.ts` (add `patrol` + `aggroRadius` to goblin)

**Step 1: Add `enemyAggroed` event to events.ts**

In `src/engine/events.ts`, add to the `GameEvent` union (after the `enemyImpact` line):

```typescript
| { type: 'enemyAggroed'; enemy: any; position: { x: number; z: number } }
```

This event already has a subscriber in `bulletTime.ts` — it was never emitted before. Now it will be.

**Step 2: Add `patrol` to EnemyConfig in types/index.ts**

In `src/types/index.ts`, in the `EnemyConfig` interface, after the `pitLeap` property, add:

```typescript
  patrol?: {
    distance: number;
    speed: number;
    pauseMin: number;
    pauseMax: number;
  };
```

Note: `aggroRadius` already exists on `EnemyConfig` as `aggroRadius?: number`.

**Step 3: Add patrol + aggroRadius to goblin config in enemies.ts**

In `src/config/enemies.ts`, in the `goblin` entry, after the `pitLeap` block, add:

```typescript
    aggroRadius: 8,
    patrol: {
      distance: 6,
      speed: 1.2,
      pauseMin: 500,
      pauseMax: 1500,
    },
```

**Step 4: Build to verify**

```bash
npm run build
```

Expected: clean build.

**Step 5: Write test for new config**

In `tests/rooms.test.ts` (or new file `tests/vision-cone.test.ts`), add:

```typescript
import { describe, it, expect } from 'vitest';
import { ENEMY_TYPES } from '../src/config/enemies';

describe('assassin config', () => {
  it('goblin has aggroRadius', () => {
    expect(ENEMY_TYPES.goblin.aggroRadius).toBe(8);
  });

  it('goblin has patrol config', () => {
    const patrol = ENEMY_TYPES.goblin.patrol!;
    expect(patrol.distance).toBe(6);
    expect(patrol.speed).toBeGreaterThan(0);
    expect(patrol.pauseMin).toBeLessThan(patrol.pauseMax);
  });
});
```

**Step 6: Run tests**

```bash
npx vitest run tests/vision-cone.test.ts
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/engine/events.ts src/types/index.ts src/config/enemies.ts tests/vision-cone.test.ts
git commit -m "feat: extend types/events/config for assassin profile"
```

---

### Task 3: Write vision cone pure function tests

**Files:**
- Create: `tests/vision-cone.test.ts` (extend from Task 2)

**Step 1: Add isInsideVisionCone tests**

```typescript
import { isInsideVisionCone, VISION_CONE_CONFIG } from '../src/engine/visionCone';

describe('isInsideVisionCone', () => {
  const radius = 8;

  it('returns true for target directly in front (enemy faces -Z at rotY=0)', () => {
    // Enemy at origin, facing -Z (rotY=0), target at (0, 0, -5)
    expect(isInsideVisionCone(0, 0, 0, 0, -5, radius)).toBe(true);
  });

  it('returns false for target behind enemy', () => {
    // Enemy at origin, facing -Z, target at (0, 0, 5) — behind
    expect(isInsideVisionCone(0, 0, 0, 0, 5, radius)).toBe(false);
  });

  it('returns false for target outside radius', () => {
    // Enemy at origin, facing -Z, target at (0, 0, -20) — too far
    expect(isInsideVisionCone(0, 0, 0, 0, -20, radius)).toBe(false);
  });

  it('returns false for target outside cone angle', () => {
    // Enemy at origin, facing -Z, target at (8, 0, 0) — perpendicular (90°)
    // Cone is ~48° half-angle, so 90° is outside
    expect(isInsideVisionCone(0, 0, 0, 8, 0, radius)).toBe(false);
  });

  it('returns true for target at edge of cone angle', () => {
    // Half-angle is ~48° (VISION_CONE_CONFIG.angle / 2)
    // Target at 30° from forward should be inside
    const angle = 0.5; // 0.5 rad ≈ 28.6°, well within 48°
    const tx = Math.sin(angle) * 5; // ~2.4
    const tz = -Math.cos(angle) * 5; // ~-4.4
    expect(isInsideVisionCone(0, 0, 0, tx, tz, radius)).toBe(true);
  });

  it('respects enemy rotation', () => {
    // Enemy facing +X (rotY = -PI/2), target at (5, 0, 0) — in front
    expect(isInsideVisionCone(0, 0, -Math.PI / 2, 5, 0, radius)).toBe(true);
    // Same rotation, target at (-5, 0, 0) — behind
    expect(isInsideVisionCone(0, 0, -Math.PI / 2, -5, 0, radius)).toBe(false);
  });
});
```

**Step 2: Run tests**

```bash
npx vitest run tests/vision-cone.test.ts
```

Expected: PASS (isInsideVisionCone is a pure function, no THREE dependency).

**Step 3: Commit**

```bash
git add tests/vision-cone.test.ts
git commit -m "test: add vision cone geometry tests"
```

---

### Task 4: Add assassin enemy behavior to enemy.ts

This is the largest task — adds patrol, detection, aggro indicator, and vision cone lifecycle to enemy.ts, all profile-gated.

**Files:**
- Modify: `src/entities/enemy.ts`

**Step 1: Add imports at top of enemy.ts**

After the existing imports (line 12), add:

```typescript
import { getActiveProfile } from '../engine/profileManager';
import {
  initVisionCones, addVisionCone, updateVisionCones,
  updateIdleFacing, removeVisionCone, clearVisionCones,
  isInsideVisionCone, VISION_CONE_CONFIG
} from '../engine/visionCone';
import { ARENA_HALF_X, ARENA_HALF_Z } from '../config/arena';
```

**Step 2: Add aggro indicator system**

After the imports section, add the aggro indicator:

```typescript
// ─── Aggro Indicator ("!" pop above enemy on detection) ───

const AGGRO_IND = {
  heightAbove: 2.2,
  popDuration: 120,    // ms — scale 0→1.4 overshoot
  holdDuration: 600,   // ms — hold at 1.0 with bob
  fadeDuration: 400,   // ms — shrink + fade
  bobSpeed: 6,         // rad/s
  bobAmp: 0.08,
};

interface AggroIndicator {
  mesh: any;
  phase: 'pop' | 'hold' | 'fade';
  timer: number;
  enemy: any;
}

const aggroIndicators: AggroIndicator[] = [];

function showAggroIndicator(enemy: any) {
  if (!sceneRef) return;

  const group = new THREE.Group();

  // Cone (body of "!")
  const coneGeo = new THREE.ConeGeometry(0.12, 0.5, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 0.8,
    transparent: true, opacity: 1,
  });
  const cone = new THREE.Mesh(coneGeo, mat);
  cone.position.y = 0.15;
  group.add(cone);

  // Dot (bottom of "!")
  const dotGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const dot = new THREE.Mesh(dotGeo, mat.clone());
  dot.position.y = -0.2;
  group.add(dot);

  group.position.set(enemy.pos.x, enemy.config.size.height + AGGRO_IND.heightAbove, enemy.pos.z);
  group.scale.set(0, 0, 0);
  sceneRef.add(group);

  aggroIndicators.push({ mesh: group, phase: 'pop', timer: AGGRO_IND.popDuration, enemy });
}

function updateAggroIndicators(dt: number) {
  for (let i = aggroIndicators.length - 1; i >= 0; i--) {
    const ind = aggroIndicators[i];
    ind.timer -= dt * 1000;

    // Track enemy position
    ind.mesh.position.x = ind.enemy.pos.x;
    ind.mesh.position.z = ind.enemy.pos.z;

    if (ind.phase === 'pop') {
      const t = 1 - ind.timer / AGGRO_IND.popDuration;
      const s = t < 0.7 ? (t / 0.7) * 1.4 : 1.4 - (t - 0.7) / 0.3 * 0.4;
      ind.mesh.scale.set(s, s, s);
      if (ind.timer <= 0) { ind.phase = 'hold'; ind.timer = AGGRO_IND.holdDuration; ind.mesh.scale.set(1, 1, 1); }
    } else if (ind.phase === 'hold') {
      const bob = Math.sin(Date.now() * 0.001 * AGGRO_IND.bobSpeed) * AGGRO_IND.bobAmp;
      ind.mesh.position.y = ind.enemy.config.size.height + AGGRO_IND.heightAbove + bob;
      if (ind.timer <= 0) { ind.phase = 'fade'; ind.timer = AGGRO_IND.fadeDuration; }
    } else {
      const fadeT = Math.max(0, ind.timer / AGGRO_IND.fadeDuration);
      ind.mesh.scale.set(fadeT, fadeT, fadeT);
      ind.mesh.children.forEach((c: any) => { if (c.material) c.material.opacity = fadeT; });
      if (ind.timer <= 0) {
        sceneRef.remove(ind.mesh);
        aggroIndicators.splice(i, 1);
      }
    }
  }
}

function clearAggroIndicators() {
  for (const ind of aggroIndicators) {
    if (sceneRef) sceneRef.remove(ind.mesh);
  }
  aggroIndicators.length = 0;
}
```

**Step 3: Export raycastTerrainDist**

The existing `raycastTerrainDist` function (around line 233) is currently a local function. Change:

```typescript
function raycastTerrainDist(...) {
```

to:

```typescript
export function raycastTerrainDist(...) {
```

**Step 4: Add facing helpers**

Before `updateEnemies()` (around line 279), add:

```typescript
// ─── Facing Helpers (assassin profile — smooth turning) ───

function getForward(rotY: number): { x: number; z: number } {
  return { x: -Math.sin(rotY), z: -Math.cos(rotY) };
}

function rotationToFace(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

function turnToward(enemy: any, targetRotY: number, dt: number): void {
  let diff = targetRotY - enemy.mesh.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const maxStep = VISION_CONE_CONFIG.turnSpeed * dt;
  if (Math.abs(diff) <= maxStep) {
    enemy.mesh.rotation.y = targetRotY;
  } else {
    enemy.mesh.rotation.y += Math.sign(diff) * maxStep;
  }
}
```

**Step 5: Add patrol behavior function**

After the facing helpers, add:

```typescript
// ─── Patrol Behavior (assassin profile — non-aggroed enemies walk lanes) ───

function updatePatrol(enemy: any, dt: number) {
  const cfg = enemy.config.patrol;
  if (!cfg) return;

  // Pause at endpoints
  if (enemy.patrolPauseTimer > 0) {
    enemy.patrolPauseTimer -= dt * 1000;
    // Smooth turn during pause
    if (enemy.patrolTargetAngle != null) {
      turnToward(enemy, enemy.patrolTargetAngle, dt);
    }
    return;
  }

  // Move forward in facing direction
  const fwd = getForward(enemy.mesh.rotation.y);
  const speed = cfg.speed * (enemy.slowMult || 1);
  const moveX = fwd.x * speed * dt;
  const moveZ = fwd.z * speed * dt;

  // Check terrain collision (wall ahead?)
  const hitDist = raycastTerrainDist(enemy.pos.x, enemy.pos.z, fwd.x, fwd.z, 1.5);
  const hitWall = hitDist < 1.0;

  // Check distance from origin
  const dFromOriginX = enemy.pos.x - enemy.patrolOriginX;
  const dFromOriginZ = enemy.pos.z - enemy.patrolOriginZ;
  const distFromOrigin = Math.sqrt(dFromOriginX * dFromOriginX + dFromOriginZ * dFromOriginZ);
  const reachedEnd = distFromOrigin >= cfg.distance;

  if (hitWall || reachedEnd) {
    // Reverse direction: turn 180°
    enemy.patrolDir *= -1;
    enemy.patrolTargetAngle = enemy.mesh.rotation.y + Math.PI;
    // Normalize
    while (enemy.patrolTargetAngle > Math.PI) enemy.patrolTargetAngle -= Math.PI * 2;
    while (enemy.patrolTargetAngle < -Math.PI) enemy.patrolTargetAngle += Math.PI * 2;

    enemy.patrolPauseTimer = cfg.pauseMin + Math.random() * (cfg.pauseMax - cfg.pauseMin);
    return;
  }

  // Apply movement
  enemy.pos.x += moveX;
  enemy.pos.z += moveZ;

  // Arena clamp
  enemy.pos.x = Math.max(-ARENA_HALF_X + 1, Math.min(ARENA_HALF_X - 1, enemy.pos.x));
  enemy.pos.z = Math.max(-ARENA_HALF_Z + 1, Math.min(ARENA_HALF_Z - 1, enemy.pos.z));
}
```

**Step 6: Extend spawnEnemy with assassin state**

In the `spawnEnemy` function, in the enemy object literal (after the `hitReaction` line, around line 117), add:

```typescript
    // Assassin profile state
    aggroed: !cfg.aggroRadius,  // always-active if no aggroRadius (non-assassin rooms)
    detectionTimer: 0,
    // Patrol state
    patrolOriginX: position.x,
    patrolOriginZ: position.z,
    patrolDir: 1,
    patrolPauseTimer: 0,
    patrolTargetAngle: null as number | null,
```

Then, after the shield initialization block (after `gameState.enemies.push(enemy)`), add:

```typescript
  // Assassin profile: initialize facing + vision cone
  if (getActiveProfile() === 'assassin' && cfg.aggroRadius) {
    enemy.mesh.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
    enemy.idleBaseRotY = enemy.mesh.rotation.y;
    enemy.idleScanPhase = Math.random() * Math.PI * 2;
    enemy._facingInitialized = true;
    addVisionCone(enemy);
  }
```

**Step 7: Add detection + aggro gating in updateEnemies**

At the start of the `updateEnemies` function (line 279), before the main for loop, add:

```typescript
  const isAssassin = getActiveProfile() === 'assassin';

  // Assassin: update idle facing for non-aggroed scanner enemies
  if (isAssassin) {
    updateIdleFacing(gameState.enemies, dt);
  }
```

Then, inside the main for loop, at the TOP of the loop body (after the `isCarrierPayload` check), add:

```typescript
    // ─── Assassin Profile: Detection + Patrol ───
    if (isAssassin && !enemy.aggroed && enemy.config.aggroRadius) {
      // Patrol behavior (walk lanes when idle)
      if (enemy.config.patrol && !enemy.isLeaping) {
        updatePatrol(enemy, dt);
      }

      // Detection check: vision cone + LOS + timer
      if (playerPos) {
        const inCone = isInsideVisionCone(
          enemy.pos.x, enemy.pos.z,
          enemy.mesh.rotation.y,
          playerPos.x, playerPos.z,
          enemy.config.aggroRadius
        );

        // LOS check — raycast from enemy to player, check if terrain blocks it
        let inLOS = true;
        if (inCone) {
          const dx = playerPos.x - enemy.pos.x;
          const dz = playerPos.z - enemy.pos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 0.1) {
            const hitDist = raycastTerrainDist(enemy.pos.x, enemy.pos.z, dx / dist, dz / dist, dist);
            inLOS = hitDist >= dist - 0.5;
          }
        }

        if (inCone && inLOS) {
          enemy.detectionTimer += dt * 1000;
          if (enemy.detectionTimer >= VISION_CONE_CONFIG.detectionThreshold) {
            // AGGRO!
            enemy.aggroed = true;
            emit({ type: 'enemyAggroed', enemy, position: { x: enemy.pos.x, z: enemy.pos.z } });
            showAggroIndicator(enemy);
            // Face the player immediately on aggro
            const toDx = playerPos.x - enemy.pos.x;
            const toDz = playerPos.z - enemy.pos.z;
            enemy.mesh.rotation.y = rotationToFace(toDx, toDz);
          }
        } else {
          enemy.detectionTimer = Math.max(0, enemy.detectionTimer - dt * 1500); // decay faster than build
        }
      }

      // Skip normal behavior — not aggroed yet
      // Still need mesh sync + flash/slow/shield updates below
      // Sync mesh position
      enemy.pos.x = Math.max(-ARENA_HALF_X, Math.min(ARENA_HALF_X, enemy.pos.x));
      enemy.pos.z = Math.max(-ARENA_HALF_Z, Math.min(ARENA_HALF_Z, enemy.pos.z));
      enemy.mesh.position.copy(enemy.pos);
      continue;
    }
```

**Note:** The `continue` skips normal behavior dispatch + the rest of the loop body for non-aggroed assassin enemies. The mesh position sync, flash timer, hit reaction, etc. happen normally for aggroed enemies.

**Step 8: Wire vision cone update + aggro indicator update**

At the END of `updateEnemies`, after the main for loop, add:

```typescript
  // Assassin: update vision cone overlays + aggro indicators
  if (isAssassin) {
    updateVisionCones(gameState.enemies, dt);
    updateAggroIndicators(dt);
  }
```

**Step 9: Wire vision cone cleanup in clearEnemies**

Find the `clearEnemies` function. Before the existing cleanup, add:

```typescript
  clearVisionCones();
  clearAggroIndicators();
```

Also, in the death/removal section of updateEnemies (wherever enemies are removed from the array), add `removeVisionCone(enemy)` before removing the enemy. Look for the existing death handling code and add:

```typescript
removeVisionCone(enemy);
```

**Step 10: Build to verify**

```bash
npm run build
```

Expected: clean build.

**Step 11: Commit**

```bash
git add src/entities/enemy.ts
git commit -m "feat: add assassin patrol, detection, aggro indicator, vision cone lifecycle"
```

---

### Task 5: Wire visionCone init in game.ts + cleanup in roomManager.ts

**Files:**
- Modify: `src/engine/game.ts`
- Modify: `src/rooms/roomManager.ts`

**Step 1: Import + init visionCones in game.ts**

In `src/engine/game.ts`, add import:

```typescript
import { initVisionCones } from './visionCone';
import { raycastTerrainDist } from '../entities/enemy';
```

In the `init()` function, after `initBulletTime()` (line 203), add:

```typescript
    initVisionCones(scene, raycastTerrainDist);
```

**Step 2: Add cleanup to roomManager.ts**

In `src/rooms/roomManager.ts`, add import:

```typescript
import { clearVisionCones } from '../engine/visionCone';
```

In the `loadRoom` function, in the cleanup section (after `cleanupGroundShadows()`), add:

```typescript
  clearVisionCones();
```

**Step 3: Build to verify**

```bash
npm run build
```

Expected: clean build.

**Step 4: Commit**

```bash
git add src/engine/game.ts src/rooms/roomManager.ts
git commit -m "feat: wire visionCone init and cleanup"
```

---

### Task 6: Add Room 5 "The Shadows" definition

**Files:**
- Modify: `src/config/rooms.ts`

**Step 1: Add Room 5 to ROOMS array**

After the Room 4 ("The Arena") definition, add:

```typescript
  // ══════════════════════════════════════════════════════════════════════
  // Room 5: "The Shadows" — patrol maze, vision cones, detection puzzle
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Shadows',
    profile: 'assassin' as PlayerProfile,
    sandboxMode: true,
    commentary: "What if the design question shifts from damage to detection?",
    arenaHalfX: 14,
    arenaHalfZ: 14,
    obstacles: [
      // Maze walls — creating 3 lanes (left, center, right)
      // Horizontal walls
      { x: -5, z: 5, w: 8, h: 2, d: 1 },    // upper-left wall
      { x: 5, z: -1, w: 8, h: 2, d: 1 },     // center-right wall
      { x: -5, z: -7, w: 8, h: 2, d: 1 },    // lower-left wall
      // Cover pillars at intersections
      { x: 0, z: 8, w: 1.5, h: 2, d: 1.5 },  // top gap pillar
      { x: -1, z: -4, w: 1.5, h: 2, d: 1.5 }, // center gap pillar
    ],
    pits: [
      // Opportunistic push spots at corridor intersections
      { x: 8, z: 5, w: 3, d: 3 },    // right side, near upper wall end
      { x: -8, z: -1, w: 3, d: 3 },   // left side, center height
      { x: 4, z: -10, w: 3, d: 2.5 }, // lower-right dead end
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        // Patrolling goblins in lanes
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'sides'),
        // Stationary scanner at key position
        pack(goblins(1), 'far'),
      ],
    },
    playerStart: { x: -10, z: 10 },  // Bottom-left corner of maze
    enableWallSlamDamage: false,       // Focus on detection, not physics damage
    enableEnemyCollisionDamage: false,
    highlights: [{ target: 'pits' }],
  },
```

**Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build.

**Step 3: Commit**

```bash
git add src/config/rooms.ts
git commit -m "feat: add Room 5 'The Shadows' definition"
```

---

### Task 7: Update tests

**Files:**
- Modify: `tests/rooms.test.ts`
- Modify: `tests/vision-cone.test.ts` (extend)

**Step 1: Update rooms.test.ts for 5 rooms**

Find the test that checks ROOMS.length and update it from 4 to 5. Add a test for Room 5:

```typescript
describe('Room 5: The Shadows', () => {
  const room = ROOMS[4];

  it('has correct name and profile', () => {
    expect(room.name).toBe('The Shadows');
    expect(room.profile).toBe('assassin');
  });

  it('is sandbox mode', () => {
    expect(room.sandboxMode).toBe(true);
  });

  it('has maze obstacles and pits', () => {
    expect(room.obstacles.length).toBeGreaterThanOrEqual(3);
    expect(room.pits.length).toBeGreaterThanOrEqual(2);
  });

  it('disables wall slam and collision damage', () => {
    expect(room.enableWallSlamDamage).toBe(false);
    expect(room.enableEnemyCollisionDamage).toBe(false);
  });

  it('has highlights for pits', () => {
    expect(room.highlights).toBeDefined();
    expect(room.highlights!.some(h => h.target === 'pits')).toBe(true);
  });

  it('player starts in corner of maze', () => {
    expect(room.playerStart.x).toBeLessThan(0);
    expect(room.playerStart.z).toBeGreaterThan(0);
  });
});
```

**Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (previous 793 + new tests).

**Step 3: Commit**

```bash
git add tests/rooms.test.ts tests/vision-cone.test.ts
git commit -m "test: add Room 5 and vision cone tests"
```

---

### Task 8: Build, typecheck, and verify all tests

**Files:** none (verification only)

**Step 1: Full build**

```bash
npm run build
```

Expected: clean build, no errors.

**Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors (or only pre-existing warnings).

**Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all pass.

**Step 4: Manual smoke test**

```bash
npx http-server . -p 8080
```

Open browser → start screen → Room 5 selector → verify:
- Vision cones visible on ground (green wedges)
- Goblins patrol lanes
- Walking into cone → color ramps to red → aggro → bullet time auto-triggers
- Force push enemies into pits
- Room transition works (door is open in sandbox mode)

**Step 5: Commit if any fixes were needed, then final commit**

```bash
git add -A
git commit -m "feat: Room 5 'The Shadows' — assassin detection puzzle complete"
```

---

## File Dependency Graph

```
visionCone.ts (new, standalone)
    ↑ imported by
game.ts (init) + enemy.ts (lifecycle) + roomManager.ts (cleanup)

enemy.ts (modified)
    ← imports: visionCone, profileManager, arena config
    → emits: enemyAggroed event

bulletTime.ts (ALREADY WIRED — no changes needed)
    ← subscribes to: enemyAggroed event (auto-activates)

hud.ts (ALREADY WIRED — no changes needed)
    ← reads: bulletTime resource/state (meter + vignette)

events.ts (add enemyAggroed type)
types/index.ts (add patrol to EnemyConfig)
enemies.ts (add patrol + aggroRadius to goblin)
rooms.ts (add Room 5)
```

## Risk Checklist

- [ ] Existing rooms 1-4 unaffected (all new code gated by `getActiveProfile() === 'assassin'`)
- [ ] Enemy spawn doesn't break (aggroed defaults to `true` when no aggroRadius)
- [ ] Vision cone cleanup on room switch (clearVisionCones in roomManager)
- [ ] Bullet time auto-trigger verified (enemyAggroed → activateBulletTime)
- [ ] Arena bounds correct for 14×14 room
- [ ] Patrol doesn't walk enemies into pits (raycast checks walls, pit-aware direction already in enemy.ts)
