import { describe, it, expect } from 'vitest';
import { BENDS, getBendById } from '../src/config/bends';

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
