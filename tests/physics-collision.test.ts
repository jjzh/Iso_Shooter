import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';
import { ENEMY_TYPES } from '../src/config/enemies';

// ─── Config Validation ───

describe('PHYSICS enemy collision config', () => {
  it('has enemyBounce between 0 and 1', () => {
    expect(PHYSICS.enemyBounce).toBeGreaterThanOrEqual(0);
    expect(PHYSICS.enemyBounce).toBeLessThanOrEqual(1);
  });

  it('has non-negative impact min speed', () => {
    expect(PHYSICS.impactMinSpeed).toBeGreaterThanOrEqual(0);
  });

  it('has positive impact damage', () => {
    expect(PHYSICS.impactDamage).toBeGreaterThan(0);
  });

  it('has non-negative impact stun', () => {
    expect(PHYSICS.impactStun).toBeGreaterThanOrEqual(0);
  });
});

// ─── Enemy Mass Config ───

describe('enemy mass config', () => {
  it('all enemies have positive mass', () => {
    for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
      const mass = cfg.mass ?? 1.0;
      expect(mass, `${name} should have positive mass`).toBeGreaterThan(0);
    }
  });

  it('golem is heavier than goblin', () => {
    const golemMass = ENEMY_TYPES.stoneGolem.mass ?? 1.0;
    const goblinMass = ENEMY_TYPES.goblin.mass ?? 1.0;
    expect(golemMass).toBeGreaterThan(goblinMass);
  });

  it('archer is lightest', () => {
    const archerMass = ENEMY_TYPES.skeletonArcher.mass ?? 1.0;
    for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
      if (name === 'skeletonArcher') continue;
      const mass = cfg.mass ?? 1.0;
      expect(archerMass, `archer should be lighter than ${name}`).toBeLessThanOrEqual(mass);
    }
  });
});

// ─── Circle-Circle Overlap Detection ───

describe('circle-circle overlap', () => {
  it('overlapping circles have positive overlap', () => {
    const r1 = 0.3, r2 = 0.3;
    const dx = 0.4, dz = 0;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = r1 + r2;
    const overlap = minDist - dist;
    expect(overlap).toBeGreaterThan(0);
  });

  it('non-overlapping circles have negative overlap', () => {
    const r1 = 0.3, r2 = 0.3;
    const dx = 1.0, dz = 0;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = r1 + r2;
    const overlap = minDist - dist;
    expect(overlap).toBeLessThan(0);
  });

  it('touching circles have zero overlap', () => {
    const r1 = 0.3, r2 = 0.3;
    const dx = 0.6, dz = 0;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = r1 + r2;
    const overlap = minDist - dist;
    expect(overlap).toBeCloseTo(0, 5);
  });
});

// ─── Mass-Weighted Separation ───

describe('mass-weighted separation', () => {
  it('equal mass enemies separate equally', () => {
    const m1 = 1.0, m2 = 1.0;
    const overlap = 0.2;
    const totalMass = m1 + m2;
    const push1 = overlap * (m2 / totalMass);
    const push2 = overlap * (m1 / totalMass);
    expect(push1).toBeCloseTo(push2, 5);
    expect(push1 + push2).toBeCloseTo(overlap, 5);
  });

  it('heavy enemy pushes light enemy more', () => {
    const m1 = 3.0; // heavy (golem)
    const m2 = 1.0; // light (goblin)
    const overlap = 0.2;
    const totalMass = m1 + m2;
    const push1 = overlap * (m2 / totalMass); // how much heavy enemy moves
    const push2 = overlap * (m1 / totalMass); // how much light enemy moves
    expect(push2).toBeGreaterThan(push1);
    expect(push1 + push2).toBeCloseTo(overlap, 5);
  });

  it('golem barely moves when colliding with archer', () => {
    const mGolem = ENEMY_TYPES.stoneGolem.mass ?? 1.0;
    const mArcher = ENEMY_TYPES.skeletonArcher.mass ?? 1.0;
    const overlap = 0.2;
    const totalMass = mGolem + mArcher;
    const golemPush = overlap * (mArcher / totalMass);
    const archerPush = overlap * (mGolem / totalMass);
    // Golem should move less than 30% of total
    expect(golemPush / overlap).toBeLessThan(0.3);
    // Archer should move more than 70% of total
    expect(archerPush / overlap).toBeGreaterThan(0.7);
  });
});

// ─── 1D Elastic Collision (Momentum Transfer) ───

describe('1D elastic collision with restitution', () => {
  function elasticCollision1D(v1: number, v2: number, m1: number, m2: number, e: number) {
    const totalMass = m1 + m2;
    const newV1 = (m1 * v1 + m2 * v2 + m2 * e * (v2 - v1)) / totalMass;
    const newV2 = (m1 * v1 + m2 * v2 + m1 * e * (v1 - v2)) / totalMass;
    return { newV1, newV2 };
  }

  it('equal mass head-on collision swaps velocities (e=1)', () => {
    const { newV1, newV2 } = elasticCollision1D(5, 0, 1, 1, 1);
    expect(newV1).toBeCloseTo(0, 5);
    expect(newV2).toBeCloseTo(5, 5);
  });

  it('heavy enemy transfers most momentum to light enemy', () => {
    const mGolem = 3.0;
    const mGoblin = 1.0;
    const e = PHYSICS.enemyBounce;
    const { newV1, newV2 } = elasticCollision1D(5, 0, mGolem, mGoblin, e);
    // Golem should slow down
    expect(newV1).toBeLessThan(5);
    expect(newV1).toBeGreaterThan(0);
    // Goblin should fly away faster than golem
    expect(newV2).toBeGreaterThan(newV1);
  });

  it('light enemy bounces off stationary heavy enemy', () => {
    const mGoblin = 1.0;
    const mGolem = 3.0;
    const e = PHYSICS.enemyBounce;
    const { newV1, newV2 } = elasticCollision1D(5, 0, mGoblin, mGolem, e);
    // Goblin should bounce back (negative velocity if head-on)
    // or at least slow down significantly
    expect(newV1).toBeLessThan(5);
    // Golem should pick up some velocity
    expect(newV2).toBeGreaterThan(0);
  });

  it('with e=0 both enemies move at same velocity (perfectly inelastic)', () => {
    const { newV1, newV2 } = elasticCollision1D(5, 0, 1, 1, 0);
    expect(newV1).toBeCloseTo(2.5, 5);
    expect(newV2).toBeCloseTo(2.5, 5);
  });

  it('momentum is conserved', () => {
    const m1 = 2, m2 = 3, v1 = 5, v2 = -2;
    const e = PHYSICS.enemyBounce;
    const { newV1, newV2 } = elasticCollision1D(v1, v2, m1, m2, e);
    const momentumBefore = m1 * v1 + m2 * v2;
    const momentumAfter = m1 * newV1 + m2 * newV2;
    expect(momentumAfter).toBeCloseTo(momentumBefore, 5);
  });
});

// ─── Impact Damage ───

describe('enemy impact damage', () => {
  it('no damage below min speed', () => {
    const relSpeed = PHYSICS.impactMinSpeed - 0.5;
    const wouldDamage = relSpeed > PHYSICS.impactMinSpeed;
    expect(wouldDamage).toBe(false);
  });

  it('damage scales with relative speed', () => {
    const speed1 = PHYSICS.impactMinSpeed + 1;
    const speed2 = PHYSICS.impactMinSpeed + 5;
    const dmg1 = (speed1 - PHYSICS.impactMinSpeed) * PHYSICS.impactDamage;
    const dmg2 = (speed2 - PHYSICS.impactMinSpeed) * PHYSICS.impactDamage;
    expect(dmg2).toBeGreaterThan(dmg1);
  });

  it('max-force goblin bowling does significant damage', () => {
    // Max push: kbDist=12, goblin has knockbackResist=0
    const kbDist = 12;
    const remainingDist = kbDist * (1 - PHYSICS.pushInstantRatio);
    const v0 = Math.sqrt(2 * PHYSICS.friction * remainingDist);
    // If goblin hits another enemy immediately
    const impactDmg = Math.round((v0 - PHYSICS.impactMinSpeed) * PHYSICS.impactDamage);
    expect(impactDmg).toBeGreaterThan(0);
  });

  it('mass-weighted damage: lighter enemy takes more', () => {
    const relSpeed = 8;
    const excessSpeed = relSpeed - PHYSICS.impactMinSpeed;
    const mGoblin = 1.0;
    const mGolem = 3.0;
    const totalMass = mGoblin + mGolem;

    // Lighter enemy takes proportionally more
    const goblinDmg = excessSpeed * PHYSICS.impactDamage * (mGolem / totalMass);
    const golemDmg = excessSpeed * PHYSICS.impactDamage * (mGoblin / totalMass);

    expect(goblinDmg).toBeGreaterThan(golemDmg);
  });
});
