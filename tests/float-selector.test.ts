import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DUNK, FLOAT_SELECTOR } from '../src/config/player';

// --------------- Mocks ---------------

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

// Mock aerialVerbs — spy on transferClaim to verify verb selection
vi.mock('../src/engine/aerialVerbs', () => ({
  setGravityOverride: vi.fn(),
  transferClaim: vi.fn(),
}));

// Minimal THREE global for visual code (decal, charge ring)
const mockGeometry = {
  dispose: vi.fn(),
  setAttribute: vi.fn(),
  setDrawRange: vi.fn(),
  getAttribute: vi.fn(() => ({ array: new Float32Array(60), needsUpdate: false })),
};
const mockMaterial = { dispose: vi.fn(), opacity: 0.5, color: { setHex: vi.fn() } };
(globalThis as any).THREE = {
  Group: vi.fn(function (this: any) {
    this.position = { set: vi.fn(), copy: vi.fn() };
    this.scale = { set: vi.fn(), x: 1 };
    this.rotation = { x: 0, y: 0 };
    this.add = vi.fn();
    this.traverse = vi.fn(function (_fn: any) {});
    this.getObjectByName = vi.fn(function () { return { position: { set: vi.fn() } }; });
  }),
  Mesh: vi.fn(function (this: any) {
    this.rotation = { x: 0 };
    this.position = { set: vi.fn(), copy: vi.fn() };
    this.name = '';
    this.material = { ...mockMaterial };
    this.geometry = mockGeometry;
  }),
  CircleGeometry: vi.fn(function () {}),
  RingGeometry: vi.fn(function () {}),
  MeshBasicMaterial: vi.fn(function (this: any) {
    this.dispose = vi.fn();
    this.opacity = 0.5;
    this.color = { setHex: vi.fn() };
  }),
};

import {
  floatSelectorVerb,
  getFloatSelectorPhase,
  getFloatSelectorLandingPos,
  isFloatSelectorActive,
  getFloatSelectorPlayerVelY,
  resetFloatSelector,
} from '../src/verbs/floatSelector';

import { setGravityOverride, transferClaim } from '../src/engine/aerialVerbs';
import { screenShake } from '../src/engine/renderer';
import { spawnDamageNumber } from '../src/ui/damageNumbers';

// --------------- Helpers ---------------

function makeEnemy(overrides: Partial<{ y: number; velY: number; health: number }> = {}) {
  return {
    pos: { x: 0, y: overrides.y ?? 4, z: 0 },
    vel: { x: 0, y: overrides.velY ?? 5, z: 0 },
    health: overrides.health ?? 50,
    mesh: { position: { set: vi.fn(), copy: vi.fn() } },
    fellInPit: false,
  } as any;
}

function makeEntry(enemy: any) {
  return {
    enemy,
    launchTime: performance.now(),
    claimedBy: 'floatSelector',
    gravityMult: 1,
  } as any;
}

function makePlayerPos(y = 3) {
  return { x: 0, y, z: 0 };
}

function makeInputState(overrides: Partial<{
  attack: boolean;
  attackHeld: boolean;
  aimWorldPos: { x: number; y: number; z: number };
}> = {}) {
  return {
    attack: overrides.attack ?? false,
    attackHeld: overrides.attackHeld ?? false,
    aimWorldPos: overrides.aimWorldPos ?? { x: 3, y: 0, z: 3 },
  } as any;
}

// --------------- Interface Tests ---------------

describe('Float Selector Verb Interface', () => {
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

// --------------- State Query Tests ---------------

describe('Float Selector State Queries', () => {
  beforeEach(() => resetFloatSelector());

  it('starts in none phase', () => {
    expect(getFloatSelectorPhase()).toBe('none');
  });

  it('isFloatSelectorActive returns false when not active', () => {
    expect(isFloatSelectorActive()).toBe(false);
  });

  it('getFloatSelectorLandingPos returns null when not active', () => {
    expect(getFloatSelectorLandingPos()).toBeNull();
  });

  it('getFloatSelectorPlayerVelY returns null when not active', () => {
    expect(getFloatSelectorPlayerVelY()).toBeNull();
  });
});

// --------------- Rising Phase Tests ---------------

describe('Float Selector Rising Phase', () => {
  beforeEach(() => {
    resetFloatSelector();
    vi.clearAllMocks();
  });

  it('onClaim sets phase to rising', () => {
    const enemy = makeEnemy();
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    expect(getFloatSelectorPhase()).toBe('rising');
    expect(isFloatSelectorActive()).toBe(true);
  });

  it('stays active while enemy is still rising (vel.y > 0)', () => {
    const enemy = makeEnemy({ velY: 5 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(result).toBe('active');
    expect(getFloatSelectorPhase()).toBe('rising');
  });

  it('stays active when enemy descending but too far from player Y', () => {
    const enemy = makeEnemy({ y: 10, velY: -2 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3); // dy = 7, way beyond floatConvergeDist (3.5)
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(result).toBe('active');
    expect(getFloatSelectorPhase()).toBe('rising');
  });

  it('transitions to float when enemy descends within convergeDist of player', () => {
    const enemy = makeEnemy({ y: 4, velY: -1 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3); // dy = 1, within floatConvergeDist (3.5)
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, playerPos, input);

    expect(result).toBe('active');
    expect(getFloatSelectorPhase()).toBe('float');
  });

  it('sets gravity override to 0 on float transition', () => {
    const enemy = makeEnemy({ y: 4, velY: -1 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    floatSelectorVerb.update(0.016, entry, playerPos, input);

    expect(setGravityOverride).toHaveBeenCalledWith(enemy, 0);
  });

  it('triggers screen shake and CATCH! damage number on float transition', () => {
    const enemy = makeEnemy({ y: 4, velY: -1 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    floatSelectorVerb.update(0.016, entry, playerPos, input);

    expect(screenShake).toHaveBeenCalled();
    expect(spawnDamageNumber).toHaveBeenCalledWith(
      playerPos.x, playerPos.z, 'CATCH!', expect.any(String)
    );
  });

  it('cancels if enemy dies during rising', () => {
    const enemy = makeEnemy({ velY: 5, health: 0 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(result).toBe('cancel');
  });

  it('cancels if enemy falls in pit during rising', () => {
    const enemy = makeEnemy({ velY: 5 });
    enemy.fellInPit = true;
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(result).toBe('cancel');
  });

  it('cancels if enemy lands (pos.y <= 0.3 and not rising)', () => {
    const enemy = makeEnemy({ y: 0.2, velY: -1 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    const result = floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(result).toBe('cancel');
  });

  it('playerVelY override is null during rising', () => {
    const enemy = makeEnemy({ velY: 5 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    const input = makeInputState();

    floatSelectorVerb.onClaim(entry);
    floatSelectorVerb.update(0.016, entry, playerPos, input);

    expect(getFloatSelectorPlayerVelY()).toBeNull();
  });
});

// --------------- Float Phase Input Resolution Tests ---------------

describe('Float Selector Float Phase — Input Resolution', () => {
  let enemy: any;
  let entry: any;
  let playerPos: any;

  beforeEach(() => {
    resetFloatSelector();
    vi.clearAllMocks();

    // Set up: claim + transition through rising into float
    enemy = makeEnemy({ y: 4, velY: -1 });
    entry = makeEntry(enemy);
    playerPos = makePlayerPos(3);

    floatSelectorVerb.onClaim(entry);
    // Transition to float
    floatSelectorVerb.update(0.016, entry, playerPos, makeInputState());
    expect(getFloatSelectorPhase()).toBe('float');
    vi.clearAllMocks(); // clear mocks after setup
  });

  it('playerVelY override is 0 during float (freeze player)', () => {
    const input = makeInputState();
    floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(getFloatSelectorPlayerVelY()).toBe(0);
  });

  it('kills enemy vel.y during float', () => {
    enemy.vel.y = 5;
    const input = makeInputState();
    floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(enemy.vel.y).toBe(0);
  });

  it('drifts enemy XZ toward player via exponential lerp', () => {
    enemy.pos.x = 3;
    enemy.pos.z = 3;
    playerPos.x = 0;
    playerPos.z = 0;
    const input = makeInputState();

    floatSelectorVerb.update(0.016, entry, playerPos, input);

    // Enemy should have moved toward player
    expect(enemy.pos.x).toBeLessThan(3);
    expect(enemy.pos.z).toBeLessThan(3);
  });

  it('tap LMB (press + release before threshold) transfers to spike', () => {
    // Frame 1: LMB pressed (attack edge trigger)
    const inputPress = makeInputState({ attack: true, attackHeld: true });
    floatSelectorVerb.update(0.016, entry, playerPos, inputPress);

    // Frame 2: LMB released before hold threshold (16ms << 180ms)
    const inputRelease = makeInputState({ attack: false, attackHeld: false });
    const result = floatSelectorVerb.update(0.016, entry, playerPos, inputRelease);

    expect(result).toBe('complete');
    expect(transferClaim).toHaveBeenCalledWith(enemy, 'spike');
  });

  it('hold LMB past threshold transfers to dunk', () => {
    // Frame 1: LMB pressed
    const inputPress = makeInputState({ attack: true, attackHeld: true });
    floatSelectorVerb.update(0.016, entry, playerPos, inputPress);

    // Simulate frames of holding — accumulate past holdThreshold (180ms)
    const framesNeeded = Math.ceil(FLOAT_SELECTOR.holdThreshold / 16) + 1;
    let result: 'active' | 'complete' | 'cancel' = 'active';
    for (let i = 0; i < framesNeeded; i++) {
      const inputHeld = makeInputState({ attack: false, attackHeld: true });
      result = floatSelectorVerb.update(0.016, entry, playerPos, inputHeld);
      if (result !== 'active') break;
    }

    expect(result).toBe('complete');
    expect(transferClaim).toHaveBeenCalledWith(enemy, 'dunk');
  });

  it('float timer expiring with no input cancels', () => {
    // Burn through float duration with no LMB input
    const totalFrames = Math.ceil(DUNK.floatDuration / 16) + 2;
    let result: 'active' | 'complete' | 'cancel' = 'active';
    for (let i = 0; i < totalFrames; i++) {
      const input = makeInputState();
      result = floatSelectorVerb.update(0.016, entry, playerPos, input);
      if (result !== 'active') break;
    }

    expect(result).toBe('cancel');
  });

  it('syncs enemy mesh position during float', () => {
    enemy.pos.x = 2;
    enemy.pos.z = 2;
    const input = makeInputState();
    floatSelectorVerb.update(0.016, entry, playerPos, input);
    expect(enemy.mesh.position.copy).toHaveBeenCalled();
  });
});

// --------------- Cancel / Complete / Reset Tests ---------------

describe('Float Selector Cancel + Reset', () => {
  beforeEach(() => {
    resetFloatSelector();
    vi.clearAllMocks();
  });

  it('onCancel resets gravity override', () => {
    const enemy = makeEnemy();
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    floatSelectorVerb.onCancel(entry);
    expect(setGravityOverride).toHaveBeenCalledWith(enemy, 1);
  });

  it('onCancel resets phase to none', () => {
    const enemy = makeEnemy();
    const entry = makeEntry(enemy);
    floatSelectorVerb.onClaim(entry);
    floatSelectorVerb.onCancel(entry);
    expect(getFloatSelectorPhase()).toBe('none');
    expect(isFloatSelectorActive()).toBe(false);
  });

  it('resetFloatSelector clears all state', () => {
    const enemy = makeEnemy({ y: 4, velY: -1 });
    const entry = makeEntry(enemy);
    const playerPos = makePlayerPos(3);
    floatSelectorVerb.onClaim(entry);
    floatSelectorVerb.update(0.016, entry, playerPos, makeInputState());

    resetFloatSelector();

    expect(getFloatSelectorPhase()).toBe('none');
    expect(isFloatSelectorActive()).toBe(false);
    expect(getFloatSelectorLandingPos()).toBeNull();
    expect(getFloatSelectorPlayerVelY()).toBeNull();
  });
});

// --------------- Config Tests ---------------

describe('Float Selector Config', () => {
  it('holdThreshold is positive', () => {
    expect(FLOAT_SELECTOR.holdThreshold).toBeGreaterThan(0);
  });

  it('holdThreshold is less than floatDuration', () => {
    expect(FLOAT_SELECTOR.holdThreshold).toBeLessThan(DUNK.floatDuration);
  });
});
