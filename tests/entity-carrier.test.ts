import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock THREE-dependent modules before importing carrier
vi.mock('../src/engine/renderer', () => ({
  screenShake: vi.fn(),
  getScene: vi.fn(() => ({ add: vi.fn(), remove: vi.fn() })),
}));

vi.mock('../src/ui/damageNumbers', () => ({
  spawnDamageNumber: vi.fn(),
}));

vi.mock('../src/engine/events', () => ({
  emit: vi.fn(),
}));

vi.mock('../src/config/terrain', () => ({
  getGroundHeight: vi.fn((_x: number, _z: number) => 0),
}));

import {
  createCarrier,
  updateCarriers,
  getActiveCarriers,
  clearCarriers,
} from '../src/engine/entityCarrier';

import { screenShake } from '../src/engine/renderer';
import { spawnDamageNumber } from '../src/ui/damageNumbers';
import { emit } from '../src/engine/events';
import { getGroundHeight } from '../src/config/terrain';

// --------------- Helpers ---------------

function makeEnemy(overrides: Partial<{
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  health: number; fellInPit: boolean;
}> = {}) {
  const x = overrides.x ?? 0;
  const y = overrides.y ?? 5;
  const z = overrides.z ?? 0;
  return {
    pos: { x, y, z },
    vel: { x: overrides.vx ?? 0, y: overrides.vy ?? 0, z: overrides.vz ?? 0 },
    health: overrides.health ?? 50,
    mesh: { position: { set: vi.fn(), copy: vi.fn() } },
    fellInPit: overrides.fellInPit ?? false,
    flashTimer: 0,
  };
}

function makeGameState(enemies: any[] = []) {
  return { enemies };
}

const DEFAULT_CONFIG = {
  speed: 25,
  gravityMult: 1,
  throughDamage: 20,
  throughKnockback: 8,
  impactDamage: 15,
  impactRadius: 2.0,
  impactKnockback: 10,
  impactShake: 2.5,
};

// --------------- Tests ---------------

describe('Entity Carrier — Creation', () => {
  beforeEach(() => {
    clearCarriers();
    vi.clearAllMocks();
  });

  it('createCarrier adds to active list', () => {
    const payload = makeEnemy();
    createCarrier(payload, { x: 1, y: -0.5, z: 0 }, DEFAULT_CONFIG);
    expect(getActiveCarriers()).toHaveLength(1);
  });

  it('createCarrier normalizes direction and scales by speed', () => {
    const payload = makeEnemy({ x: 0, y: 5, z: 0 });
    // Direction (1, 0, 0) normalized is still (1, 0, 0), scaled by speed = 25
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const carriers = getActiveCarriers();
    expect(carriers).toHaveLength(1);
    // Velocity should be direction * speed
    expect(carriers[0].vel.x).toBeCloseTo(25);
    expect(carriers[0].vel.y).toBeCloseTo(0);
    expect(carriers[0].vel.z).toBeCloseTo(0);
  });

  it('createCarrier adds payload to hitSet (immune to own carrier)', () => {
    const payload = makeEnemy();
    createCarrier(payload, { x: 1, y: -0.5, z: 0 }, DEFAULT_CONFIG);
    const carriers = getActiveCarriers();
    expect(carriers[0].hitSet.has(payload)).toBe(true);
  });
});

describe('Entity Carrier — Movement', () => {
  beforeEach(() => {
    clearCarriers();
    vi.clearAllMocks();
    (getGroundHeight as any).mockReturnValue(0);
  });

  it('carrier moves payload along velocity vector', () => {
    const payload = makeEnemy({ x: 0, y: 10, z: 0 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState();

    // One frame at 60fps
    updateCarriers(0.016, gameState);

    // Should move in X direction: 25 * 0.016 = 0.4
    // (y will also change due to gravity, but x movement should be ~0.4)
    expect(payload.pos.x).toBeCloseTo(25 * 0.016, 1);
  });

  it('carrier applies gravity to velocity', () => {
    const payload = makeEnemy({ x: 0, y: 10, z: 0 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState();

    const carriers = getActiveCarriers();
    const initialVelY = carriers[0].vel.y;

    updateCarriers(0.016, gameState);

    // Gravity should pull velocity downward: velY -= GRAVITY * gravityMult * dt
    // GRAVITY = 25, dt = 0.016, so delta = 25 * 1 * 0.016 = 0.4
    expect(carriers[0].vel.y).toBeLessThan(initialVelY);
    expect(carriers[0].vel.y).toBeCloseTo(initialVelY - 25 * 1 * 0.016, 2);
  });

  it('carrier syncs mesh position each frame', () => {
    const payload = makeEnemy({ x: 0, y: 10, z: 0 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState();

    updateCarriers(0.016, gameState);

    expect(payload.mesh.position.set).toHaveBeenCalled();
  });
});

describe('Entity Carrier — Ground Impact', () => {
  beforeEach(() => {
    clearCarriers();
    vi.clearAllMocks();
    (getGroundHeight as any).mockReturnValue(0);
  });

  it('carrier is removed on ground impact (pos.y <= groundY)', () => {
    // Start just above ground with downward velocity — should hit ground in one frame
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    createCarrier(payload, { x: 1, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState();

    updateCarriers(0.1, gameState);

    expect(getActiveCarriers()).toHaveLength(0);
  });

  it('carrier deals AoE impact damage on ground hit', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    // Nearby enemy within impactRadius (2.0) but on the ground (y=0),
    // placed at XZ distance 1.5 — inside AoE but outside through-hit radius
    // since the carrier descends straight down (direction y=-1)
    // and the 3D distance to this enemy is > 1.5 during flight
    const nearbyEnemy = makeEnemy({ x: 1.8, y: 0, z: 0, health: 50 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState([payload, nearbyEnemy]);

    updateCarriers(0.1, gameState);

    // nearby enemy should have taken impact damage only
    expect(nearbyEnemy.health).toBe(50 - DEFAULT_CONFIG.impactDamage);
  });

  it('carrier does NOT deal AoE impact damage to payload itself', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0, health: 50 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState([payload]);

    updateCarriers(0.1, gameState);

    // Payload should NOT have taken AoE damage (it's excluded)
    expect(payload.health).toBe(50);
  });

  it('carrier emits spikeImpact event on ground hit', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState();

    updateCarriers(0.1, gameState);

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'spikeImpact' }));
  });

  it('carrier triggers screen shake on ground impact', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState();

    updateCarriers(0.1, gameState);

    expect(screenShake).toHaveBeenCalledWith(DEFAULT_CONFIG.impactShake);
  });

  it('carrier spawns IMPACT! damage number on ground hit', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState();

    updateCarriers(0.1, gameState);

    expect(spawnDamageNumber).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      'IMPACT!',
      expect.any(String),
    );
  });

  it('payload velocity is zeroed on ground impact', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    createCarrier(payload, { x: 1, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState();

    updateCarriers(0.1, gameState);

    expect(payload.vel.x).toBe(0);
    expect(payload.vel.y).toBe(0);
    expect(payload.vel.z).toBe(0);
  });
});

describe('Entity Carrier — Through-Hits', () => {
  beforeEach(() => {
    clearCarriers();
    vi.clearAllMocks();
    (getGroundHeight as any).mockReturnValue(0);
  });

  it('carrier deals through-damage to enemies in path', () => {
    // Payload at y=5, enemy right next to carrier path
    const payload = makeEnemy({ x: 0, y: 5, z: 0 });
    const targetEnemy = makeEnemy({ x: 0.5, y: 5, z: 0, health: 50 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState([payload, targetEnemy]);

    // Move carrier so it's within hit radius (1.5) of target
    updateCarriers(0.016, gameState);

    expect(targetEnemy.health).toBe(50 - DEFAULT_CONFIG.throughDamage);
  });

  it('carrier does NOT damage the payload enemy during flight', () => {
    const payload = makeEnemy({ x: 0, y: 5, z: 0, health: 50 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState([payload]);

    updateCarriers(0.016, gameState);

    // Payload is in its own hitSet — immune
    expect(payload.health).toBe(50);
  });

  it('through-hit does not stop the carrier', () => {
    const payload = makeEnemy({ x: 0, y: 5, z: 0 });
    const targetEnemy = makeEnemy({ x: 0.5, y: 5, z: 0, health: 50 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState([payload, targetEnemy]);

    updateCarriers(0.016, gameState);

    // Carrier should still be active after through-hit
    expect(getActiveCarriers()).toHaveLength(1);
  });

  it('through-hit applies knockback to hit enemy', () => {
    const payload = makeEnemy({ x: 0, y: 5, z: 0 });
    const targetEnemy = makeEnemy({ x: 1, y: 5, z: 0, health: 50 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState([payload, targetEnemy]);

    updateCarriers(0.016, gameState);

    // Enemy should have received XZ knockback
    // The knockback direction is from carrier to enemy
    expect(targetEnemy.vel.x !== 0 || targetEnemy.vel.z !== 0).toBe(true);
  });

  it('through-hit emits spikeThrough event', () => {
    const payload = makeEnemy({ x: 0, y: 5, z: 0 });
    const targetEnemy = makeEnemy({ x: 0.5, y: 5, z: 0, health: 50 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState([payload, targetEnemy]);

    updateCarriers(0.016, gameState);

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'spikeThrough' }));
  });

  it('through-hit does not hit same enemy twice', () => {
    const payload = makeEnemy({ x: 0, y: 10, z: 0 });
    const targetEnemy = makeEnemy({ x: 0.5, y: 10, z: 0, health: 50 });
    createCarrier(payload, { x: 0, y: 0, z: 0 }, { ...DEFAULT_CONFIG, speed: 0.01 });
    const gameState = makeGameState([payload, targetEnemy]);

    // Two frames — enemy should only be hit once
    updateCarriers(0.016, gameState);
    updateCarriers(0.016, gameState);

    expect(targetEnemy.health).toBe(50 - DEFAULT_CONFIG.throughDamage);
  });

  it('through-hit skips dead enemies', () => {
    const payload = makeEnemy({ x: 0, y: 5, z: 0 });
    const deadEnemy = makeEnemy({ x: 0.5, y: 5, z: 0, health: 0 });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState([payload, deadEnemy]);

    updateCarriers(0.016, gameState);

    // Dead enemy should not be hit
    expect(deadEnemy.health).toBe(0);
  });

  it('through-hit skips pit-fallen enemies', () => {
    const payload = makeEnemy({ x: 0, y: 5, z: 0 });
    const pitEnemy = makeEnemy({ x: 0.5, y: 5, z: 0, health: 50, fellInPit: true });
    createCarrier(payload, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    const gameState = makeGameState([payload, pitEnemy]);

    updateCarriers(0.016, gameState);

    expect(pitEnemy.health).toBe(50);
  });
});

describe('Entity Carrier — clearCarriers', () => {
  beforeEach(() => {
    clearCarriers();
    vi.clearAllMocks();
  });

  it('clearCarriers removes all active carriers', () => {
    const payload1 = makeEnemy({ x: 0, y: 5, z: 0 });
    const payload2 = makeEnemy({ x: 3, y: 5, z: 0 });
    createCarrier(payload1, { x: 1, y: 0, z: 0 }, DEFAULT_CONFIG);
    createCarrier(payload2, { x: -1, y: 0, z: 0 }, DEFAULT_CONFIG);
    expect(getActiveCarriers()).toHaveLength(2);

    clearCarriers();
    expect(getActiveCarriers()).toHaveLength(0);
  });
});

describe('Entity Carrier — AoE Ground Impact Details', () => {
  beforeEach(() => {
    clearCarriers();
    vi.clearAllMocks();
    (getGroundHeight as any).mockReturnValue(0);
  });

  it('AoE impact applies knockback to nearby enemies', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    const nearbyEnemy = makeEnemy({ x: 1, y: 0, z: 0, health: 50 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState([payload, nearbyEnemy]);

    updateCarriers(0.1, gameState);

    // Nearby enemy should have received knockback away from impact
    expect(nearbyEnemy.vel.x).toBeGreaterThan(0); // pushed away in +X direction
  });

  it('AoE impact does not hit enemies beyond impactRadius', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    // Place enemy far outside impactRadius (2.0)
    const farEnemy = makeEnemy({ x: 5, y: 0, z: 0, health: 50 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState([payload, farEnemy]);

    updateCarriers(0.1, gameState);

    expect(farEnemy.health).toBe(50);
  });

  it('AoE impact skips dead enemies', () => {
    const payload = makeEnemy({ x: 0, y: 0.1, z: 0 });
    const deadEnemy = makeEnemy({ x: 1, y: 0, z: 0, health: 0 });
    createCarrier(payload, { x: 0, y: -1, z: 0 }, { ...DEFAULT_CONFIG, speed: 5 });
    const gameState = makeGameState([payload, deadEnemy]);

    updateCarriers(0.1, gameState);

    expect(deadEnemy.health).toBe(0);
  });
});
