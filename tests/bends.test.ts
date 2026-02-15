import { describe, it, expect } from 'vitest';
import { BENDS, getBendById } from '../src/config/bends';
import { createBendSystem } from '../src/engine/bendSystem';

describe('bend config', () => {
  it('has exactly 2 bends (enlarge + shrink)', () => {
    expect(BENDS).toHaveLength(2);
  });

  it('enlarge scales up', () => {
    const enlarge = getBendById('enlarge');
    expect(enlarge).toBeDefined();
    expect(enlarge!.property).toBe('size');
    expect(enlarge!.pole).toBe('positive');
    const scaleFx = enlarge!.effects.find(e => e.param === 'scale');
    expect(scaleFx).toBeDefined();
    expect(scaleFx!.value).toBeGreaterThan(1);
  });

  it('shrink scales down', () => {
    const shrink = getBendById('shrink');
    expect(shrink).toBeDefined();
    expect(shrink!.property).toBe('size');
    expect(shrink!.pole).toBe('negative');
    const scaleFx = shrink!.effects.find(e => e.param === 'scale');
    expect(scaleFx).toBeDefined();
    expect(scaleFx!.value).toBeLessThan(1);
  });

  it('bends have opposite poles on same property', () => {
    const enlarge = getBendById('enlarge')!;
    const shrink = getBendById('shrink')!;
    expect(enlarge.property).toBe(shrink.property);
    expect(enlarge.pole).not.toBe(shrink.pole);
  });
});

describe('bend system', () => {
  function makeObj(overrides: any = {}) {
    return {
      id: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 0.8,
      mass: 2.0,
      health: 50,
      maxHealth: 50,
      material: 'stone' as const,
      meshType: 'rock' as const,
      scale: 1,
      restitution: undefined,
      mesh: null,
      destroyed: false,
      fellInPit: false,
      ...overrides,
    };
  }

  it('applies enlarge — scale, mass, radius multiply', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    const result = sys.applyBend('enlarge', 'physicsObject', obj);
    expect(result.success).toBe(true);
    expect(obj.scale).toBeCloseTo(2.5);
    expect(obj.mass).toBeCloseTo(4.0);
    expect(obj.radius).toBeCloseTo(1.6);
  });

  it('applies shrink — scale, mass, radius multiply', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('shrink', 'physicsObject', obj);
    expect(obj.scale).toBeCloseTo(0.3);
    expect(obj.mass).toBeCloseTo(0.6);
    expect(obj.radius).toBeCloseTo(0.24);
  });

  it('tracks active bends', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    expect(sys.getActiveBends()).toHaveLength(1);
    expect(sys.getActiveBends()[0].bendId).toBe('enlarge');
  });

  it('decrements remaining count', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    expect(sys.bendsRemaining()).toBe(3);
    sys.applyBend('enlarge', 'physicsObject', obj);
    expect(sys.bendsRemaining()).toBe(2);
  });

  it('rejects when no bends remaining', () => {
    const sys = createBendSystem(1);
    const obj1 = makeObj({ id: 1 });
    const obj2 = makeObj({ id: 2 });
    sys.applyBend('enlarge', 'physicsObject', obj1);
    const result = sys.applyBend('shrink', 'physicsObject', obj2);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_bends_remaining');
  });

  it('rejects opposite pole on same target', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    const result = sys.applyBend('shrink', 'physicsObject', obj);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('opposite_pole');
  });

  it('same bend on same target is no-op (no charge consumed)', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    const result = sys.applyBend('enlarge', 'physicsObject', obj);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_applied');
    expect(sys.bendsRemaining()).toBe(2);
  });

  it('resets all bends and restores original values', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    expect(obj.scale).toBeCloseTo(2.5);
    sys.resetAll();
    expect(obj.scale).toBeCloseTo(1);
    expect(obj.mass).toBeCloseTo(2.0);
    expect(obj.radius).toBeCloseTo(0.8);
    expect(sys.bendsRemaining()).toBe(3);
    expect(sys.getActiveBends()).toHaveLength(0);
  });
});
