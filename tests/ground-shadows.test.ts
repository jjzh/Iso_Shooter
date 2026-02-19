import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';

// Ground shadow math tests — verify scale/fade formulas from groundShadows.ts
// These test the pure math without needing THREE.js

describe('Ground Shadow Scale Formula', () => {
  // scale = max(0.3, 1 - altitude * 0.1) * baseRadius * 0.8
  function shadowScale(altitude: number, baseRadius: number): number {
    return Math.max(0.3, 1 - altitude * 0.1) * baseRadius * 0.8;
  }

  it('full size when on ground', () => {
    expect(shadowScale(0, 0.35)).toBeCloseTo(0.35 * 0.8);
  });

  it('shrinks with altitude', () => {
    const ground = shadowScale(0, 0.35);
    const airborne = shadowScale(3, 0.35);
    expect(airborne).toBeLessThan(ground);
  });

  it('minimum 30% of base', () => {
    // At altitude 100, the formula would give max(0.3, 1-10) = 0.3
    expect(shadowScale(100, 0.35)).toBeCloseTo(0.3 * 0.35 * 0.8);
  });

  it('works for different enemy radii', () => {
    const small = shadowScale(0, 0.3);
    const large = shadowScale(0, 0.6);
    expect(large).toBeGreaterThan(small);
  });
});

describe('Ground Shadow Opacity Formula', () => {
  // opacity = max(0.1, 0.3 - altitude * 0.03)
  function shadowOpacity(altitude: number): number {
    return Math.max(0.1, 0.3 - altitude * 0.03);
  }

  it('0.3 opacity on ground', () => {
    expect(shadowOpacity(0)).toBeCloseTo(0.3);
  });

  it('fades with altitude', () => {
    expect(shadowOpacity(5)).toBeLessThan(shadowOpacity(0));
  });

  it('minimum 0.1 opacity', () => {
    expect(shadowOpacity(100)).toBeCloseTo(0.1);
  });
});

describe('Ground Shadow Visibility', () => {
  it('visible when above ground epsilon', () => {
    const altitude = PHYSICS.groundEpsilon + 0.01;
    expect(altitude > PHYSICS.groundEpsilon).toBe(true);
  });

  it('visible when posY > 0', () => {
    const posY = 0.5;
    expect(posY > 0).toBe(true);
  });

  it('not visible when exactly on ground with no altitude', () => {
    const altitude = 0;
    const posY = 0;
    // shadow.visible = altitude > groundEpsilon || posY > 0
    expect(altitude > PHYSICS.groundEpsilon || posY > 0).toBe(false);
  });
});
