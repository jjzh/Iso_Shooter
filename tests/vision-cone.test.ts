import { describe, it, expect } from 'vitest';
import { ENEMY_TYPES } from '../src/config/enemies';

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
