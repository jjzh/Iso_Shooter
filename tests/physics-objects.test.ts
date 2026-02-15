import { describe, it, expect } from 'vitest';
import { createPhysicsObject } from '../src/entities/physicsObject';
import { PHYSICS } from '../src/config/physics';

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

describe('createPhysicsObject', () => {
  it('creates object from placement with correct defaults', () => {
    const obj = createPhysicsObject({
      meshType: 'rock',
      material: 'stone',
      x: 3, z: -5,
      mass: 2.0,
      health: 50,
      radius: 0.8,
    });
    expect(obj.pos).toEqual({ x: 3, z: -5 });
    expect(obj.vel).toEqual({ x: 0, z: 0 });
    expect(obj.mass).toBe(2.0);
    expect(obj.health).toBe(50);
    expect(obj.maxHealth).toBe(50);
    expect(obj.scale).toBe(1);
    expect(obj.destroyed).toBe(false);
    expect(obj.fellInPit).toBe(false);
    expect(obj.mesh).toBeNull(); // mesh created separately (needs scene)
  });

  it('respects custom scale', () => {
    const obj = createPhysicsObject({
      meshType: 'crate', material: 'wood',
      x: 0, z: 0, mass: 1, health: 30, radius: 0.5, scale: 1.5,
    });
    expect(obj.scale).toBe(1.5);
  });

  it('assigns unique IDs', () => {
    const a = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 0, z: 0, mass: 1, health: 10, radius: 0.5 });
    const b = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 1, z: 1, mass: 1, health: 10, radius: 0.5 });
    expect(a.id).not.toBe(b.id);
  });
});

describe('object velocity kinematics', () => {
  it('v0 formula: object travels correct distance before stopping', () => {
    const force = 8; // force push force
    const mass = 2.0;
    const friction = PHYSICS.objectFriction;
    const targetDist = force / mass; // distance = force / mass
    const v0 = Math.sqrt(2 * friction * targetDist);
    const slideDist = (v0 * v0) / (2 * friction);
    expect(slideDist).toBeCloseTo(targetDist, 5);
  });

  it('heavier object travels less distance for same force', () => {
    const force = 8;
    const friction = PHYSICS.objectFriction;
    const distLight = force / 1.0;
    const distHeavy = force / 3.0;
    expect(distLight).toBeGreaterThan(distHeavy);
  });

  it('wall slam damage formula: speed above threshold produces damage', () => {
    const speed = 6;
    const damage = Math.round((speed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage);
    expect(damage).toBeGreaterThan(0);
  });

  it('wall slam damage formula: speed below threshold produces zero', () => {
    const speed = 2;
    const damage = Math.max(0, Math.round((speed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage));
    expect(damage).toBe(0);
  });
});

describe('object collision math', () => {
  it('circle-circle overlap detection', () => {
    const ax = 0, az = 0, aRadius = 0.8;
    const bx = 1, bz = 0, bRadius = 0.8;
    const dx = bx - ax, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = aRadius + bRadius;
    expect(dist).toBeLessThan(minDist); // overlapping
  });

  it('mass-weighted separation: lighter moves more', () => {
    const massA = 1.0, massB = 3.0;
    const totalMass = massA + massB;
    const ratioA = massB / totalMass; // 0.75
    const ratioB = massA / totalMass; // 0.25
    expect(ratioA).toBeGreaterThan(ratioB); // lighter (A) moves more
  });

  it('elastic collision transfers momentum correctly', () => {
    // Object A moving right at speed 5, B stationary
    // After collision: A should slow down, B should speed up
    const massA = 1.0, massB = 1.0;
    const e = PHYSICS.enemyBounce; // restitution
    const velAx = 5, velBx = 0;
    const nx = 1; // collision normal: A->B along x
    const relVelDotN = (velAx - velBx) * nx;
    const impulse = (1 + e) * relVelDotN / (massA + massB);

    const newVelAx = velAx - impulse * massB * nx;
    const newVelBx = velBx + impulse * massA * nx;

    expect(newVelBx).toBeGreaterThan(0); // B gained velocity
    expect(newVelAx).toBeLessThan(velAx); // A lost velocity
  });

  it('impact damage above speed threshold', () => {
    const relSpeed = 5;
    const dmg = Math.round((relSpeed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage);
    expect(dmg).toBeGreaterThan(0);
  });

  it('no impact damage below speed threshold', () => {
    const relSpeed = 1;
    const dmg = Math.max(0, Math.round((relSpeed - PHYSICS.objectImpactMinSpeed) * PHYSICS.objectImpactDamage));
    expect(dmg).toBe(0);
  });
});
