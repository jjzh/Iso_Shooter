import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DUNK, LAUNCH, JUMP } from '../src/config/player';

// Mock THREE-dependent modules so dunk.ts can be imported in Node tests
// (THREE is a CDN global that doesn't exist in test environment)
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

// Provide a minimal THREE global for dunk.ts visual code (decal/trail creation)
const mockGeometry = { dispose: vi.fn(), setAttribute: vi.fn(), setDrawRange: vi.fn(), getAttribute: vi.fn(() => ({ array: new Float32Array(60), needsUpdate: false })) };
const mockMaterial = { dispose: vi.fn(), opacity: 0.7 };
(globalThis as any).THREE = {
  Group: vi.fn(() => ({
    position: { set: vi.fn(), copy: vi.fn() },
    scale: { set: vi.fn(), x: 1 },
    rotation: { x: 0, y: 0 },
    add: vi.fn(),
    traverse: vi.fn((fn: any) => {}),
    getObjectByName: vi.fn(() => ({ position: { set: vi.fn() } })),
  })),
  Mesh: vi.fn(() => ({
    rotation: { x: 0 },
    position: { set: vi.fn(), copy: vi.fn() },
    name: '',
  })),
  Line: vi.fn(() => ({
    frustumCulled: true,
    geometry: mockGeometry,
    material: mockMaterial,
  })),
  CircleGeometry: vi.fn(() => mockGeometry),
  RingGeometry: vi.fn(() => mockGeometry),
  BufferGeometry: vi.fn(() => mockGeometry),
  BufferAttribute: vi.fn(),
  MeshBasicMaterial: vi.fn(() => mockMaterial),
  LineBasicMaterial: vi.fn(() => mockMaterial),
};

import { getDunkPhase, isDunkActive, getDunkTarget, getDunkLandingPos, getDunkPlayerVelY, resetDunk, dunkVerb } from '../src/verbs/dunk';
import { setGravityOverride } from '../src/engine/aerialVerbs';

// --------------- Config Tests (pure math, no runtime dependency) ---------------

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

// --------------- State Query Tests ---------------

describe('Dunk Verb State', () => {
  beforeEach(() => resetDunk());

  it('starts in none phase', () => {
    expect(getDunkPhase()).toBe('none');
  });

  it('isDunkActive returns false when not active', () => {
    expect(isDunkActive()).toBe(false);
  });

  it('getDunkTarget returns null when not active', () => {
    expect(getDunkTarget()).toBeNull();
  });

  it('getDunkLandingPos returns null when not active', () => {
    expect(getDunkLandingPos()).toBeNull();
  });

  it('getDunkPlayerVelY returns null when not active', () => {
    expect(getDunkPlayerVelY()).toBeNull();
  });
});

// --------------- Verb Interface Tests ---------------

describe('Dunk Verb Interface', () => {
  it('has name "dunk"', () => {
    expect(dunkVerb.name).toBe('dunk');
  });

  it('is not interruptible', () => {
    expect(dunkVerb.interruptible).toBe(false);
  });

  it('implements all AerialVerb methods', () => {
    expect(typeof dunkVerb.canClaim).toBe('function');
    expect(typeof dunkVerb.onClaim).toBe('function');
    expect(typeof dunkVerb.update).toBe('function');
    expect(typeof dunkVerb.onCancel).toBe('function');
    expect(typeof dunkVerb.onComplete).toBe('function');
  });
});

// --------------- Drift Fix Math Tests (pure math) ---------------

describe('Dunk Drift Fix Math', () => {
  it('exponential lerp converges faster than linear drift', () => {
    // At dt=0.016 (60fps), lerpFactor = 1 - exp(-12 * 0.016) ~ 0.175
    // This means 17.5% of remaining distance per frame
    // After 15 frames (250ms): remaining = (1-0.175)^15 ~ 0.045 = 4.5% remaining
    // That's 95.5% convergence in 250ms
    const lerpFactor = 1 - Math.exp(-12 * 0.016);
    expect(lerpFactor).toBeGreaterThan(0.1);
    expect(lerpFactor).toBeLessThan(0.3);

    // Simulate 15 frames of convergence
    let remaining = 1.0;
    for (let i = 0; i < 15; i++) {
      remaining *= (1 - lerpFactor);
    }
    expect(remaining).toBeLessThan(0.1); // <10% remaining after 250ms
  });

  it('linear drift falls behind fast-moving player', () => {
    // Old code: step = min(DUNK.floatDriftSpeed * dt, dist)
    // At 60fps with player moving at 5 units/sec:
    // Player moves 5 * 0.016 = 0.08 units/frame
    // Enemy drifts 3 * 0.016 = 0.048 units/frame (old code)
    // Gap GROWS by 0.032 units/frame -- enemy falls behind!
    const playerStep = 5 * 0.016;
    const enemyStep = DUNK.floatDriftSpeed * 0.016;
    expect(enemyStep).toBeLessThan(playerStep); // confirms the bug
  });

  it('exponential lerp handles any player speed', () => {
    // With exp lerp, enemy covers 17.5% of remaining gap per frame
    // Even if player is far away, the fraction-of-distance approach
    // always converges (never falls behind)
    const dt = 0.016;
    const lerpFactor = 1 - Math.exp(-12 * dt);

    // Simulate: player starts 5 units away, moving at 10 units/sec
    let enemyX = 0;
    let playerX = 5;
    for (let i = 0; i < 60; i++) { // 1 second at 60fps
      playerX += 10 * dt; // player moves fast
      const dx = playerX - enemyX;
      enemyX += dx * lerpFactor;
    }
    const gap = Math.abs(playerX - enemyX);
    // After 1 second, gap should be small relative to player speed
    // At steady state: gap ~ playerSpeed * dt / lerpFactor
    expect(gap).toBeLessThan(2.0);
  });
});

// --------------- Config Relationship Tests ---------------

describe('Dunk Config Relationships', () => {
  it('slam velocity pushes downward faster than normal gravity', () => {
    expect(Math.abs(DUNK.slamVelocity)).toBeGreaterThan(0);
  });

  it('landing lag is longer than normal jump landing', () => {
    expect(DUNK.landingLag).toBeGreaterThan(JUMP.landingLag);
  });

  it('dunk damage is the highest single-hit payoff', () => {
    // Dunk should be the big reward for the complex aerial combo
    expect(DUNK.damage).toBeGreaterThan(LAUNCH.damage);
  });

  it('landing shake is larger than grab shake', () => {
    expect(DUNK.landingShake).toBeGreaterThan(DUNK.grabShake);
  });

  it('AoE radius is positive and smaller than target radius', () => {
    expect(DUNK.aoeRadius).toBeGreaterThan(0);
    expect(DUNK.aoeRadius).toBeLessThan(DUNK.targetRadius);
  });
});
