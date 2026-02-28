import { describe, it, expect } from 'vitest';
import { ENEMY_TYPES } from '../src/config/enemies';
import { isInsideVisionCone, VISION_CONE_CONFIG } from '../src/engine/visionCone';

describe('assassin config', () => {
  it('goblin has aggroRadius', () => {
    expect(ENEMY_TYPES.goblin.aggroRadius).toBe(8);
  });

  it('goblin has patrol config', () => {
    const patrol = ENEMY_TYPES.goblin.patrol!;
    expect(patrol.distance).toBe(6);
    expect(patrol.speed).toBeGreaterThan(0);
    expect(patrol.pauseMin).toBeLessThan(patrol.pauseMax);
  });
});

describe('isInsideVisionCone', () => {
  const radius = 8;

  it('returns true for target directly in front (enemy faces -Z at rotY=0)', () => {
    expect(isInsideVisionCone(0, 0, 0, 0, -5, radius)).toBe(true);
  });

  it('returns false for target behind enemy', () => {
    expect(isInsideVisionCone(0, 0, 0, 0, 5, radius)).toBe(false);
  });

  it('returns false for target outside radius', () => {
    expect(isInsideVisionCone(0, 0, 0, 0, -20, radius)).toBe(false);
  });

  it('returns false for target outside cone angle', () => {
    expect(isInsideVisionCone(0, 0, 0, 8, 0, radius)).toBe(false);
  });

  it('returns true for target within cone angle', () => {
    // Use half of the half-angle to be safely inside the cone
    const angle = VISION_CONE_CONFIG.angle / 4;
    const tx = Math.sin(angle) * 5;
    const tz = -Math.cos(angle) * 5;
    expect(isInsideVisionCone(0, 0, 0, tx, tz, radius)).toBe(true);
  });

  it('respects enemy rotation', () => {
    expect(isInsideVisionCone(0, 0, -Math.PI / 2, 5, 0, radius)).toBe(true);
    expect(isInsideVisionCone(0, 0, -Math.PI / 2, -5, 0, radius)).toBe(false);
  });
});
