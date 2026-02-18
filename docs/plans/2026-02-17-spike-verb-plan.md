# Spike Verb + Multi-Verb Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a spike aerial verb and restructure launch flow so players choose between dunk (hold LMB) and spike (tap LMB) during the float window.

**Architecture:** Float selector verb owns the shared rising+float phases and resolves to spike or dunk based on LMB tap/hold. Spike creates an EntityCarrier that turns the enemy into a physics projectile with through-damage and ground-impact AoE. Dunk loses its rising/float phases (selector owns those now).

**Tech Stack:** TypeScript, Three.js (CDN global), vitest, esbuild

---

### Task 1: Add FLOAT_SELECTOR and SPIKE configs

**Files:**
- Modify: `src/config/player.ts`
- Test: `tests/spike-verb.test.ts` (created in Task 5)

**Step 1: Add configs to player.ts**

Add after `LAUNCH` config at the bottom of `src/config/player.ts`:

```typescript
// Float selector config — shared aerial verb selection window
export const FLOAT_SELECTOR = {
  holdThreshold: 180,        // ms to differentiate tap (spike) vs hold (dunk)
  chargeVisualDelay: 50,     // ms before charge ring starts filling
};

// Spike verb config — volleyball spike, enemy becomes projectile
export const SPIKE = {
  damage: 15,                // hit damage to spiked enemy on strike
  projectileSpeed: 25,       // enemy flight speed (units/sec)
  projectileAngle: 35,       // degrees below horizontal toward aim point
  throughDamage: 20,         // damage to enemies hit along flight path
  throughKnockback: 8,       // knockback to path-hit enemies
  impactDamage: 15,          // AoE damage on ground impact
  impactRadius: 2.0,         // AoE radius on ground impact
  impactKnockback: 10,       // knockback on ground impact
  windupDuration: 80,        // ms windup before strike
  hangDuration: 150,         // ms hang after strike (follow-through)
  fastFallGravityMult: 2.5,  // enhanced gravity during post-spike fall
  screenShake: 3.0,          // shake on spike strike
  impactShake: 2.5,          // shake on enemy ground impact
};
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 3: Commit**

```bash
git add src/config/player.ts
git commit -m "feat: add FLOAT_SELECTOR and SPIKE configs"
```

---

### Task 2: Add attackHeld to input system

The float selector needs to know when LMB is held vs released. Currently `inputState.attack` is edge-triggered (one frame on press). We need a continuous `attackHeld` flag.

**Files:**
- Modify: `src/engine/input.ts`

**Step 1: Add attackHeld to inputState**

In `src/engine/input.ts`, add `attackHeld: false` to the inputState object (after `attack: false` at line 12):

```typescript
attack: false,
attackHeld: false,       // continuous: true while LMB is down
```

**Step 2: Set attackHeld true on mousedown**

In the `mousedown` handler (line 81), add after `inputState.attack = true;`:

```typescript
inputState.attackHeld = true;
```

**Step 3: Set attackHeld false on mouseup**

In the `mouseup` handler (line 89), add after `mouseIsDown = false;`:

```typescript
inputState.attackHeld = false;
```

**Step 4: Do NOT consume attackHeld in consumeInput()**

`attackHeld` is continuous (not edge-triggered), so it must NOT be reset in `consumeInput()`. Verify it is not listed there.

**Step 5: Verify build**

Run: `npm run build`
Expected: Clean build

**Step 6: Commit**

```bash
git add src/engine/input.ts
git commit -m "feat: add attackHeld continuous flag to input system"
```

---

### Task 3: Add transferClaim to aerial verb framework

**Files:**
- Modify: `src/engine/aerialVerbs.ts`
- Test: `tests/aerial-verbs.test.ts`

**Step 1: Write the failing test**

Add to the end of the "Verb Registration + Dispatch" describe block in `tests/aerial-verbs.test.ts`:

```typescript
import {
  // ... existing imports ...
  transferClaim,
} from '../src/engine/aerialVerbs';

// ... inside 'Verb Registration + Dispatch' describe block:

it('transferClaim changes active verb and calls new verb onClaim', () => {
  const verb1 = makeTestVerb('selector');
  const verb2 = makeTestVerb('dunk');
  registerVerb(verb1);
  registerVerb(verb2);
  const e = makeEnemy(1);
  registerLaunch(e);
  claimLaunched(e, 'selector');
  activateVerb('selector', e);
  expect(getActiveVerb()).toBe(verb1);

  transferClaim(e, 'dunk');
  expect(getActiveVerb()).toBe(verb2);
  expect(getActiveEnemy()).toBe(e);
  expect(verb2.onClaim).toHaveBeenCalled();
  expect(getLaunchedEntry(e)?.claimedBy).toBe('dunk');
});

it('transferClaim does nothing for unregistered verb', () => {
  const verb1 = makeTestVerb('selector');
  registerVerb(verb1);
  const e = makeEnemy(1);
  registerLaunch(e);
  claimLaunched(e, 'selector');
  activateVerb('selector', e);
  transferClaim(e, 'nonexistent');
  expect(getActiveVerb()).toBe(verb1); // unchanged
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aerial-verbs.test.ts`
Expected: FAIL — `transferClaim` is not exported

**Step 3: Implement transferClaim**

In `src/engine/aerialVerbs.ts`, add after the `activateVerb` function:

```typescript
export function transferClaim(enemy: any, toVerbName: string): void {
  const verb = verbs.get(toVerbName);
  if (!verb) return;
  const entry = launched.find(e => e.enemy === enemy);
  if (!entry) return;
  entry.claimedBy = toVerbName;
  activeVerb = verb;
  activeEnemy = enemy;
  verb.onClaim(entry);
}
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/aerial-verbs.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/engine/aerialVerbs.ts tests/aerial-verbs.test.ts
git commit -m "feat: add transferClaim to aerial verb framework"
```

---

### Task 4: Build Entity Carrier system

The carrier is a general-purpose physics projectile that carries an entity payload. Spike creates one; the carrier handles flight, through-hits, and ground impact independently.

**Files:**
- Create: `src/engine/entityCarrier.ts`
- Create: `tests/entity-carrier.test.ts`

**Step 1: Write the failing tests**

Create `tests/entity-carrier.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock THREE-dependent modules
vi.mock('../src/engine/renderer', () => ({
  screenShake: vi.fn(),
  getScene: vi.fn(() => ({
    add: vi.fn(),
    remove: vi.fn(),
  })),
}));

vi.mock('../src/ui/damageNumbers', () => ({
  spawnDamageNumber: vi.fn(),
}));

vi.mock('../src/engine/events', () => ({
  emit: vi.fn(),
}));

import {
  createCarrier,
  updateCarriers,
  getActiveCarriers,
  clearCarriers,
} from '../src/engine/entityCarrier';

function makeEnemy(id: number) {
  return {
    pos: { x: 0, y: 5, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    health: 50,
    mesh: { position: { set: vi.fn(), copy: vi.fn() } },
    id,
    fellInPit: false,
  } as any;
}

function makeGameState(enemies: any[] = []) {
  return { enemies } as any;
}

describe('Entity Carrier System', () => {
  beforeEach(() => clearCarriers());

  it('createCarrier adds a carrier to the active list', () => {
    const enemy = makeEnemy(1);
    createCarrier(enemy, { x: 5, y: -3, z: 5 }, {
      speed: 25,
      gravityMult: 1,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    expect(getActiveCarriers()).toHaveLength(1);
  });

  it('carrier moves payload along velocity vector', () => {
    const enemy = makeEnemy(1);
    enemy.pos.y = 10;
    createCarrier(enemy, { x: 10, y: -5, z: 0 }, {
      speed: 25,
      gravityMult: 0,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    const prevX = enemy.pos.x;
    updateCarriers(0.016, makeGameState());
    expect(enemy.pos.x).toBeGreaterThan(prevX);
  });

  it('carrier applies gravity to velocity', () => {
    const enemy = makeEnemy(1);
    enemy.pos.y = 10;
    createCarrier(enemy, { x: 10, y: 0, z: 0 }, {
      speed: 25,
      gravityMult: 1,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    updateCarriers(0.016, makeGameState());
    // After gravity, Y velocity should be more negative
    // (carrier internal — check via position dropping faster than initial velocity)
    updateCarriers(0.016, makeGameState());
    // Enemy should be moving downward
    expect(enemy.pos.y).toBeLessThan(10);
  });

  it('carrier is removed on ground impact (pos.y <= 0)', () => {
    const enemy = makeEnemy(1);
    enemy.pos.y = 0.1; // very close to ground
    createCarrier(enemy, { x: 0, y: -10, z: 0 }, {
      speed: 25,
      gravityMult: 1,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    updateCarriers(0.1, makeGameState()); // big dt to ensure ground hit
    expect(getActiveCarriers()).toHaveLength(0);
  });

  it('carrier deals through-damage to enemies in path', () => {
    const payload = makeEnemy(1);
    payload.pos = { x: 0, y: 3, z: 0 };
    const bystander = makeEnemy(2);
    bystander.pos = { x: 0.5, y: 3, z: 0 }; // very close to flight path
    createCarrier(payload, { x: 1, y: 0, z: 0 }, {
      speed: 25,
      gravityMult: 0,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    updateCarriers(0.016, makeGameState([payload, bystander]));
    expect(bystander.health).toBeLessThan(50);
  });

  it('carrier does not damage the payload enemy during flight', () => {
    const payload = makeEnemy(1);
    payload.pos = { x: 0, y: 5, z: 0 };
    createCarrier(payload, { x: 10, y: 0, z: 0 }, {
      speed: 25,
      gravityMult: 0,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    updateCarriers(0.016, makeGameState([payload]));
    expect(payload.health).toBe(50); // unchanged
  });

  it('carrier deals AoE impact damage on ground hit', () => {
    const payload = makeEnemy(1);
    payload.pos = { x: 5, y: 0.05, z: 5 };
    const bystander = makeEnemy(2);
    bystander.pos = { x: 5.5, y: 0, z: 5 }; // within impactRadius
    createCarrier(payload, { x: 0, y: -10, z: 0 }, {
      speed: 25,
      gravityMult: 0,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    updateCarriers(0.1, makeGameState([payload, bystander]));
    expect(bystander.health).toBeLessThan(50);
  });

  it('clearCarriers removes all active carriers', () => {
    const e = makeEnemy(1);
    e.pos.y = 10;
    createCarrier(e, { x: 1, y: 0, z: 0 }, {
      speed: 25,
      gravityMult: 0,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    clearCarriers();
    expect(getActiveCarriers()).toHaveLength(0);
  });

  it('through-hit does not stop the carrier', () => {
    const payload = makeEnemy(1);
    payload.pos = { x: 0, y: 5, z: 0 };
    const bystander = makeEnemy(2);
    bystander.pos = { x: 0.3, y: 5, z: 0 };
    createCarrier(payload, { x: 1, y: 0, z: 0 }, {
      speed: 25,
      gravityMult: 0,
      throughDamage: 20,
      throughKnockback: 8,
      impactDamage: 15,
      impactRadius: 2.0,
      impactKnockback: 10,
      impactShake: 2.5,
    });
    updateCarriers(0.016, makeGameState([payload, bystander]));
    expect(getActiveCarriers()).toHaveLength(1); // still flying
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/entity-carrier.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the entity carrier system**

Create `src/engine/entityCarrier.ts`:

```typescript
import { getGroundHeight } from '../config/terrain';
import { screenShake } from './renderer';
import { emit } from './events';
import { spawnDamageNumber } from '../ui/damageNumbers';

export interface CarrierConfig {
  speed: number;
  gravityMult: number;
  throughDamage: number;
  throughKnockback: number;
  impactDamage: number;
  impactRadius: number;
  impactKnockback: number;
  impactShake: number;
}

interface Carrier {
  payload: any;            // the entity being carried
  vel: { x: number; y: number; z: number };
  config: CarrierConfig;
  hitSet: Set<any>;        // enemies already hit (no double-hit)
}

const carriers: Carrier[] = [];
const GRAVITY = 25; // matches JUMP.gravity

export function createCarrier(
  payload: any,
  direction: { x: number; y: number; z: number },
  config: CarrierConfig,
): void {
  // Normalize direction and scale by speed
  const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z) || 1;
  carriers.push({
    payload,
    vel: {
      x: (direction.x / len) * config.speed,
      y: (direction.y / len) * config.speed,
      z: (direction.z / len) * config.speed,
    },
    config,
    hitSet: new Set([payload]), // payload is immune to its own carrier
  });
}

export function updateCarriers(dt: number, gameState: any): void {
  for (let i = carriers.length - 1; i >= 0; i--) {
    const c = carriers[i];
    const payload = c.payload;

    // Apply gravity
    c.vel.y -= GRAVITY * c.config.gravityMult * dt;

    // Move payload
    payload.pos.x += c.vel.x * dt;
    payload.pos.y += c.vel.y * dt;
    payload.pos.z += c.vel.z * dt;

    // Sync mesh
    if (payload.mesh) {
      payload.mesh.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
    }

    // Through-hit collision: check against all enemies
    if (gameState.enemies) {
      for (let j = 0; j < gameState.enemies.length; j++) {
        const e = gameState.enemies[j];
        if (c.hitSet.has(e)) continue;
        if (e.health <= 0 || e.fellInPit) continue;

        const dx = e.pos.x - payload.pos.x;
        const dy = e.pos.y - payload.pos.y;
        const dz = e.pos.z - payload.pos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const hitRadius = 1.5; // generous collision radius

        if (distSq < hitRadius * hitRadius) {
          c.hitSet.add(e);
          e.health -= c.config.throughDamage;
          e.flashTimer = 100;

          // Knockback away from flight path
          const dist = Math.sqrt(dx * dx + dz * dz) || 0.1;
          if (e.vel) {
            e.vel.x += (dx / dist) * c.config.throughKnockback;
            e.vel.z += (dz / dist) * c.config.throughKnockback;
          }

          emit({
            type: 'spikeThrough',
            enemy: e,
            damage: c.config.throughDamage,
            position: { x: e.pos.x, z: e.pos.z },
          });
          spawnDamageNumber(e.pos.x, e.pos.z, `${c.config.throughDamage}`, '#ff8844');
        }
      }
    }

    // Ground impact check
    const groundY = getGroundHeight(payload.pos.x, payload.pos.z);
    if (payload.pos.y <= groundY) {
      payload.pos.y = groundY;

      // AoE impact damage
      if (gameState.enemies) {
        for (let j = 0; j < gameState.enemies.length; j++) {
          const e = gameState.enemies[j];
          if (e === payload) continue;
          if (e.health <= 0 || e.fellInPit) continue;
          const dx = e.pos.x - payload.pos.x;
          const dz = e.pos.z - payload.pos.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < c.config.impactRadius * c.config.impactRadius) {
            e.health -= c.config.impactDamage;
            e.flashTimer = 100;
            const dist = Math.sqrt(distSq) || 0.1;
            if (e.vel) {
              e.vel.x += (dx / dist) * c.config.impactKnockback;
              e.vel.z += (dz / dist) * c.config.impactKnockback;
            }
          }
        }
      }

      // Stop payload velocity
      if (payload.vel) {
        payload.vel.x = 0;
        payload.vel.y = 0;
        payload.vel.z = 0;
      }
      if (payload.mesh) {
        payload.mesh.position.set(payload.pos.x, payload.pos.y, payload.pos.z);
      }

      screenShake(c.config.impactShake);
      emit({
        type: 'spikeImpact',
        enemy: payload,
        damage: c.config.impactDamage,
        position: { x: payload.pos.x, z: payload.pos.z },
      });
      spawnDamageNumber(payload.pos.x, payload.pos.z, 'IMPACT!', '#ff4422');

      // Remove carrier
      carriers.splice(i, 1);
    }
  }
}

export function getActiveCarriers(): readonly Carrier[] {
  return carriers;
}

export function clearCarriers(): void {
  carriers.length = 0;
}
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/entity-carrier.test.ts`
Expected: All tests PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (no regressions)

**Step 6: Commit**

```bash
git add src/engine/entityCarrier.ts tests/entity-carrier.test.ts
git commit -m "feat: entity carrier system — physics projectile with payload"
```

---

### Task 5: Build Float Selector verb

The selector owns rising + float phases, resolves to dunk or spike based on LMB tap/hold.

**Files:**
- Create: `src/verbs/floatSelector.ts`
- Create: `tests/float-selector.test.ts`

**Step 1: Write the failing tests**

Create `tests/float-selector.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DUNK, FLOAT_SELECTOR } from '../src/config/player';

// Mock THREE-dependent modules
vi.mock('../src/engine/renderer', () => ({
  screenShake: vi.fn(),
  getScene: vi.fn(() => ({
    add: vi.fn(),
    remove: vi.fn(),
  })),
}));

vi.mock('../src/ui/damageNumbers', () => ({
  spawnDamageNumber: vi.fn(),
}));

vi.mock('../src/engine/events', () => ({
  emit: vi.fn(),
}));

// Mock transferClaim so we can spy on what verb gets selected
vi.mock('../src/engine/aerialVerbs', () => ({
  setGravityOverride: vi.fn(),
  transferClaim: vi.fn(),
}));

// Minimal THREE global
(globalThis as any).THREE = {
  Group: vi.fn(() => ({
    position: { set: vi.fn(), copy: vi.fn() },
    scale: { set: vi.fn(), x: 1 },
    add: vi.fn(),
    traverse: vi.fn(),
    getObjectByName: vi.fn(() => ({ position: { set: vi.fn() } })),
  })),
  Mesh: vi.fn(() => ({
    rotation: { x: 0 },
    position: { set: vi.fn(), copy: vi.fn() },
    name: '',
  })),
  CircleGeometry: vi.fn(() => ({ dispose: vi.fn() })),
  RingGeometry: vi.fn(() => ({ dispose: vi.fn() })),
  MeshBasicMaterial: vi.fn(() => ({ dispose: vi.fn(), opacity: 0.5 })),
};

import { floatSelectorVerb, getFloatSelectorPhase, resetFloatSelector } from '../src/verbs/floatSelector';
import { transferClaim } from '../src/engine/aerialVerbs';

function makeEntry(enemy: any) {
  return { enemy, launchTime: performance.now(), claimedBy: 'floatSelector', gravityMult: 1 };
}

function makePlayerPos(x = 0, y = 5, z = 0) {
  return { x, y, z };
}

function makeInputState(overrides: any = {}) {
  return {
    attack: false,
    attackHeld: false,
    aimWorldPos: { x: 5, y: 0, z: 5 },
    launch: false,
    _gameState: { enemies: [] },
    ...overrides,
  };
}

describe('Float Selector Verb Interface', () => {
  beforeEach(() => resetFloatSelector());

  it('has name "floatSelector"', () => {
    expect(floatSelectorVerb.name).toBe('floatSelector');
  });

  it('is interruptible', () => {
    expect(floatSelectorVerb.interruptible).toBe(true);
  });

  it('implements all AerialVerb methods', () => {
    expect(typeof floatSelectorVerb.canClaim).toBe('function');
    expect(typeof floatSelectorVerb.onClaim).toBe('function');
    expect(typeof floatSelectorVerb.update).toBe('function');
    expect(typeof floatSelectorVerb.onCancel).toBe('function');
    expect(typeof floatSelectorVerb.onComplete).toBe('function');
  });
});

describe('Float Selector Rising Phase', () => {
  beforeEach(() => {
    resetFloatSelector();
    vi.clearAllMocks();
  });

  it('onClaim sets phase to rising', () => {
    const enemy = { pos: { x: 0, y: 2, z: 0 }, vel: { x: 0, y: 5, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    expect(getFloatSelectorPhase()).toBe('rising');
  });

  it('stays active during rising when enemy is still going up', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 3, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 3, 0), makeInputState());
    expect(result).toBe('active');
    expect(getFloatSelectorPhase()).toBe('rising');
  });

  it('transitions to float when enemy descends within convergence distance', () => {
    const enemy = { pos: { x: 0, y: 6, z: 0 }, vel: { x: 0, y: -1, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    // Enemy above player, descending, within floatConvergeDist
    const result = floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState());
    expect(getFloatSelectorPhase()).toBe('float');
  });

  it('cancels if enemy dies during rising', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 3, z: 0 }, health: 0, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, makePlayerPos(), makeInputState());
    expect(result).toBe('cancel');
  });
});

describe('Float Selector Float Phase — Input Resolution', () => {
  beforeEach(() => {
    resetFloatSelector();
    vi.clearAllMocks();
  });

  function enterFloat() {
    const enemy = { pos: { x: 0, y: 6, z: 0 }, vel: { x: 0, y: -1, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    // Force transition to float
    floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState());
    expect(getFloatSelectorPhase()).toBe('float');
    return { enemy, entry };
  }

  it('tap LMB (press then release before threshold) transfers to spike', () => {
    const { enemy, entry } = enterFloat();

    // Frame 1: LMB pressed
    floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState({ attack: true, attackHeld: true }));

    // Frame 2-5: held for ~64ms (below 180ms threshold)
    for (let i = 0; i < 4; i++) {
      floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState({ attackHeld: true }));
    }

    // Frame 6: released
    const result = floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState({ attackHeld: false }));
    expect(transferClaim).toHaveBeenCalledWith(enemy, 'spike');
  });

  it('hold LMB past threshold transfers to dunk', () => {
    const { enemy, entry } = enterFloat();

    // Frame 1: LMB pressed
    floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState({ attack: true, attackHeld: true }));

    // Hold for 200ms (12+ frames at 16ms) — past 180ms threshold
    for (let i = 0; i < 12; i++) {
      floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState({ attackHeld: true }));
    }

    expect(transferClaim).toHaveBeenCalledWith(enemy, 'dunk');
  });

  it('float expires with no input returns cancel', () => {
    const { entry } = enterFloat();

    // Tick through entire float duration (600ms = ~38 frames at 16ms)
    let result: string = 'active';
    for (let i = 0; i < 50; i++) {
      result = floatSelectorVerb.update(0.016, entry, makePlayerPos(0, 5, 0), makeInputState());
      if (result !== 'active') break;
    }
    expect(result).toBe('cancel');
  });
});

describe('Float Selector Config', () => {
  it('hold threshold is positive and less than float duration', () => {
    expect(FLOAT_SELECTOR.holdThreshold).toBeGreaterThan(0);
    expect(FLOAT_SELECTOR.holdThreshold).toBeLessThan(DUNK.floatDuration);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/float-selector.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the float selector verb**

Create `src/verbs/floatSelector.ts`:

```typescript
import { DUNK, FLOAT_SELECTOR } from '../config/player';
import { setGravityOverride, transferClaim } from '../engine/aerialVerbs';
import type { AerialVerb, LaunchedEnemy } from '../engine/aerialVerbs';
import { screenShake, getScene } from '../engine/renderer';
import { spawnDamageNumber } from '../ui/damageNumbers';

// --------------- Internal State ---------------

type SelectorPhase = 'none' | 'rising' | 'float';

let phase: SelectorPhase = 'none';
let target: any = null;
let floatTimer = 0;

// LMB hold tracking
let lmbPressed = false;        // true on the frame LMB was first pressed during float
let lmbHoldTimer = 0;          // ms held since press
let resolved = false;          // true once we've transferred to a verb

// Decal state (faded landing preview)
let decalGroup: any = null;
let originX = 0;
let originZ = 0;
let landingX = 0;
let landingZ = 0;

// Charge ring visual state
let chargeRing: any = null;
let chargeRingProgress = 0;    // 0 to 1

// --------------- Decal (faded dunk preview) ---------------

function createDecal(cx: number, cz: number): void {
  const scene = getScene();
  const radius = DUNK.targetRadius;

  decalGroup = new THREE.Group();
  decalGroup.position.set(cx, 0.06, cz);

  const fillGeo = new THREE.CircleGeometry(radius, 32);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xff44ff,
    transparent: true,
    opacity: 0.04, // faded — not committed to dunk yet
    depthWrite: false,
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.rotation.x = -Math.PI / 2;
  decalGroup.add(fill);

  const ringGeo = new THREE.RingGeometry(radius - 0.06, radius, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff66ff,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  decalGroup.add(ring);

  scene.add(decalGroup);
}

function updateDecal(playerX: number, playerZ: number, aimX: number, aimZ: number): void {
  if (!decalGroup) return;
  originX = playerX;
  originZ = playerZ;
  decalGroup.position.set(originX, 0.06, originZ);

  // Clamp aim to radius
  const dx = aimX - originX;
  const dz = aimZ - originZ;
  const dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
  const clamped = Math.min(dist, DUNK.targetRadius);
  landingX = originX + (dx / dist) * clamped;
  landingZ = originZ + (dz / dist) * clamped;
}

function removeDecal(): void {
  if (!decalGroup) return;
  const scene = getScene();
  decalGroup.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
  scene.remove(decalGroup);
  decalGroup = null;
}

// --------------- Charge Ring Visual ---------------

function createChargeRing(): void {
  // Ring around player that fills as hold progresses
  const scene = getScene();
  const geo = new THREE.RingGeometry(0.5, 0.65, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  chargeRing = new THREE.Mesh(geo, mat);
  chargeRing.rotation.x = -Math.PI / 2;
  chargeRingProgress = 0;
  scene.add(chargeRing);
}

function updateChargeRing(playerX: number, playerY: number, playerZ: number, progress: number): void {
  if (!chargeRing) return;
  chargeRingProgress = progress;
  chargeRing.position.set(playerX, playerY + 0.5, playerZ);
  // Scale ring based on progress (0 = small, 1 = full)
  const scale = 0.5 + progress * 0.5;
  chargeRing.scale.set(scale, scale, scale);
  (chargeRing.material as any).opacity = 0.3 + progress * 0.5;
  // Color shift: orange → red as it fills
  const r = 1.0;
  const g = 0.53 * (1 - progress);
  const b = 0;
  (chargeRing.material as any).color.setRGB(r, g, b);
}

function removeChargeRing(): void {
  if (!chargeRing) return;
  const scene = getScene();
  if (chargeRing.geometry) chargeRing.geometry.dispose();
  if (chargeRing.material) chargeRing.material.dispose();
  scene.remove(chargeRing);
  chargeRing = null;
  chargeRingProgress = 0;
}

// --------------- AerialVerb Implementation ---------------

export const floatSelectorVerb: AerialVerb = {
  name: 'floatSelector',
  interruptible: true,

  canClaim(_entry: LaunchedEnemy, _playerPos: any, _inputState: any): boolean {
    return true;
  },

  onClaim(entry: LaunchedEnemy): void {
    phase = 'rising';
    target = entry.enemy;
    floatTimer = 0;
    lmbPressed = false;
    lmbHoldTimer = 0;
    resolved = false;
    createDecal(entry.enemy.pos.x, entry.enemy.pos.z);
  },

  update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
    const enemy = entry.enemy;

    if (phase === 'rising') {
      return updateRising(dt, enemy, playerPos, inputState);
    } else if (phase === 'float') {
      return updateFloat(dt, enemy, playerPos, inputState);
    }

    return 'cancel';
  },

  onCancel(_entry: LaunchedEnemy): void {
    cleanup();
    setGravityOverride(_entry.enemy, 1);
  },

  onComplete(_entry: LaunchedEnemy): void {
    cleanup();
  },
};

// --------------- Rising Phase ---------------

function updateRising(dt: number, enemy: any, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
  const vel = enemy.vel;
  const rising = vel && vel.y > 0;

  updateDecal(playerPos.x, playerPos.z, inputState.aimWorldPos.x, inputState.aimWorldPos.z);

  // Cancel if enemy died or landed
  if (enemy.health <= 0 || enemy.fellInPit || (enemy.pos.y <= 0.3 && !rising)) {
    return 'cancel';
  }

  // Convergence check: enemy past apex and within Y distance
  if (vel && vel.y <= 0) {
    const dy = enemy.pos.y - playerPos.y;
    if (dy >= 0 && dy <= DUNK.floatConvergeDist) {
      phase = 'float';
      floatTimer = DUNK.floatDuration;
      setGravityOverride(enemy, 0);
      screenShake(DUNK.grabShake * 0.5);
      spawnDamageNumber(playerPos.x, playerPos.z, 'CATCH!', '#ff88ff');
      return 'active';
    }
  }

  return 'active';
}

// --------------- Float Phase ---------------

function updateFloat(dt: number, enemy: any, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
  floatTimer -= dt * 1000;
  const vel = enemy.vel;

  // Zero gravity — hold both in place
  if (vel) vel.y = 0;

  // Drift enemy toward player
  const targetY = playerPos.y + DUNK.floatEnemyOffsetY;
  enemy.pos.y += (targetY - enemy.pos.y) * Math.min(1, dt * 10);

  // XZ drift (exponential lerp)
  const driftDx = playerPos.x - enemy.pos.x;
  const driftDz = playerPos.z - enemy.pos.z;
  const lerpFactor = 1 - Math.exp(-12 * dt);
  enemy.pos.x += driftDx * lerpFactor;
  enemy.pos.z += driftDz * lerpFactor;

  if (enemy.mesh) enemy.mesh.position.copy(enemy.pos);

  // Update targeting
  updateDecal(playerPos.x, playerPos.z, inputState.aimWorldPos.x, inputState.aimWorldPos.z);

  // --- LMB hold detection ---
  if (inputState.attack && !lmbPressed) {
    // LMB just pressed this frame
    lmbPressed = true;
    lmbHoldTimer = 0;
    createChargeRing();
  }

  if (lmbPressed && inputState.attackHeld) {
    // Still holding
    lmbHoldTimer += dt * 1000;

    // Update charge visual
    const chargeDelay = FLOAT_SELECTOR.chargeVisualDelay;
    const visualTimer = Math.max(0, lmbHoldTimer - chargeDelay);
    const progress = Math.min(visualTimer / (FLOAT_SELECTOR.holdThreshold - chargeDelay), 1);
    updateChargeRing(playerPos.x, playerPos.y, playerPos.z, progress);

    // Hold past threshold → DUNK
    if (lmbHoldTimer >= FLOAT_SELECTOR.holdThreshold) {
      resolved = true;
      removeChargeRing();
      transferClaim(target, 'dunk');
      return 'complete';
    }
  } else if (lmbPressed && !inputState.attackHeld) {
    // Released before threshold → SPIKE
    resolved = true;
    removeChargeRing();
    transferClaim(target, 'spike');
    return 'complete';
  }

  // Float expired
  if (floatTimer <= 0) {
    return 'cancel';
  }

  return 'active';
}

// --------------- Cleanup ---------------

function cleanup(): void {
  phase = 'none';
  target = null;
  floatTimer = 0;
  lmbPressed = false;
  lmbHoldTimer = 0;
  resolved = false;
  removeDecal();
  removeChargeRing();
}

// --------------- Public Queries ---------------

export function getFloatSelectorPhase(): SelectorPhase {
  return phase;
}

export function getFloatSelectorLandingPos(): { x: number; z: number } | null {
  if (phase === 'none') return null;
  return { x: landingX, z: landingZ };
}

export function isFloatSelectorActive(): boolean {
  return phase !== 'none';
}

export function resetFloatSelector(): void {
  cleanup();
}
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/float-selector.test.ts`
Expected: All tests PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/verbs/floatSelector.ts tests/float-selector.test.ts
git commit -m "feat: float selector verb — rising + float + tap/hold input resolution"
```

---

### Task 6: Build Spike verb

The spike verb handles windup → strike → recovery after the selector transfers to it.

**Files:**
- Create: `src/verbs/spike.ts`
- Create: `tests/spike-verb.test.ts`

**Step 1: Write the failing tests**

Create `tests/spike-verb.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SPIKE } from '../src/config/player';

vi.mock('../src/engine/renderer', () => ({
  screenShake: vi.fn(),
  getScene: vi.fn(() => ({
    add: vi.fn(),
    remove: vi.fn(),
  })),
}));

vi.mock('../src/ui/damageNumbers', () => ({
  spawnDamageNumber: vi.fn(),
}));

vi.mock('../src/engine/events', () => ({
  emit: vi.fn(),
}));

vi.mock('../src/engine/entityCarrier', () => ({
  createCarrier: vi.fn(),
}));

vi.mock('../src/engine/aerialVerbs', () => ({
  setGravityOverride: vi.fn(),
  releaseLaunched: vi.fn(),
}));

import { spikeVerb, getSpikePhase, resetSpike, getSpikePlayerVelYOverride, getSpikeFastFallActive } from '../src/verbs/spike';
import { createCarrier } from '../src/engine/entityCarrier';

function makeEntry(enemy: any) {
  return { enemy, launchTime: performance.now(), claimedBy: 'spike', gravityMult: 0 };
}

function makePlayerPos(x = 0, y = 5, z = 0) {
  return { x, y, z };
}

function makeInputState(overrides: any = {}) {
  return {
    aimWorldPos: { x: 5, y: 0, z: 5 },
    _gameState: { enemies: [] },
    ...overrides,
  };
}

describe('Spike Verb Interface', () => {
  beforeEach(() => resetSpike());

  it('has name "spike"', () => {
    expect(spikeVerb.name).toBe('spike');
  });

  it('is not interruptible', () => {
    expect(spikeVerb.interruptible).toBe(false);
  });

  it('implements all AerialVerb methods', () => {
    expect(typeof spikeVerb.canClaim).toBe('function');
    expect(typeof spikeVerb.onClaim).toBe('function');
    expect(typeof spikeVerb.update).toBe('function');
    expect(typeof spikeVerb.onCancel).toBe('function');
    expect(typeof spikeVerb.onComplete).toBe('function');
  });
});

describe('Spike Verb State Machine', () => {
  beforeEach(() => {
    resetSpike();
    vi.clearAllMocks();
  });

  it('onClaim sets phase to windup', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    spikeVerb.onClaim(makeEntry(enemy));
    expect(getSpikePhase()).toBe('windup');
  });

  it('windup transitions to strike after windupDuration', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    spikeVerb.onClaim(entry);

    // Tick past windup duration (80ms = 5 frames at 16ms)
    for (let i = 0; i < 6; i++) {
      spikeVerb.update(0.016, entry, makePlayerPos(), makeInputState());
    }
    expect(getSpikePhase()).toBe('strike');
  });

  it('strike creates a carrier and transitions to recovery', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    spikeVerb.onClaim(entry);

    // Tick through windup + into strike
    for (let i = 0; i < 10; i++) {
      spikeVerb.update(0.016, entry, makePlayerPos(), makeInputState());
    }

    expect(createCarrier).toHaveBeenCalled();
    expect(getSpikePhase()).toBe('recovery');
  });

  it('recovery completes after hangDuration', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    spikeVerb.onClaim(entry);

    // Tick through windup + strike + recovery
    let result: string = 'active';
    for (let i = 0; i < 30; i++) {
      result = spikeVerb.update(0.016, entry, makePlayerPos(), makeInputState());
      if (result === 'complete') break;
    }
    expect(result).toBe('complete');
  });

  it('spike deals damage to enemy on strike', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    spikeVerb.onClaim(entry);

    for (let i = 0; i < 10; i++) {
      spikeVerb.update(0.016, entry, makePlayerPos(), makeInputState());
    }
    expect(enemy.health).toBe(50 - SPIKE.damage);
  });

  it('fast fall is active during recovery', () => {
    const enemy = { pos: { x: 0, y: 5, z: 0 }, vel: { x: 0, y: 0, z: 0 }, health: 50, mesh: { position: { set: vi.fn(), copy: vi.fn() } } };
    const entry = makeEntry(enemy);
    spikeVerb.onClaim(entry);

    // Tick into recovery phase
    for (let i = 0; i < 15; i++) {
      spikeVerb.update(0.016, entry, makePlayerPos(), makeInputState());
    }
    expect(getSpikeFastFallActive()).toBe(true);
  });
});

describe('Spike Config', () => {
  it('projectile speed is positive', () => {
    expect(SPIKE.projectileSpeed).toBeGreaterThan(0);
  });

  it('projectile angle is positive (degrees below horizontal)', () => {
    expect(SPIKE.projectileAngle).toBeGreaterThan(0);
    expect(SPIKE.projectileAngle).toBeLessThan(90);
  });

  it('impact radius is positive', () => {
    expect(SPIKE.impactRadius).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/spike-verb.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the spike verb**

Create `src/verbs/spike.ts`:

```typescript
import { SPIKE } from '../config/player';
import { setGravityOverride } from '../engine/aerialVerbs';
import type { AerialVerb, LaunchedEnemy } from '../engine/aerialVerbs';
import { createCarrier } from '../engine/entityCarrier';
import { screenShake } from '../engine/renderer';
import { emit } from '../engine/events';
import { spawnDamageNumber } from '../ui/damageNumbers';

// --------------- Internal State ---------------

type SpikePhase = 'none' | 'windup' | 'strike' | 'recovery';

let phase: SpikePhase = 'none';
let target: any = null;
let phaseTimer = 0;

// Aim snapshot (captured at onClaim, used for carrier direction)
let aimX = 0;
let aimZ = 0;

// Player overrides
let playerVelYOverride: number | null = null;
let fastFallActive = false;

// --------------- AerialVerb Implementation ---------------

export const spikeVerb: AerialVerb = {
  name: 'spike',
  interruptible: false,

  canClaim(_entry: LaunchedEnemy, _playerPos: any, _inputState: any): boolean {
    return true;
  },

  onClaim(entry: LaunchedEnemy): void {
    phase = 'windup';
    target = entry.enemy;
    phaseTimer = 0;
    playerVelYOverride = 0; // hold player in place during windup
    fastFallActive = false;
  },

  update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
    // Snapshot aim on first update (selector already resolved, aim is current)
    if (phaseTimer === 0 && phase === 'windup') {
      aimX = inputState.aimWorldPos.x;
      aimZ = inputState.aimWorldPos.z;
    }

    phaseTimer += dt * 1000;

    if (phase === 'windup') {
      // Hold enemy in place during windup
      if (entry.enemy.vel) entry.enemy.vel.y = 0;
      if (entry.enemy.mesh) entry.enemy.mesh.position.copy(entry.enemy.pos);

      if (phaseTimer >= SPIKE.windupDuration) {
        // Transition to strike
        phase = 'strike';
        executeStrike(entry, playerPos);
        phaseTimer = 0;
      }
      return 'active';
    }

    if (phase === 'strike') {
      // Strike is instantaneous — transition to recovery
      phase = 'recovery';
      phaseTimer = 0;

      // Player enters hang → fast fall
      playerVelYOverride = 0; // brief hang
      fastFallActive = true;
      return 'active';
    }

    if (phase === 'recovery') {
      // Hang for hangDuration, then fast fall (player.ts reads fastFallActive)
      if (phaseTimer >= SPIKE.hangDuration) {
        playerVelYOverride = null; // release player to normal gravity (player.ts applies fastFallGravityMult)
        return 'complete';
      }
      return 'active';
    }

    return 'cancel';
  },

  onCancel(_entry: LaunchedEnemy): void {
    cleanup();
    setGravityOverride(_entry.enemy, 1);
  },

  onComplete(_entry: LaunchedEnemy): void {
    cleanup();
  },
};

// --------------- Strike Execution ---------------

function executeStrike(entry: LaunchedEnemy, playerPos: any): void {
  const enemy = entry.enemy;

  // Deal spike damage
  enemy.health -= SPIKE.damage;
  enemy.flashTimer = 120;

  // Calculate carrier direction: angled downward toward aim position
  const dx = aimX - playerPos.x;
  const dz = aimZ - playerPos.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz) || 0.01;

  // Convert angle to radians (angle is degrees below horizontal)
  const angleRad = (SPIKE.projectileAngle * Math.PI) / 180;
  const dirX = dx / horizontalDist;
  const dirZ = dz / horizontalDist;
  const dirY = -Math.tan(angleRad); // negative = downward

  // Create carrier — enemy becomes a projectile
  createCarrier(enemy, { x: dirX, y: dirY, z: dirZ }, {
    speed: SPIKE.projectileSpeed,
    gravityMult: 0.5, // some gravity for arc feel
    throughDamage: SPIKE.throughDamage,
    throughKnockback: SPIKE.throughKnockback,
    impactDamage: SPIKE.impactDamage,
    impactRadius: SPIKE.impactRadius,
    impactKnockback: SPIKE.impactKnockback,
    impactShake: SPIKE.impactShake,
  });

  // Release from aerial verb registry (carrier now owns the enemy)
  // Note: releaseLaunched is called by the framework on complete

  // Screen shake
  screenShake(SPIKE.screenShake);

  emit({
    type: 'spikeStrike',
    enemy,
    damage: SPIKE.damage,
    position: { x: playerPos.x, z: playerPos.z },
  });
  spawnDamageNumber(enemy.pos.x, enemy.pos.z, 'SPIKE!', '#ff6622');
}

// --------------- Cleanup ---------------

function cleanup(): void {
  phase = 'none';
  target = null;
  phaseTimer = 0;
  playerVelYOverride = null;
  fastFallActive = false;
  aimX = 0;
  aimZ = 0;
}

// --------------- Public Queries ---------------

export function getSpikePhase(): SpikePhase {
  return phase;
}

export function getSpikePlayerVelYOverride(): number | null {
  return playerVelYOverride;
}

export function getSpikeFastFallActive(): boolean {
  return fastFallActive;
}

export function resetSpike(): void {
  cleanup();
}
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/spike-verb.test.ts`
Expected: All tests PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/verbs/spike.ts tests/spike-verb.test.ts
git commit -m "feat: spike verb — windup, strike, carrier creation, recovery"
```

---

### Task 7: Simplify Dunk verb (remove rising + float)

The selector now owns rising and float. Dunk starts directly from grab.

**Files:**
- Modify: `src/verbs/dunk.ts`
- Modify: `tests/dunk-verb.test.ts`

**Step 1: Update dunk.ts**

In `src/verbs/dunk.ts`:

1. Remove the `'rising'` and `'float'` values from `DunkPhase` type:
```typescript
type DunkPhase = 'none' | 'grab' | 'slam';
```

2. In `onClaim`, change to immediately enter grab phase. Replace the current `onClaim` body with:
```typescript
onClaim(entry: LaunchedEnemy): void {
  target = entry.enemy;
  playerVelYOverride = null;
  landingLagMs = 0;
  transitionToGrab(entry.enemy, null); // playerPos comes from first update
},
```

Note: `transitionToGrab` needs playerPos. Since onClaim doesn't receive it, we defer the full grab setup to the first update call. Instead, set phase to 'grab' and let update handle the snap:

Actually, simpler approach — the `onClaim` sets phase to `'grab'` and the first `update` call executes `transitionToGrab`:

```typescript
onClaim(entry: LaunchedEnemy): void {
  phase = 'grab';
  target = entry.enemy;
  floatTimer = 0;
  playerVelYOverride = null;
  landingLagMs = 0;
},
```

3. In the `update` method, remove the rising and float branches. When phase is `'grab'`, call `transitionToGrab` on the first frame (if slamStartY is 0), then fall through to slam logic:

Replace the update body with:
```typescript
update(dt: number, entry: LaunchedEnemy, playerPos: any, inputState: any): 'active' | 'complete' | 'cancel' {
  const enemy = entry.enemy;
  _gameState = inputState._gameState;

  if (phase === 'grab') {
    transitionToGrab(enemy, playerPos);
    // Fall through to slam — grab is instantaneous
    phase = 'slam';
  }

  if (phase === 'slam') {
    return updateSlam(dt, enemy, playerPos, inputState);
  }

  return 'cancel';
},
```

4. Remove the `updateRising` and `updateFloat` functions entirely.

5. Update `transitionToGrab` — the selector already stored the landing target via `initDunkTarget`, so targeting data should be valid. Remove the `inputState.launch = false;` line if present (selector handles input now).

6. Remove the decal creation from `onClaim` — the selector already has the decal. The dunk's `transitionToGrab` creates the trail and does the grab shake.

Actually, the dunk still needs its own decal for the slam phase (to show the landing target during slam). The selector's decal was faded/preview. On transfer to dunk, the dunk should create its full-opacity decal. Keep `createDecal` call in `transitionToGrab`.

**Step 2: Update tests**

In `tests/dunk-verb.test.ts`:

- Remove any tests that reference `'rising'` or `'float'` phases
- Update `DunkPhase` expectations: valid phases are `'none'`, `'grab'`, `'slam'`
- Verify `onClaim` sets phase to `'grab'`

**Step 3: Run tests**

Run: `npx vitest run tests/dunk-verb.test.ts`
Expected: All PASS

**Step 4: Run full suite**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/verbs/dunk.ts tests/dunk-verb.test.ts
git commit -m "refactor: simplify dunk — remove rising/float (selector owns those)"
```

---

### Task 8: Wire player.ts — launch claims floatSelector

**Files:**
- Modify: `src/entities/player.ts`

**Step 1: Update imports**

Replace dunk-specific imports with selector + spike + dunk:

```typescript
import { registerLaunch, claimLaunched, activateVerb } from '../engine/aerialVerbs';
import { isFloatSelectorActive, getFloatSelectorLandingPos, resetFloatSelector } from '../verbs/floatSelector';
import { getDunkPhase, getDunkPlayerVelY, getDunkLandingLag, isDunkActive, updateDunkVisuals, initDunkTarget, resetDunk } from '../verbs/dunk';
import { getSpikePlayerVelYOverride, getSpikeFastFallActive, resetSpike } from '../verbs/spike';
```

**Step 2: Change launch to claim floatSelector**

In the launch block (~line 209-215), replace:
```typescript
registerLaunch(closestEnemy);
claimLaunched(closestEnemy, 'dunk');
activateVerb('dunk', closestEnemy);
initDunkTarget(closestEnemy.pos.x, closestEnemy.pos.z, inputState.aimWorldPos.x, inputState.aimWorldPos.z);
```

With:
```typescript
registerLaunch(closestEnemy);
claimLaunched(closestEnemy, 'floatSelector');
activateVerb('floatSelector', closestEnemy);
```

**Step 3: Update self-slam guard**

The self-slam check (~line 233) currently uses `!isDunkActive()`. Update to also check for float selector:

```typescript
if (inputState.launch && isPlayerAirborne && !isSlamming && !isDunkActive() && !isFloatSelectorActive()) {
```

**Step 4: Integrate spike player velocity override**

Wherever player.ts reads `getDunkPlayerVelY()` to override playerVelY, also check `getSpikePlayerVelYOverride()`:

Find the existing dunk velocity override code and add spike check:
```typescript
const dunkVelY = getDunkPlayerVelY();
const spikeVelY = getSpikePlayerVelYOverride();
if (dunkVelY !== null) {
  playerVelY = dunkVelY;
} else if (spikeVelY !== null) {
  playerVelY = spikeVelY;
}
```

**Step 5: Integrate spike fast fall**

After landing detection or in the gravity section, check for spike fast fall:
```typescript
if (getSpikeFastFallActive()) {
  // Enhanced gravity during post-spike fall
  playerVelY -= JUMP.gravity * SPIKE.fastFallGravityMult * dt;
}
```

Import `SPIKE` from config.

**Step 6: Update reset**

In the player reset function, add:
```typescript
resetFloatSelector();
resetSpike();
```

**Step 7: Build and test**

Run: `npm run build && npx vitest run`
Expected: Clean build, all tests pass

**Step 8: Commit**

```bash
git add src/entities/player.ts
git commit -m "feat: wire floatSelector — launch no longer auto-claims dunk"
```

---

### Task 9: Wire game loop + register verbs

**Files:**
- Modify: `src/engine/game.ts`

**Step 1: Update imports**

Add new imports:
```typescript
import { floatSelectorVerb } from '../verbs/floatSelector';
import { spikeVerb } from '../verbs/spike';
import { updateCarriers, clearCarriers } from '../engine/entityCarrier';
```

**Step 2: Register all three verbs**

Change `initAerialVerbs([dunkVerb])` (~line 195) to:
```typescript
initAerialVerbs([floatSelectorVerb, dunkVerb, spikeVerb]);
```

**Step 3: Add carrier update to game loop**

After `updateAerialVerbs` (~line 92), add:
```typescript
// 2c. Entity carriers (spiked enemies as projectiles) — real dt like player
updateCarriers(dt, gameState);
```

**Step 4: Add carrier reset**

In the `restart()` function, add `clearCarriers()` alongside `resetAerialVerbs()`:
```typescript
resetAerialVerbs();
clearCarriers();
```

**Step 5: Build and test**

Run: `npm run build && npx vitest run`
Expected: Clean build, all tests pass

**Step 6: Commit**

```bash
git add src/engine/game.ts
git commit -m "feat: register floatSelector + spike verbs, wire carrier updates"
```

---

### Task 10: Integration build + smoke test

**Files:** None new — verify everything works together.

**Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Type check**

Run: `npm run typecheck`
Expected: No type errors

**Step 4: Manual smoke test checklist**

Open the game in browser and verify:
- [ ] E near enemy → launches enemy, both rise
- [ ] During float → tap LMB → spike (enemy flies toward aim, damages enemies in path, AoE on ground)
- [ ] During float → hold LMB → charge ring fills → dunk (grab + slam to landing target)
- [ ] Float expires with no input → cancel, both drop normally
- [ ] Aerial strike (LMB while jumping, no launched enemy) → still works
- [ ] Self-slam (E while airborne, no active verb) → still works
- [ ] Post-spike: player hangs briefly then fast-falls
- [ ] Spike through-damage: spiked enemy hits other enemies along path
- [ ] Spike ground impact: AoE damages nearby enemies

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes from smoke test"
```
