import { describe, it, expect } from 'vitest';
import { BENDS, getBendById } from '../src/config/bends';
import { createBendSystem } from '../src/engine/bendSystem';

describe('Bend config', () => {
  it('should have 2 bends (enlarge + shrink)', () => {
    expect(BENDS.length).toBe(2);
  });

  it('should have enlarge and shrink', () => {
    expect(getBendById('enlarge')).toBeDefined();
    expect(getBendById('shrink')).toBeDefined();
  });

  it('enlarge should be size/positive', () => {
    const bend = getBendById('enlarge')!;
    expect(bend.property).toBe('size');
    expect(bend.pole).toBe('positive');
  });

  it('shrink should be size/negative', () => {
    const bend = getBendById('shrink')!;
    expect(bend.property).toBe('size');
    expect(bend.pole).toBe('negative');
  });
});

describe('Bend system', () => {
  it('should start with max bends remaining', () => {
    const sys = createBendSystem(3);
    expect(sys.bendsRemaining()).toBe(3);
  });

  it('should apply a bend to a target', () => {
    const sys = createBendSystem(3);
    const target = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    const result = sys.applyBend('enlarge', 'physicsObject', target);
    expect(result.success).toBe(true);
    expect(sys.bendsRemaining()).toBe(2);
    expect(target.scale).toBe(2.5);
    expect(target.mass).toBe(4);
    expect(target.radius).toBeCloseTo(1.2);
  });

  it('should prevent opposite pole on same target', () => {
    const sys = createBendSystem(3);
    const target = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    sys.applyBend('enlarge', 'physicsObject', target);
    const result = sys.applyBend('shrink', 'physicsObject', target);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('opposite_pole');
  });

  it('should enforce max bends', () => {
    const sys = createBendSystem(1);
    const t1 = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    sys.applyBend('enlarge', 'physicsObject', t1);
    const t2 = { id: 2, scale: 1, mass: 2, radius: 0.6 };
    const result = sys.applyBend('shrink', 'physicsObject', t2);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_bends_remaining');
  });

  it('should reset all bends and restore original values', () => {
    const sys = createBendSystem(3);
    const target = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    sys.applyBend('enlarge', 'physicsObject', target);
    expect(target.scale).toBe(2.5);
    sys.resetAll();
    expect(target.scale).toBe(1);
    expect(target.mass).toBe(2);
    expect(target.radius).toBe(0.6);
    expect(sys.bendsRemaining()).toBe(3);
  });

  it('should prevent same bend applied twice to same target', () => {
    const sys = createBendSystem(3);
    const target = { id: 1, scale: 1, mass: 2, radius: 0.6 };
    sys.applyBend('enlarge', 'physicsObject', target);
    const result = sys.applyBend('enlarge', 'physicsObject', target);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_applied');
  });
});
