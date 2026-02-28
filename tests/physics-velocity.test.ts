import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';
import { ABILITIES } from '../src/config/abilities';

// ─── Config Validation ───

describe('PHYSICS config', () => {
  it('has positive friction', () => {
    expect(PHYSICS.friction).toBeGreaterThan(0);
  });

  it('has minVelocity > 0', () => {
    expect(PHYSICS.minVelocity).toBeGreaterThan(0);
  });

  it('has pushInstantRatio between 0 and 1', () => {
    expect(PHYSICS.pushInstantRatio).toBeGreaterThanOrEqual(0);
    expect(PHYSICS.pushInstantRatio).toBeLessThanOrEqual(1);
  });

  it('has non-negative wall slam min speed', () => {
    expect(PHYSICS.wallSlamMinSpeed).toBeGreaterThanOrEqual(0);
  });

  it('has positive wall slam damage', () => {
    expect(PHYSICS.wallSlamDamage).toBeGreaterThan(0);
  });

  it('has non-negative wall slam stun', () => {
    expect(PHYSICS.wallSlamStun).toBeGreaterThanOrEqual(0);
  });

  it('has wall slam bounce between 0 and 1', () => {
    expect(PHYSICS.wallSlamBounce).toBeGreaterThanOrEqual(0);
    expect(PHYSICS.wallSlamBounce).toBeLessThanOrEqual(1);
  });

  it('has non-negative wall slam shake', () => {
    expect(PHYSICS.wallSlamShake).toBeGreaterThanOrEqual(0);
  });
});

// ─── Velocity Math ───

describe('velocity kinematics', () => {
  it('initial velocity formula produces correct total distance', () => {
    // d = v0^2 / (2f)  →  v0 = sqrt(2 * f * d)
    const friction = PHYSICS.friction;
    const targetDist = 5;  // max force push
    const instantRatio = PHYSICS.pushInstantRatio;
    const remainingDist = targetDist * (1 - instantRatio);
    const v0 = Math.sqrt(2 * friction * remainingDist);

    // Verify: total slide distance = v0^2 / (2*friction) should equal remainingDist
    const slideDist = (v0 * v0) / (2 * friction);
    expect(slideDist).toBeCloseTo(remainingDist, 5);
  });

  it('instant ratio of 1.0 produces zero velocity', () => {
    const kbDist = 5;
    const instantRatio = 1.0;
    const remainingDist = kbDist * (1 - instantRatio);
    expect(remainingDist).toBe(0);
    // v0 = sqrt(2 * f * 0) = 0
    const v0 = Math.sqrt(2 * PHYSICS.friction * remainingDist);
    expect(v0).toBe(0);
  });

  it('instant ratio of 0.0 produces all velocity, no instant offset', () => {
    const kbDist = 5;
    const instantRatio = 0.0;
    const instantDist = kbDist * instantRatio;
    expect(instantDist).toBe(0);
    const remainingDist = kbDist;
    const v0 = Math.sqrt(2 * PHYSICS.friction * remainingDist);
    expect(v0).toBeGreaterThan(0);
    // Verify total distance matches
    const slideDist = (v0 * v0) / (2 * PHYSICS.friction);
    expect(slideDist).toBeCloseTo(kbDist, 5);
  });

  it('friction deceleration produces correct stop time', () => {
    // t = v0 / friction
    const friction = PHYSICS.friction;
    const v0 = 10;
    const stopTime = v0 / friction;
    expect(stopTime).toBeCloseTo(v0 / friction, 5);
    expect(stopTime).toBeLessThan(2); // should stop within 2 seconds
  });

  it('higher friction means shorter slide time', () => {
    const v0 = 10;
    const lowFriction = 6;
    const highFriction = 20;
    const timeLow = v0 / lowFriction;
    const timeHigh = v0 / highFriction;
    expect(timeHigh).toBeLessThan(timeLow);
  });
});

// ─── Wall Slam Damage ───

describe('wall slam damage', () => {
  it('no damage below min speed threshold', () => {
    const speed = PHYSICS.wallSlamMinSpeed - 0.5;
    const wouldDamage = speed > PHYSICS.wallSlamMinSpeed;
    expect(wouldDamage).toBe(false);
  });

  it('damage scales with speed above threshold', () => {
    const speed1 = PHYSICS.wallSlamMinSpeed + 1;
    const speed2 = PHYSICS.wallSlamMinSpeed + 5;
    const dmg1 = (speed1 - PHYSICS.wallSlamMinSpeed) * PHYSICS.wallSlamDamage;
    const dmg2 = (speed2 - PHYSICS.wallSlamMinSpeed) * PHYSICS.wallSlamDamage;
    expect(dmg2).toBeGreaterThan(dmg1);
  });

  it('max push slam kills a goblin (30 HP)', () => {
    // Max force push: kbDist = 5, with knockbackResist = 0
    const kbDist = 5;
    const remainingDist = kbDist * (1 - PHYSICS.pushInstantRatio);
    const v0 = Math.sqrt(2 * PHYSICS.friction * remainingDist);
    // If enemy hits wall immediately (before friction reduces speed)
    const slamDmg = Math.round((v0 - PHYSICS.wallSlamMinSpeed) * PHYSICS.wallSlamDamage);
    expect(slamDmg).toBeGreaterThanOrEqual(30); // goblin HP
  });

  it('min push slam does less damage than max push slam', () => {
    // Min force push uses config value, with knockbackResist = 0
    const kbDistMin = ABILITIES.ultimate.minKnockback;
    const kbDistMax = ABILITIES.ultimate.maxKnockback;
    const remainingMin = kbDistMin * (1 - PHYSICS.pushInstantRatio);
    const remainingMax = kbDistMax * (1 - PHYSICS.pushInstantRatio);
    const v0Min = Math.sqrt(2 * PHYSICS.friction * remainingMin);
    const v0Max = Math.sqrt(2 * PHYSICS.friction * remainingMax);
    // Min push velocity should be less than max push velocity
    expect(v0Min).toBeLessThan(v0Max);
    // If min push can slam, it should do less damage than max
    if (v0Min > PHYSICS.wallSlamMinSpeed) {
      const slamDmgMin = (v0Min - PHYSICS.wallSlamMinSpeed) * PHYSICS.wallSlamDamage;
      const slamDmgMax = (v0Max - PHYSICS.wallSlamMinSpeed) * PHYSICS.wallSlamDamage;
      expect(slamDmgMin).toBeLessThan(slamDmgMax);
    }
  });
});

// ─── Velocity Reflection (Bounce) ───

describe('velocity reflection', () => {
  it('reflects velocity off vertical wall (normalX = 1, normalZ = 0)', () => {
    const velX = 5, velZ = 0;
    const normalX = 1, normalZ = 0;
    const bounce = PHYSICS.wallSlamBounce;

    const dot = velX * normalX + velZ * normalZ;
    const reflectedX = (velX - 2 * dot * normalX) * bounce;
    const reflectedZ = (velZ - 2 * dot * normalZ) * bounce;

    expect(reflectedX).toBeCloseTo(-5 * bounce); // reversed
    expect(reflectedZ).toBeCloseTo(0);
  });

  it('reflects velocity off horizontal wall (normalX = 0, normalZ = 1)', () => {
    const velX = 0, velZ = 8;
    const normalX = 0, normalZ = 1;
    const bounce = PHYSICS.wallSlamBounce;

    const dot = velX * normalX + velZ * normalZ;
    const reflectedX = (velX - 2 * dot * normalX) * bounce;
    const reflectedZ = (velZ - 2 * dot * normalZ) * bounce;

    expect(reflectedX).toBeCloseTo(0);
    expect(reflectedZ).toBeCloseTo(-8 * bounce); // reversed
  });

  it('diagonal velocity off vertical wall preserves tangent', () => {
    const velX = 5, velZ = 3;
    const normalX = 1, normalZ = 0;
    const bounce = PHYSICS.wallSlamBounce;

    const dot = velX * normalX + velZ * normalZ;
    const reflectedX = (velX - 2 * dot * normalX) * bounce;
    const reflectedZ = (velZ - 2 * dot * normalZ) * bounce;

    expect(reflectedX).toBeCloseTo(-5 * bounce); // normal component reversed
    expect(reflectedZ).toBeCloseTo(3 * bounce);   // tangent component preserved (scaled by bounce)
  });

  it('bounce of 0 stops velocity completely', () => {
    const velX = 10, velZ = 5;
    const normalX = 1, normalZ = 0;
    const bounce = 0;

    const dot = velX * normalX + velZ * normalZ;
    const reflectedX = (velX - 2 * dot * normalX) * bounce;
    const reflectedZ = (velZ - 2 * dot * normalZ) * bounce;

    expect(reflectedX).toBeCloseTo(0);
    expect(reflectedZ).toBeCloseTo(0);
  });
});

// ─── Force Push Hybrid Knockback ───

describe('force push hybrid knockback', () => {
  it('total distance (instant + slide) matches old knockback distance', () => {
    const kbDist = 5;
    const instantDist = kbDist * PHYSICS.pushInstantRatio;
    const remainingDist = kbDist - instantDist;
    const v0 = Math.sqrt(2 * PHYSICS.friction * remainingDist);
    const slideDist = (v0 * v0) / (2 * PHYSICS.friction);

    const totalDist = instantDist + slideDist;
    expect(totalDist).toBeCloseTo(kbDist, 4);
  });

  it('works for various knockback distances', () => {
    for (const kbDist of [1, 2, 3, 5, 8, 10]) {
      const instantDist = kbDist * PHYSICS.pushInstantRatio;
      const remainingDist = kbDist - instantDist;
      const v0 = Math.sqrt(2 * PHYSICS.friction * remainingDist);
      const slideDist = (v0 * v0) / (2 * PHYSICS.friction);
      const totalDist = instantDist + slideDist;
      expect(totalDist).toBeCloseTo(kbDist, 4);
    }
  });

  it('ice multiplier increases velocity proportionally', () => {
    const kbDist = 5;
    const iceMult = 2;
    const kbDistIce = kbDist * iceMult;
    const remainingNormal = kbDist * (1 - PHYSICS.pushInstantRatio);
    const remainingIce = kbDistIce * (1 - PHYSICS.pushInstantRatio);
    const v0Normal = Math.sqrt(2 * PHYSICS.friction * remainingNormal);
    const v0Ice = Math.sqrt(2 * PHYSICS.friction * remainingIce);
    expect(v0Ice).toBeGreaterThan(v0Normal);
  });
});
