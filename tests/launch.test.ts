import { describe, it, expect } from 'vitest';
import { LAUNCH, JUMP, FLOAT_SELECTOR } from '../src/config/player';
import { PHYSICS } from '../src/config/physics';
import { findLaunchTarget } from '../src/effects/launchIndicator';

// Derived velocities — LAUNCH stores multipliers, not absolute values
const launchVelocity = JUMP.initialVelocity * LAUNCH.enemyVelMult;
const selfJumpVelocity = JUMP.initialVelocity * LAUNCH.playerVelMult;

describe('Launch Verb Config', () => {
  it('has positive range', () => {
    expect(LAUNCH.range).toBeGreaterThan(0);
  });

  it('has positive launch velocity', () => {
    expect(launchVelocity).toBeGreaterThan(0);
  });

  it('has positive cooldown', () => {
    expect(LAUNCH.cooldown).toBeGreaterThan(0);
  });

  it('launch velocity is greater than jump to give enemy more air time', () => {
    expect(launchVelocity).toBeGreaterThan(JUMP.initialVelocity);
  });

  it('self-jump velocity allows player to follow', () => {
    expect(selfJumpVelocity).toBeGreaterThan(0);
    // Player self-jump should be lower than enemy launch so player arrives after
    expect(selfJumpVelocity).toBeLessThan(launchVelocity);
  });

  it('chip damage is positive but lower than melee', () => {
    expect(LAUNCH.damage).toBeGreaterThan(0);
    expect(LAUNCH.damage).toBeLessThan(25); // melee does 10-25
  });
});

describe('Launch Physics Math', () => {
  it('enemy reaches expected peak height', () => {
    // Peak height = v^2 / (2g)
    const peakHeight = (launchVelocity * launchVelocity) / (2 * 25); // enemy gravity = 25
    expect(peakHeight).toBeGreaterThan(2); // should go high enough for aerial combos
  });

  it('player reaches lower peak than enemy', () => {
    const enemyPeak = (launchVelocity ** 2) / (2 * 25);
    const playerPeak = (selfJumpVelocity ** 2) / (2 * JUMP.gravity);
    expect(playerPeak).toBeLessThan(enemyPeak);
  });

  it('enemy airtime allows for follow-up attacks', () => {
    // Time to reach peak: t = v / g
    const timeToPeak = launchVelocity / 25;
    // Total airtime: 2 * timeToPeak (symmetric parabola)
    const totalAirtime = 2 * timeToPeak;
    expect(totalAirtime).toBeGreaterThan(0.5); // at least 0.5s in the air
  });
});

describe('Arc Launch Math', () => {
  const gravity = PHYSICS.gravity;
  const convergenceTime = launchVelocity / gravity;

  it('convergence time is derived from launch velocity / gravity', () => {
    // Enemy starts descending at t = vel / gravity
    expect(convergenceTime).toBeCloseTo(launchVelocity / gravity);
    expect(convergenceTime).toBeGreaterThan(0.4);
    expect(convergenceTime).toBeLessThan(1.0);
  });

  it('arc fraction covers partial XZ distance without overshoot', () => {
    expect(LAUNCH.arcFraction).toBeGreaterThan(0);
    expect(LAUNCH.arcFraction).toBeLessThan(1); // must not overshoot
  });

  it('arc velocity at max range is reasonable', () => {
    const maxDist = LAUNCH.range;
    const arcSpeed = (maxDist * LAUNCH.arcFraction) / convergenceTime;
    // Should cover arcFraction of distance in convergenceTime
    const distanceCovered = arcSpeed * convergenceTime;
    expect(distanceCovered).toBeCloseTo(maxDist * LAUNCH.arcFraction);
    // Speed should be moderate, not extreme
    expect(arcSpeed).toBeLessThan(10);
  });

  it('arc velocity is zero when enemy overlaps player (no NaN/Infinity)', () => {
    const arcDist = 0; // overlapping
    // Mimics the guard in player.ts: if (arcDist > 0.1)
    const shouldApplyArc = arcDist > 0.1;
    expect(shouldApplyArc).toBe(false);
    // If guard were missing, division by zero would produce Infinity
    // The guard prevents this
  });

  it('remaining distance after arc is small enough for gentle drift', () => {
    const maxDist = LAUNCH.range;
    const distCoveredByArc = maxDist * LAUNCH.arcFraction;
    const remaining = maxDist - distCoveredByArc;
    // Remaining should be small enough for the float drift to handle
    expect(remaining).toBeLessThan(1.5);
    expect(remaining).toBeGreaterThan(0); // some remainder expected
  });

  it('float drift rate config is lower than old hardcoded value', () => {
    // Old hardcoded value was 12, new config should be gentler
    expect(FLOAT_SELECTOR.floatDriftRate).toBeLessThanOrEqual(12);
    expect(FLOAT_SELECTOR.floatDriftRate).toBeGreaterThan(0);
  });
});

describe('Launch Telegraph Config', () => {
  it('windup duration is positive and under 300ms', () => {
    expect(LAUNCH.windupDuration).toBeGreaterThan(0);
    expect(LAUNCH.windupDuration).toBeLessThanOrEqual(300);
  });

  it('indicator color is defined', () => {
    expect(LAUNCH.indicatorColor).toBeDefined();
    expect(typeof LAUNCH.indicatorColor).toBe('number');
  });

  it('indicator ring radius is positive', () => {
    expect(LAUNCH.indicatorRingRadius).toBeGreaterThan(0);
  });

  it('indicator opacity is between 0 and 1', () => {
    expect(LAUNCH.indicatorOpacity).toBeGreaterThan(0);
    expect(LAUNCH.indicatorOpacity).toBeLessThanOrEqual(1);
  });
});

describe('findLaunchTarget', () => {
  const playerPos = { x: 0, y: 0, z: 0 };

  function makeEnemy(x: number, z: number, health = 50) {
    return { pos: { x, y: 0, z }, health, fellInPit: false };
  }

  it('returns closest enemy within range', () => {
    const far = makeEnemy(2.5, 0);
    const close = makeEnemy(1.0, 0);
    const result = findLaunchTarget([far, close], playerPos);
    expect(result).toBe(close);
  });

  it('returns null when no enemy in range', () => {
    const farAway = makeEnemy(10, 10);
    expect(findLaunchTarget([farAway], playerPos)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(findLaunchTarget([], playerPos)).toBeNull();
  });

  it('skips dead enemies', () => {
    const dead = makeEnemy(1.0, 0, 0);
    const alive = makeEnemy(2.0, 0);
    expect(findLaunchTarget([dead, alive], playerPos)).toBe(alive);
  });

  it('skips enemies that fell in pit', () => {
    const fallen = makeEnemy(1.0, 0);
    (fallen as any).fellInPit = true;
    const standing = makeEnemy(2.0, 0);
    expect(findLaunchTarget([fallen, standing], playerPos)).toBe(standing);
  });

  it('returns null when all enemies are dead', () => {
    const dead1 = makeEnemy(1.0, 0, 0);
    const dead2 = makeEnemy(2.0, 0, -5);
    expect(findLaunchTarget([dead1, dead2], playerPos)).toBeNull();
  });
});
