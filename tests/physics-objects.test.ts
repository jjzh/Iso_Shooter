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
