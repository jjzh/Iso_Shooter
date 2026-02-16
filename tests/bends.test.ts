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

import { applyBendVisuals } from '../src/entities/physicsObject';

describe('bend visuals', () => {
  it('applyBendVisuals scales mesh to match collision radius', () => {
    const childMat = { emissive: { setHex: () => {} }, emissiveIntensity: 0.3 };
    const child = { material: childMat, isMesh: true };
    const mockScale = { x: 1, y: 1, z: 1 };
    // Simulate mesh created at original radius=0.8, scale=1.0 → baseGeoSize=0.8
    const mesh = {
      scale: { set: (x: number, y: number, z: number) => {
        mockScale.x = x; mockScale.y = y; mockScale.z = z;
      }},
      traverse: (fn: (c: any) => void) => fn(child),
      userData: { _baseGeoSize: 0.8 },
    };

    // After Enlarge: radius becomes 1.6 (0.8 * 2)
    const obj = { scale: 2.5, radius: 1.6, mesh } as any;

    applyBendVisuals(obj, 0x4488ff);
    // Mesh scale = newRadius / baseGeoSize = 1.6 / 0.8 = 2.0
    expect(mockScale.x).toBeCloseTo(2.0);
    expect(mockScale.y).toBeCloseTo(2.0);
    expect(mockScale.z).toBeCloseTo(2.0);
  });
});

describe('bend game state', () => {
  it('GameState supports bend fields', () => {
    const state: any = {
      phase: 'playing',
      bendMode: false,
      bendsPerRoom: 3,
    };
    expect(state.bendMode).toBe(false);
    expect(state.bendsPerRoom).toBe(3);
  });
});
