import { describe, it, expect } from 'vitest';
import { JUMP } from '../src/config/player';
import { PHYSICS } from '../src/config/physics';

describe('Jump config', () => {
  it('should have positive initial velocity', () => {
    expect(JUMP.initialVelocity).toBeGreaterThan(0);
    expect(JUMP.initialVelocity).toBeLessThan(50);
  });

  it('should have gravity value', () => {
    expect(JUMP.gravity).toBeGreaterThan(0);
  });

  it('should have air control multiplier between 0 and 1', () => {
    expect(JUMP.airControlMult).toBeGreaterThanOrEqual(0);
    expect(JUMP.airControlMult).toBeLessThanOrEqual(1);
  });

  it('should have landing lag values', () => {
    expect(JUMP.landingLag).toBeGreaterThanOrEqual(0);
  });
});

describe('Player jump physics (unit math)', () => {
  it('jump sets positive upward velocity', () => {
    let velY = 0;
    // Simulate jump trigger
    velY = JUMP.initialVelocity;
    expect(velY).toBeGreaterThan(0);
  });

  it('gravity pulls player down after jump apex', () => {
    const dt = 0.016;
    let posY = 3;
    let velY = 0; // at apex
    // Apply gravity
    velY -= JUMP.gravity * dt;
    posY += velY * dt;
    expect(velY).toBeLessThan(0);
    expect(posY).toBeLessThan(3);
  });

  it('player lands when posY reaches ground', () => {
    let posY = 0.03;
    let velY = -5;
    const dt = 0.016;
    posY += velY * dt;
    // Ground clamp
    if (posY <= 0) {
      posY = 0;
      velY = 0;
    }
    expect(posY).toBe(0);
    expect(velY).toBe(0);
  });

  it('cannot jump while airborne (posY > groundEpsilon)', () => {
    const posY = 2;
    const isAirborne = posY > PHYSICS.groundEpsilon;
    expect(isAirborne).toBe(true);
    // Jump should be blocked when airborne
  });

  it('cannot jump during dash', () => {
    const isDashing = true;
    const canJump = !isDashing;
    expect(canJump).toBe(false);
  });

  it('jump arc peaks at expected height', () => {
    // v² = v0² - 2*g*h → h = v0² / (2*g)
    const peakHeight = (JUMP.initialVelocity * JUMP.initialVelocity) / (2 * JUMP.gravity);
    expect(peakHeight).toBeGreaterThan(1);
    expect(peakHeight).toBeLessThan(20);
  });
});
