import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SPIKE } from '../src/config/player';

// Mock THREE-dependent modules
vi.mock('../src/engine/renderer', () => ({
  screenShake: vi.fn(),
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
}));

import {
  spikeVerb,
  getSpikePhase,
  getSpikePlayerVelYOverride,
  getSpikeFastFallActive,
  resetSpike,
} from '../src/verbs/spike';
import { screenShake } from '../src/engine/renderer';
import { spawnDamageNumber } from '../src/ui/damageNumbers';
import { emit } from '../src/engine/events';
import { createCarrier } from '../src/engine/entityCarrier';
import { setGravityOverride } from '../src/engine/aerialVerbs';

// --------------- Helpers ---------------

function makeEnemy() {
  return {
    pos: { x: 0, y: 5, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    health: 50,
    mesh: { position: { set: vi.fn(), copy: vi.fn() } },
    flashTimer: 0,
  } as any;
}

function makeLaunchedEntry(enemy: any) {
  return {
    enemy,
    launchTime: 0,
    claimedBy: 'spike',
    gravityMult: 0,
  } as any;
}

function makePlayerPos(x = 0, y = 5, z = 0) {
  return { x, y, z };
}

function makeInputState(aimX = 5, aimZ = 5) {
  return {
    aimWorldPos: { x: aimX, y: 0, z: aimZ },
  };
}

// --------------- Interface Tests ---------------

describe('Spike Verb Interface', () => {
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

// --------------- State Query Tests ---------------

describe('Spike Verb State', () => {
  beforeEach(() => resetSpike());

  it('starts in none phase', () => {
    expect(getSpikePhase()).toBe('none');
  });

  it('playerVelYOverride is null when not active', () => {
    expect(getSpikePlayerVelYOverride()).toBeNull();
  });

  it('fastFallActive is false when not active', () => {
    expect(getSpikeFastFallActive()).toBe(false);
  });
});

// --------------- State Machine Tests ---------------

describe('Spike State Machine', () => {
  beforeEach(() => {
    resetSpike();
    vi.clearAllMocks();
  });

  it('onClaim sets phase to windup', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    spikeVerb.onClaim(entry);
    expect(getSpikePhase()).toBe('windup');
  });

  it('onClaim sets playerVelYOverride to 0 (hold player in place)', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    spikeVerb.onClaim(entry);
    expect(getSpikePlayerVelYOverride()).toBe(0);
  });

  it('onClaim triggers small screen shake telegraph', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    spikeVerb.onClaim(entry);
    expect(screenShake).toHaveBeenCalled();
  });

  it('windup holds enemy vel.y at 0', () => {
    const enemy = makeEnemy();
    enemy.vel.y = 5;
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);
    spikeVerb.update(0.01, entry, playerPos, inputState); // 10ms, still in windup
    expect(enemy.vel.y).toBe(0);
  });

  it('windup transitions to strike after windupDuration', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    // Advance past windupDuration (80ms)
    const dt = (SPIKE.windupDuration + 1) / 1000; // just past windup
    spikeVerb.update(dt, entry, playerPos, inputState);

    // After strike, should be in recovery (strike is instantaneous)
    expect(getSpikePhase()).toBe('recovery');
  });

  it('strike creates carrier and transitions to recovery', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState(5, 5);

    spikeVerb.onClaim(entry);

    // Advance past windupDuration to trigger strike
    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    expect(createCarrier).toHaveBeenCalledTimes(1);
    expect(getSpikePhase()).toBe('recovery');
  });

  it('recovery completes after hangDuration', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    // Advance past windup to trigger strike -> recovery
    const windupDt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(windupDt, entry, playerPos, inputState);
    expect(getSpikePhase()).toBe('recovery');

    // Advance past hangDuration to complete recovery
    const recoveryDt = (SPIKE.hangDuration + 1) / 1000;
    const result = spikeVerb.update(recoveryDt, entry, playerPos, inputState);
    expect(result).toBe('complete');
  });

  it('recovery returns active before hangDuration expires', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    // Advance past windup to enter recovery
    const windupDt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(windupDt, entry, playerPos, inputState);
    expect(getSpikePhase()).toBe('recovery');

    // Small update, still in recovery
    const result = spikeVerb.update(0.001, entry, playerPos, inputState);
    expect(result).toBe('active');
  });
});

// --------------- Behavior Tests ---------------

describe('Spike Behavior', () => {
  beforeEach(() => {
    resetSpike();
    vi.clearAllMocks();
  });

  it('strike deals SPIKE.damage to enemy', () => {
    const enemy = makeEnemy();
    const initialHealth = enemy.health;
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    // Advance past windup to trigger strike
    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    expect(enemy.health).toBe(initialHealth - SPIKE.damage);
  });

  it('strike sets enemy flashTimer', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    expect(enemy.flashTimer).toBeGreaterThan(0);
  });

  it('strike emits spikeStrike event', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'spikeStrike' }),
    );
  });

  it('strike spawns SPIKE! damage number', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    expect(spawnDamageNumber).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      `SPIKE! ${SPIKE.damage}`,
      expect.any(String),
    );
  });

  it('strike triggers screen shake', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);
    vi.clearAllMocks(); // clear the telegraph shake from onClaim

    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    expect(screenShake).toHaveBeenCalledWith(SPIKE.screenShake);
  });

  it('createCarrier is called with correct config values', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos(0, 5, 0);
    const inputState = makeInputState(5, 5);

    spikeVerb.onClaim(entry);

    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    expect(createCarrier).toHaveBeenCalledWith(
      enemy,
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }),
      expect.objectContaining({
        speed: SPIKE.projectileSpeed,
        throughDamage: SPIKE.throughDamage,
        throughKnockback: SPIKE.throughKnockback,
        impactDamage: SPIKE.impactDamage,
        impactRadius: SPIKE.impactRadius,
        impactKnockback: SPIKE.impactKnockback,
        impactShake: SPIKE.impactShake,
      }),
    );
  });

  it('carrier direction has a downward Y component', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos(0, 5, 0);
    const inputState = makeInputState(5, 0); // aim to the right

    spikeVerb.onClaim(entry);

    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    const directionArg = (createCarrier as any).mock.calls[0][1];
    expect(directionArg.y).toBeLessThan(0); // angled downward
  });

  it('carrier direction horizontal component points toward aim position', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos(0, 5, 0);
    const inputState = makeInputState(10, 0); // aim directly along +X

    spikeVerb.onClaim(entry);

    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);

    const directionArg = (createCarrier as any).mock.calls[0][1];
    expect(directionArg.x).toBeGreaterThan(0); // points toward +X
    expect(Math.abs(directionArg.z)).toBeLessThan(0.01); // no Z component
  });

  it('fast fall is active during recovery', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);
    expect(getSpikeFastFallActive()).toBe(false);

    // Advance to recovery
    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);
    expect(getSpikePhase()).toBe('recovery');
    expect(getSpikeFastFallActive()).toBe(true);
  });

  it('playerVelYOverride is 0 during recovery (hang)', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    // Advance to recovery
    const dt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(dt, entry, playerPos, inputState);
    expect(getSpikePhase()).toBe('recovery');
    expect(getSpikePlayerVelYOverride()).toBe(0);
  });

  it('playerVelYOverride is null after recovery completes', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);
    const playerPos = makePlayerPos();
    const inputState = makeInputState();

    spikeVerb.onClaim(entry);

    // Advance to recovery
    const windupDt = (SPIKE.windupDuration + 1) / 1000;
    spikeVerb.update(windupDt, entry, playerPos, inputState);

    // Advance past recovery
    const recoveryDt = (SPIKE.hangDuration + 1) / 1000;
    spikeVerb.update(recoveryDt, entry, playerPos, inputState);

    expect(getSpikePlayerVelYOverride()).toBeNull();
  });

  it('onCancel resets all state', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);

    spikeVerb.onClaim(entry);
    expect(getSpikePhase()).toBe('windup');

    spikeVerb.onCancel(entry);
    expect(getSpikePhase()).toBe('none');
    expect(getSpikePlayerVelYOverride()).toBeNull();
    expect(getSpikeFastFallActive()).toBe(false);
  });

  it('onComplete resets all state', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);

    spikeVerb.onClaim(entry);

    spikeVerb.onComplete(entry);
    expect(getSpikePhase()).toBe('none');
    expect(getSpikePlayerVelYOverride()).toBeNull();
  });

  it('resetSpike cleans up all state', () => {
    const enemy = makeEnemy();
    const entry = makeLaunchedEntry(enemy);

    spikeVerb.onClaim(entry);
    expect(getSpikePhase()).toBe('windup');

    resetSpike();
    expect(getSpikePhase()).toBe('none');
    expect(getSpikePlayerVelYOverride()).toBeNull();
    expect(getSpikeFastFallActive()).toBe(false);
  });
});

// --------------- Config Tests ---------------

describe('Spike Config', () => {
  it('projectileSpeed is positive', () => {
    expect(SPIKE.projectileSpeed).toBeGreaterThan(0);
  });

  it('projectileAngle is between 0 and 90 degrees', () => {
    expect(SPIKE.projectileAngle).toBeGreaterThan(0);
    expect(SPIKE.projectileAngle).toBeLessThan(90);
  });

  it('impactRadius is positive', () => {
    expect(SPIKE.impactRadius).toBeGreaterThan(0);
  });

  it('windupDuration is positive', () => {
    expect(SPIKE.windupDuration).toBeGreaterThan(0);
  });

  it('hangDuration is positive', () => {
    expect(SPIKE.hangDuration).toBeGreaterThan(0);
  });

  it('damage is positive', () => {
    expect(SPIKE.damage).toBeGreaterThan(0);
  });

  it('fastFallGravityMult is greater than 1', () => {
    expect(SPIKE.fastFallGravityMult).toBeGreaterThan(1);
  });
});
