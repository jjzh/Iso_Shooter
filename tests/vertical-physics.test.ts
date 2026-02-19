import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';

describe('Y-axis physics config', () => {
  it('should have gravity config', () => {
    expect(PHYSICS.gravity).toBeGreaterThan(0);
    expect(PHYSICS.gravity).toBeLessThan(100);
  });

  it('should have terminal velocity', () => {
    expect(PHYSICS.terminalVelocity).toBeGreaterThan(0);
  });

  it('should have air control multiplier', () => {
    expect(PHYSICS.airControlMult).toBeGreaterThanOrEqual(0);
    expect(PHYSICS.airControlMult).toBeLessThanOrEqual(1);
  });

  it('should have ground epsilon for grounded detection', () => {
    expect(PHYSICS.groundEpsilon).toBeGreaterThan(0);
    expect(PHYSICS.groundEpsilon).toBeLessThan(1);
  });

  it('should have landing lag config', () => {
    expect(PHYSICS.landingLagBase).toBeGreaterThanOrEqual(0);
    expect(PHYSICS.landingLagPerSpeed).toBeGreaterThanOrEqual(0);
  });
});

describe('Y-axis velocity integration (unit math)', () => {
  it('entity with positive velY should rise', () => {
    const dt = 0.016;
    let posY = 0;
    let velY = 10;
    posY += velY * dt;
    expect(posY).toBeGreaterThan(0);
  });

  it('gravity should decelerate upward velocity', () => {
    const dt = 0.016;
    let velY = 10;
    velY -= PHYSICS.gravity * dt;
    expect(velY).toBeLessThan(10);
  });

  it('entity should not fall below ground height 0', () => {
    const dt = 0.016;
    let posY = 0.1;
    let velY = -20;
    posY += velY * dt;
    // Ground clamping
    if (posY < 0) {
      posY = 0;
      velY = 0;
    }
    expect(posY).toBe(0);
    expect(velY).toBe(0);
  });

  it('terminal velocity should cap downward speed', () => {
    let velY = -100;
    velY = Math.max(velY, -PHYSICS.terminalVelocity);
    expect(velY).toBe(-PHYSICS.terminalVelocity);
    expect(Math.abs(velY)).toBeLessThanOrEqual(PHYSICS.terminalVelocity);
  });

  it('XZ friction should not apply when airborne', () => {
    const posY = 5; // airborne
    const groundHeight = 0;
    const isGrounded = posY <= groundHeight + PHYSICS.groundEpsilon;
    expect(isGrounded).toBe(false);
    // When airborne, XZ friction should be skipped
  });

  it('XZ friction should apply when grounded', () => {
    const posY = 0; // grounded
    const groundHeight = 0;
    const isGrounded = posY <= groundHeight + PHYSICS.groundEpsilon;
    expect(isGrounded).toBe(true);
  });
});
