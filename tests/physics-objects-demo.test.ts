import { describe, it, expect, beforeEach } from 'vitest';
import { createPhysicsObject, resetPhysicsObjectIds } from '../src/entities/physicsObject';

describe('PhysicsObject creation', () => {
  beforeEach(() => {
    resetPhysicsObjectIds();
  });

  it('should create a rock with correct properties', () => {
    const obj = createPhysicsObject({
      meshType: 'rock', material: 'stone',
      x: 1, z: 2, mass: 2.0, health: 50, radius: 0.6,
    });
    expect(obj.pos.x).toBe(1);
    expect(obj.pos.z).toBe(2);
    expect(obj.mass).toBe(2.0);
    expect(obj.radius).toBe(0.6);
    expect(obj.vel.x).toBe(0);
    expect(obj.vel.z).toBe(0);
    expect(obj.destroyed).toBe(false);
    expect(obj.fellInPit).toBe(false);
  });

  it('should create a crate with correct properties', () => {
    const obj = createPhysicsObject({
      meshType: 'crate', material: 'wood',
      x: 3, z: 4, mass: 5.0, health: 80, radius: 0.8,
    });
    expect(obj.meshType).toBe('crate');
    expect(obj.material).toBe('wood');
    expect(obj.mass).toBe(5.0);
  });

  it('should assign unique ids', () => {
    const a = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 0, z: 0, mass: 1, health: 10, radius: 0.5 });
    const b = createPhysicsObject({ meshType: 'crate', material: 'wood', x: 1, z: 1, mass: 2, health: 20, radius: 0.6 });
    expect(a.id).not.toBe(b.id);
  });

  it('should default scale to 1', () => {
    const obj = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 0, z: 0, mass: 1, health: 10, radius: 0.5 });
    expect(obj.scale).toBe(1);
  });

  it('should use provided scale', () => {
    const obj = createPhysicsObject({ meshType: 'rock', material: 'stone', x: 0, z: 0, mass: 1, health: 10, radius: 0.5, scale: 2 });
    expect(obj.scale).toBe(2);
  });
});
