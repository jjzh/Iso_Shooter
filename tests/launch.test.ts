import { describe, it, expect } from 'vitest';
import { LAUNCH, JUMP } from '../src/config/player';

describe('Launch Verb Config', () => {
  it('has positive range', () => {
    expect(LAUNCH.range).toBeGreaterThan(0);
  });

  it('has positive launch velocity', () => {
    expect(LAUNCH.launchVelocity).toBeGreaterThan(0);
  });

  it('has positive cooldown', () => {
    expect(LAUNCH.cooldown).toBeGreaterThan(0);
  });

  it('launch velocity is greater than jump to give enemy more air time', () => {
    expect(LAUNCH.launchVelocity).toBeGreaterThan(JUMP.initialVelocity);
  });

  it('self-jump velocity allows player to follow', () => {
    expect(LAUNCH.selfJumpVelocity).toBeGreaterThan(0);
    // Player self-jump should be lower than enemy launch so player arrives after
    expect(LAUNCH.selfJumpVelocity).toBeLessThan(LAUNCH.launchVelocity);
  });

  it('chip damage is positive but lower than melee', () => {
    expect(LAUNCH.damage).toBeGreaterThan(0);
    expect(LAUNCH.damage).toBeLessThan(25); // melee does 10-25
  });
});

describe('Launch Physics Math', () => {
  it('enemy reaches expected peak height', () => {
    // Peak height = v^2 / (2g)
    const peakHeight = (LAUNCH.launchVelocity * LAUNCH.launchVelocity) / (2 * 25); // enemy gravity = 25
    expect(peakHeight).toBeGreaterThan(2); // should go high enough for aerial combos
  });

  it('player reaches lower peak than enemy', () => {
    const enemyPeak = (LAUNCH.launchVelocity ** 2) / (2 * 25);
    const playerPeak = (LAUNCH.selfJumpVelocity ** 2) / (2 * JUMP.gravity);
    expect(playerPeak).toBeLessThan(enemyPeak);
  });

  it('enemy airtime allows for follow-up attacks', () => {
    // Time to reach peak: t = v / g
    const timeToPeak = LAUNCH.launchVelocity / 25;
    // Total airtime: 2 * timeToPeak (symmetric parabola)
    const totalAirtime = 2 * timeToPeak;
    expect(totalAirtime).toBeGreaterThan(0.5); // at least 0.5s in the air
  });
});
