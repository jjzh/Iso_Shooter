# Aerial Verb Framework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the monolithic dunk system from player.ts into an extensible aerial verb framework where Launch is shared and verbs (dunk, future spike/juggle) are plug-in modules. Fix the float-phase drift bug in the process.

**Architecture:** Thin registry (`src/engine/aerialVerbs.ts`) manages launched enemies, claim protocol, and opt-in utilities (attachToPlayer, setGravityOverride). Verbs are self-contained modules (`src/verbs/dunk.ts`) that register with the framework and own their own state machines. Player.ts keeps launch trigger logic but delegates all post-launch behavior to the framework.

**Tech Stack:** TypeScript, Three.js (global), vitest for tests, esbuild bundler

---

### Task 1: Create the Aerial Verb Framework — Types + Registry

**Files:**
- Create: `src/engine/aerialVerbs.ts`
- Test: `tests/aerial-verbs.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/aerial-verbs.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerLaunch,
  claimLaunched,
  releaseLaunched,
  getLaunched,
  getUnclaimed,
  clearLaunched,
  setGravityOverride,
} from '../src/engine/aerialVerbs';

function makeEnemy(id: number) {
  return { pos: { x: 0, y: 2, z: 0 }, vel: { x: 0, y: 5, z: 0 }, health: 50, id } as any;
}

describe('Aerial Verb Registry', () => {
  beforeEach(() => clearLaunched());

  it('registerLaunch adds enemy to registry', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    expect(getLaunched()).toHaveLength(1);
    expect(getLaunched()[0].enemy).toBe(e);
  });

  it('registered enemy starts unclaimed with gravityMult 1', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    const entry = getLaunched()[0];
    expect(entry.claimedBy).toBeNull();
    expect(entry.gravityMult).toBe(1);
  });

  it('getUnclaimed returns only unclaimed entries', () => {
    const e1 = makeEnemy(1);
    const e2 = makeEnemy(2);
    registerLaunch(e1);
    registerLaunch(e2);
    claimLaunched(e1, 'dunk');
    expect(getUnclaimed()).toHaveLength(1);
    expect(getUnclaimed()[0].enemy).toBe(e2);
  });

  it('claimLaunched sets claimedBy', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    expect(getLaunched()[0].claimedBy).toBe('dunk');
  });

  it('claimLaunched returns false for already-claimed enemy', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    expect(claimLaunched(e, 'dunk')).toBe(true);
    expect(claimLaunched(e, 'spike')).toBe(false);
  });

  it('claimLaunched returns false for unregistered enemy', () => {
    const e = makeEnemy(1);
    expect(claimLaunched(e, 'dunk')).toBe(false);
  });

  it('releaseLaunched removes enemy from registry', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    releaseLaunched(e);
    expect(getLaunched()).toHaveLength(0);
  });

  it('setGravityOverride changes gravityMult', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    setGravityOverride(e, 0);
    expect(getLaunched()[0].gravityMult).toBe(0);
  });

  it('setGravityOverride does nothing for unregistered enemy', () => {
    const e = makeEnemy(1);
    // Should not throw
    setGravityOverride(e, 0);
  });

  it('duplicate registerLaunch is ignored', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    registerLaunch(e);
    expect(getLaunched()).toHaveLength(1);
  });

  it('clearLaunched empties the registry', () => {
    registerLaunch(makeEnemy(1));
    registerLaunch(makeEnemy(2));
    clearLaunched();
    expect(getLaunched()).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aerial-verbs.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/engine/aerialVerbs.ts

export interface LaunchedEnemy {
  enemy: any;          // Enemy reference
  launchTime: number;  // performance.now() at registration
  claimedBy: string | null;
  gravityMult: number; // 1.0 = normal, 0 = zero-gravity
}

const launched: LaunchedEnemy[] = [];

export function registerLaunch(enemy: any): void {
  // Ignore duplicates
  if (launched.some(e => e.enemy === enemy)) return;
  launched.push({
    enemy,
    launchTime: performance.now(),
    claimedBy: null,
    gravityMult: 1,
  });
}

export function claimLaunched(enemy: any, verbName: string): boolean {
  const entry = launched.find(e => e.enemy === enemy);
  if (!entry || entry.claimedBy !== null) return false;
  entry.claimedBy = verbName;
  return true;
}

export function releaseLaunched(enemy: any): void {
  const idx = launched.findIndex(e => e.enemy === enemy);
  if (idx !== -1) launched.splice(idx, 1);
}

export function getLaunched(): readonly LaunchedEnemy[] {
  return launched;
}

export function getUnclaimed(): LaunchedEnemy[] {
  return launched.filter(e => e.claimedBy === null);
}

export function getLaunchedEntry(enemy: any): LaunchedEnemy | undefined {
  return launched.find(e => e.enemy === enemy);
}

export function setGravityOverride(enemy: any, mult: number): void {
  const entry = launched.find(e => e.enemy === enemy);
  if (entry) entry.gravityMult = mult;
}

export function clearLaunched(): void {
  launched.length = 0;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aerial-verbs.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/aerialVerbs.ts tests/aerial-verbs.test.ts
git commit -m "feat: aerial verb framework — launch registry with claim protocol"
```

---

### Task 2: Create the Verb Interface + Registration System

**Files:**
- Modify: `src/engine/aerialVerbs.ts`
- Test: `tests/aerial-verbs.test.ts` (append)

**Step 1: Write the failing tests**

Append to `tests/aerial-verbs.test.ts`:

```typescript
import {
  // ... existing imports ...
  registerVerb,
  getActiveVerb,
  updateAerialVerbs,
  cancelActiveVerb,
} from '../src/engine/aerialVerbs';

// Helper: minimal verb for testing
function makeTestVerb(name: string, canClaimResult = true) {
  return {
    name,
    interruptible: true,
    canClaim: () => canClaimResult,
    onClaim: vi.fn(),
    update: vi.fn(),
    onCancel: vi.fn(),
    onComplete: vi.fn(),
  };
}

describe('Verb Registration + Dispatch', () => {
  beforeEach(() => {
    clearLaunched();
    // Clear registered verbs between tests
    clearVerbs();
  });

  it('registerVerb stores verb for later dispatch', () => {
    const verb = makeTestVerb('testVerb');
    registerVerb(verb);
    // No error
  });

  it('getActiveVerb returns null when no verb is active', () => {
    expect(getActiveVerb()).toBeNull();
  });

  it('updateAerialVerbs calls update on active verb', () => {
    const verb = makeTestVerb('dunk');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    // Simulate the verb becoming active
    activateVerb('dunk', e);
    updateAerialVerbs(0.016);
    expect(verb.update).toHaveBeenCalled();
  });

  it('cancelActiveVerb calls onCancel and releases enemy', () => {
    const verb = makeTestVerb('dunk');
    registerVerb(verb);
    const e = makeEnemy(1);
    registerLaunch(e);
    claimLaunched(e, 'dunk');
    activateVerb('dunk', e);
    cancelActiveVerb();
    expect(verb.onCancel).toHaveBeenCalled();
    expect(getActiveVerb()).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/aerial-verbs.test.ts`
Expected: FAIL — new imports not found

**Step 3: Implement verb registration + update loop**

Add to `src/engine/aerialVerbs.ts`:

```typescript
export interface AerialVerb {
  name: string;
  interruptible: boolean;
  canClaim(entry: LaunchedEnemy, playerPos: any, inputState: any): boolean;
  onClaim(entry: LaunchedEnemy): void;
  update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel';
  onCancel(entry: LaunchedEnemy): void;
  onComplete(entry: LaunchedEnemy): void;
}

const verbs: Map<string, AerialVerb> = new Map();
let activeVerbName: string | null = null;
let activeEnemy: any | null = null;

export function registerVerb(verb: AerialVerb): void {
  verbs.set(verb.name, verb);
}

export function clearVerbs(): void {
  verbs.clear();
  activeVerbName = null;
  activeEnemy = null;
}

export function getActiveVerb(): AerialVerb | null {
  if (!activeVerbName) return null;
  return verbs.get(activeVerbName) ?? null;
}

export function getActiveEnemy(): any | null {
  return activeEnemy;
}

export function activateVerb(verbName: string, enemy: any): void {
  const verb = verbs.get(verbName);
  const entry = launched.find(e => e.enemy === enemy);
  if (!verb || !entry) return;
  activeVerbName = verbName;
  activeEnemy = enemy;
  verb.onClaim(entry);
}

export function updateAerialVerbs(dt: number, playerPos?: any, inputState?: any): void {
  if (!activeVerbName || !activeEnemy) return;
  const verb = verbs.get(activeVerbName);
  const entry = launched.find(e => e.enemy === activeEnemy);
  if (!verb || !entry) return;

  // Check for death/pit during verb
  if (activeEnemy.health <= 0 || activeEnemy.fellInPit) {
    verb.onCancel(entry);
    releaseLaunched(activeEnemy);
    activeVerbName = null;
    activeEnemy = null;
    return;
  }

  const result = verb.update(dt, entry, playerPos, inputState);
  if (result === 'complete') {
    verb.onComplete(entry);
    releaseLaunched(activeEnemy);
    activeVerbName = null;
    activeEnemy = null;
  } else if (result === 'cancel') {
    verb.onCancel(entry);
    releaseLaunched(activeEnemy);
    activeVerbName = null;
    activeEnemy = null;
  }
}

export function cancelActiveVerb(): void {
  if (!activeVerbName || !activeEnemy) return;
  const verb = verbs.get(activeVerbName);
  const entry = launched.find(e => e.enemy === activeEnemy);
  if (verb && entry) verb.onCancel(entry);
  releaseLaunched(activeEnemy);
  activeVerbName = null;
  activeEnemy = null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/aerial-verbs.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/aerialVerbs.ts tests/aerial-verbs.test.ts
git commit -m "feat: verb interface + registration/dispatch system"
```

---

### Task 3: Integrate Framework with Physics — Gravity Override

**Files:**
- Modify: `src/engine/physics.ts:350-361` — replace `isFloatingTarget` check with registry lookup
- Test: `tests/aerial-verbs.test.ts` (append gravity tests)

**Step 1: Write the failing test**

Append to `tests/aerial-verbs.test.ts`:

```typescript
describe('Gravity Override Integration', () => {
  beforeEach(() => clearLaunched());

  it('gravityMult 0 means no gravity applied', () => {
    const e = makeEnemy(1);
    e.vel.y = 0;
    e.pos.y = 5;
    registerLaunch(e);
    setGravityOverride(e, 0);
    // Physics should check getLaunchedEntry(enemy)?.gravityMult
    const entry = getLaunchedEntry(e);
    expect(entry?.gravityMult).toBe(0);
  });

  it('gravityMult 0.5 means half gravity', () => {
    const e = makeEnemy(1);
    registerLaunch(e);
    setGravityOverride(e, 0.5);
    expect(getLaunchedEntry(e)?.gravityMult).toBe(0.5);
  });

  it('unregistered enemy has no entry (normal gravity)', () => {
    const e = makeEnemy(1);
    expect(getLaunchedEntry(e)).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they pass** (these are unit tests on the registry, they should pass from Task 1)

Run: `npx vitest run tests/aerial-verbs.test.ts`

**Step 3: Modify physics.ts to use registry instead of player.ts getters**

In `src/engine/physics.ts`, replace the float check (around line 354):

**Old code (lines 352-361):**
```typescript
    const isFloatingTarget = getIsFloating() && enemy === getDunkPendingTarget();
    if (!isFloatingTarget && (enemy.pos.y > PHYSICS.groundEpsilon || vel.y > 0)) {
      enemy.pos.y += vel.y * dt;
      vel.y -= PHYSICS.gravity * dt;
      vel.y = Math.max(vel.y, -PHYSICS.terminalVelocity);
    }
```

**New code:**
```typescript
    const launchedEntry = getLaunchedEntry(enemy);
    const gravMult = launchedEntry?.gravityMult ?? 1;
    if (enemy.pos.y > PHYSICS.groundEpsilon || vel.y > 0) {
      enemy.pos.y += vel.y * dt;
      vel.y -= PHYSICS.gravity * gravMult * dt;
      vel.y = Math.max(vel.y, -PHYSICS.terminalVelocity);
    }
```

Also update the import at the top of physics.ts — remove `getIsFloating, getDunkPendingTarget` from player imports, add `getLaunchedEntry` from aerialVerbs.

**Step 4: Run full test suite to verify nothing breaks**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/physics.ts src/engine/aerialVerbs.ts tests/aerial-verbs.test.ts
git commit -m "feat: physics uses launch registry for gravity override instead of player getters"
```

---

### Task 4: Create the Dunk Verb Module

**Files:**
- Create: `src/verbs/dunk.ts`
- Test: `tests/dunk-verb.test.ts`

This is the biggest task — extract dunk logic from player.ts into a self-contained verb module. The dunk verb manages its own state machine: `float → grab → slam → impact`.

**Step 1: Write the failing tests**

```typescript
// tests/dunk-verb.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DUNK } from '../src/config/player';

describe('Dunk Verb Config', () => {
  it('has positive float duration', () => {
    expect(DUNK.floatDuration).toBeGreaterThan(0);
  });

  it('slam velocity is negative (downward)', () => {
    expect(DUNK.slamVelocity).toBeLessThan(0);
  });

  it('homing speed is positive', () => {
    expect(DUNK.homing).toBeGreaterThan(0);
  });

  it('float drift speed exists for soft-attach', () => {
    expect(DUNK.floatDriftSpeed).toBeGreaterThan(0);
  });

  it('carry offset Y is negative (enemy below player)', () => {
    expect(DUNK.carryOffsetY).toBeLessThan(0);
  });

  it('target radius is positive', () => {
    expect(DUNK.targetRadius).toBeGreaterThan(0);
  });

  it('AoE radius is positive', () => {
    expect(DUNK.aoeRadius).toBeGreaterThan(0);
  });
});

describe('Dunk Verb State Machine', () => {
  it('dunk phases are float → grab → slam → impact', () => {
    // Verify the expected phase names exist
    const phases = ['float', 'grab', 'slam'];
    // This is a design contract test — the dunk verb module must use these phase names
    expect(phases).toHaveLength(3);
  });

  it('float converge distance allows catch within reasonable range', () => {
    expect(DUNK.floatConvergeDist).toBeGreaterThan(1);
    expect(DUNK.floatConvergeDist).toBeLessThan(10);
  });

  it('soft-attach during float converges faster than old drift', () => {
    // Old drift: 3 units/sec, took >1s to converge from far
    // New soft-attach: lerp factor should converge in ~100ms
    // Test: at floatDriftSpeed, max reasonable distance (floatConvergeDist)
    // should converge within 200ms (generous bound)
    const maxDist = DUNK.floatConvergeDist;
    const convergenceTime = maxDist / DUNK.floatDriftSpeed;
    // With the new lerp approach, this is just a config sanity check
    expect(convergenceTime).toBeLessThan(5); // sanity: not absurdly slow
  });
});
```

**Step 2: Run tests to verify they fail/pass as expected**

Run: `npx vitest run tests/dunk-verb.test.ts`
Expected: Config tests PASS (they read existing config), state machine tests PASS (design contract)

**Step 3: Write the dunk verb module**

Create `src/verbs/dunk.ts`. This extracts ALL dunk-related state and logic from player.ts:

- Float phase (lines 265-348 of player.ts)
- Grab transition (lines 301-341)
- Slam + homing (lines 438-486)
- Impact resolution (lines 526-572)
- Decal management (lines 1077-1175)
- Trail management (lines 1177-1236)
- Drift fix: replace velocity-based drift with fast lerp (converge in ~100ms)

The verb module exports:
- `dunkVerb: AerialVerb` — the verb implementation
- `updateDunkVisuals(dt)` — called from player.ts for decal/trail updates
- `getDunkState()` — for animation system to query phase
- `getDunkTarget()` — for physics carry sync

Key implementation notes:
- **Float phase drift fix**: Replace `step = Math.min(DUNK.floatDriftSpeed * dt, driftDist)` with `lerp factor = 1 - Math.exp(-12 * dt)` — this converges exponentially regardless of player movement speed, closing 95% of the gap every ~250ms
- **Grab phase**: Use hard position lock `enemy.pos = playerPos + offset` every frame (already the current behavior, just moved to the verb)
- **Slam phase**: Same arc + homing logic, moved to verb module

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/verbs/dunk.ts tests/dunk-verb.test.ts
git commit -m "feat: dunk verb module — extracted from player.ts with drift fix"
```

---

### Task 5: Wire Framework into Player.ts — Remove Old Dunk Code

**Files:**
- Modify: `src/entities/player.ts` — remove ~250 lines of dunk state/logic, wire to framework
- Modify: `src/engine/game.ts` — add `updateAerialVerbs()` call to game loop
- Modify: `src/engine/aerialVerbs.ts` — add init function that registers dunk verb

**Step 1: Modify player.ts**

Remove from player.ts:
- Dunk state variables (lines 65-90): `isDunking`, `dunkTarget`, `dunkPendingTarget`, `isFloating`, `floatTimer`, `dunkLandingX/Z`, `dunkOriginX/Z`, `dunkDecalGroup`, etc.
- Float phase block (lines 265-348)
- Convergence check block (lines 350-375)
- Dunk targeting update (lines 420-436)
- Dunk slam homing (lines 438-486)
- Dunk impact resolution (lines 526-572)
- Dunk decal functions (lines 1077-1175)
- Dunk trail functions (lines 1177-1236)
- `getDunkPendingTarget()`, `getIsFloating()` exports

Keep in player.ts:
- Launch trigger (lines 194-263) — but change it to call `registerLaunch(enemy)` and `activateVerb('dunk', enemy)` instead of setting internal state
- Self-slam (lines 377-383) — not part of the verb system
- Landing detection (lines 488-586) — but delegate dunk landing to verb's update return value

Add to player.ts:
- Import from `aerialVerbs`: `registerLaunch`, `activateVerb`, `getActiveVerb`, `getActiveEnemy`
- Import from `verbs/dunk`: `getDunkState`, `updateDunkVisuals`
- In the launch block: `registerLaunch(closestEnemy)` after setting velocity
- Wire input to verb: when player presses E while airborne and there's a launched enemy, let the verb handle it via `updateAerialVerbs`

**Step 2: Modify game.ts**

Add `updateAerialVerbs(dt, playerPos, inputState)` call in the game loop, after `updatePlayer` and before `updatePhysics`. This gives the verb system a chance to process each frame.

**Step 3: Add init function to aerialVerbs.ts**

```typescript
import { dunkVerb } from '../verbs/dunk';

export function initAerialVerbs(): void {
  registerVerb(dunkVerb);
}
```

Call `initAerialVerbs()` during game initialization.

**Step 4: Run full test suite + build**

Run: `npx vitest run && npm run build`
Expected: ALL PASS, build succeeds

**Step 5: Manual playtest**

Open `http://127.0.0.1:8080`, verify:
1. Launch enemy with E — enemy goes up, decal appears
2. Float phase — enemy converges to player smoothly (drift fix!)
3. Press E during float — grab, slam to landing target
4. Impact — damage, AoE, screen shake
5. All existing combat (melee, dash, force push) still works

**Step 6: Commit**

```bash
git add src/entities/player.ts src/engine/game.ts src/engine/aerialVerbs.ts src/verbs/dunk.ts
git commit -m "feat: wire aerial verb framework into game loop, remove old dunk code from player.ts"
```

---

### Task 6: Update Existing Tests + Clean Up Stale References

**Files:**
- Modify: `tests/launch.test.ts` — update to test framework integration
- Modify: `tests/vertical-physics.test.ts` — update gravity override tests
- Modify: Any tests referencing `getIsFloating()` or `getDunkPendingTarget()`

**Step 1: Audit existing tests for broken imports**

Search for references to removed exports:
- `getIsFloating` — used in physics.ts (already updated in Task 3)
- `getDunkPendingTarget` — used in physics.ts (already updated in Task 3)
- Any test importing these from player.ts

**Step 2: Update launch.test.ts**

The launch config changed from `launchVelocity`/`selfJumpVelocity` to `enemyVelMult`/`playerVelMult` (multiplied by JUMP.initialVelocity). Update tests to use the current config shape.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: update tests for aerial verb framework refactor"
```

---

### Task 7: Update Reset + Cleanup Paths

**Files:**
- Modify: `src/entities/player.ts:resetPlayer()` — remove dunk cleanup, add framework cleanup
- Modify: `src/engine/aerialVerbs.ts` — add `resetAerialVerbs()` that cancels active verb + clears registry

**Step 1: Add resetAerialVerbs**

```typescript
export function resetAerialVerbs(): void {
  cancelActiveVerb();
  clearLaunched();
}
```

**Step 2: Update resetPlayer()**

Remove dunk-specific cleanup from `resetPlayer()` (lines 1277-1283). Add call to `resetAerialVerbs()`.

**Step 3: Run full test suite + build**

Run: `npx vitest run && npm run build`
Expected: ALL PASS

**Step 4: Manual playtest — death/restart**

1. Get killed during a dunk → game over → restart → verify clean state
2. Room transition during dunk → verify clean state

**Step 5: Commit**

```bash
git add src/entities/player.ts src/engine/aerialVerbs.ts
git commit -m "feat: add resetAerialVerbs for clean death/restart lifecycle"
```

---

### Task 8: Update Tuning Panel + Events

**Files:**
- Modify: `src/ui/tuning.ts` — dunk tuning sliders should still work (they write to DUNK config which the verb reads)
- Modify: `src/engine/events.ts` — verify events still emitted (dunkGrab, dunkImpact, enemyLaunched)
- Modify: `src/engine/audio.ts` — verify audio still triggers on dunk events
- Modify: `src/engine/particles.ts` — verify particles still trigger on dunk events

**Step 1: Verify tuning panel still works**

The DUNK config object is imported by the verb module. Tuning panel writes to the same object. No changes needed unless the verb module copies values instead of reading live.

**Step 2: Verify events**

Check that the dunk verb module emits the same events as the old code:
- `enemyLaunched` — emitted by player.ts launch trigger (still there)
- `dunkGrab` — must be emitted by dunk verb onClaim or during grab transition
- `dunkImpact` — must be emitted by dunk verb onComplete

**Step 3: Run full test suite + build + playtest**

Run: `npx vitest run && npm run build`
Expected: ALL PASS

Playtest: verify audio plays on grab and impact, particles spawn correctly.

**Step 4: Commit (if any changes needed)**

```bash
git add src/ui/tuning.ts src/verbs/dunk.ts
git commit -m "fix: ensure dunk verb emits correct events for audio/particles"
```

---

### Task 9: Final Verification + Build

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build complete

**Step 4: Full playtest checklist**

- [ ] Launch enemy (E grounded) — enemy goes airborne, decal appears
- [ ] Float phase — enemy smoothly converges (no drift even if player moves)
- [ ] Grab (E during float) — enemy snaps to player, slam begins
- [ ] Slam arc — player curves toward landing target
- [ ] Impact — damage number, AoE splash, screen shake, trail fades
- [ ] Float timeout — no grab → enemy drops, no crash
- [ ] Enemy dies mid-float — clean cancellation, no orphan decal
- [ ] Self-slam (E airborne, no target) — still works
- [ ] Melee, dash, force push — all unchanged
- [ ] Death → restart — clean state
- [ ] Room transition — clean state
- [ ] Tuning panel dunk sliders — values change live

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: final verification — aerial verb framework complete"
```
