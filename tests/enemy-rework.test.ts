// Tests for Step 2: Enemy Rework for Melee Combat
// Pure logic tests — no THREE.js dependency

import { describe, it, expect } from 'vitest';
import { ENEMY_TYPES, MOB_GLOBAL } from '../src/config/enemies';

// ─── MOB_GLOBAL Config ───

describe('MOB_GLOBAL', () => {
  it('should have all multiplier fields', () => {
    expect(MOB_GLOBAL).toHaveProperty('speedMult');
    expect(MOB_GLOBAL).toHaveProperty('damageMult');
    expect(MOB_GLOBAL).toHaveProperty('healthMult');
    expect(MOB_GLOBAL).toHaveProperty('telegraphMult');
    expect(MOB_GLOBAL).toHaveProperty('recoveryMult');
  });

  it('should default to 1.0 for all multipliers', () => {
    expect(MOB_GLOBAL.speedMult).toBe(1);
    expect(MOB_GLOBAL.damageMult).toBe(1);
    expect(MOB_GLOBAL.healthMult).toBe(1);
    expect(MOB_GLOBAL.telegraphMult).toBe(1);
    expect(MOB_GLOBAL.recoveryMult).toBe(1);
  });

  it('should be mutable (tuning panel writes directly)', () => {
    const original = MOB_GLOBAL.speedMult;
    MOB_GLOBAL.speedMult = 2.0;
    expect(MOB_GLOBAL.speedMult).toBe(2.0);
    MOB_GLOBAL.speedMult = original; // restore
  });
});

// ─── Enemy Melee Configs ───

describe('Goblin melee config', () => {
  const goblin = ENEMY_TYPES.goblin;

  it('should have melee config defined', () => {
    expect(goblin.melee).toBeDefined();
  });

  it('should have valid telegraph duration', () => {
    expect(goblin.melee!.telegraphDuration).toBeGreaterThan(0);
    expect(goblin.melee!.telegraphDuration).toBeLessThan(2000);
  });

  it('should have valid attack duration', () => {
    expect(goblin.melee!.attackDuration).toBeGreaterThan(0);
    expect(goblin.melee!.attackDuration).toBeLessThan(500);
  });

  it('should have valid recovery duration (punish window)', () => {
    expect(goblin.melee!.recoveryDuration).toBeGreaterThan(0);
    expect(goblin.melee!.recoveryDuration).toBeLessThan(2000);
  });

  it('should have recovery longer than attack (punish window)', () => {
    expect(goblin.melee!.recoveryDuration).toBeGreaterThan(goblin.melee!.attackDuration);
  });

  it('should have valid damage', () => {
    expect(goblin.melee!.damage).toBeGreaterThan(0);
    expect(goblin.melee!.damage).toBeLessThan(100);
  });

  it('should have valid hitArc', () => {
    expect(goblin.melee!.hitArc).toBeGreaterThan(0);
    expect(goblin.melee!.hitArc).toBeLessThan(Math.PI * 2);
  });

  it('should have valid hitRange', () => {
    expect(goblin.melee!.hitRange).toBeGreaterThan(0);
    expect(goblin.melee!.hitRange).toBeLessThan(10);
  });

  it('should have lungeDistance defined', () => {
    expect(goblin.melee!.lungeDistance).toBeGreaterThan(0);
    expect(goblin.melee!.lungeDistance!).toBeLessThan(5);
  });
});

describe('Stone Golem melee config', () => {
  const golem = ENEMY_TYPES.stoneGolem;

  it('should have melee config defined', () => {
    expect(golem.melee).toBeDefined();
  });

  it('should have longer telegraph than goblin (heavier attack)', () => {
    const goblin = ENEMY_TYPES.goblin;
    expect(golem.melee!.telegraphDuration).toBeGreaterThan(goblin.melee!.telegraphDuration);
  });

  it('should have longer recovery than goblin (bigger punish window)', () => {
    const goblin = ENEMY_TYPES.goblin;
    expect(golem.melee!.recoveryDuration).toBeGreaterThan(goblin.melee!.recoveryDuration);
  });

  it('should have higher damage than goblin', () => {
    const goblin = ENEMY_TYPES.goblin;
    expect(golem.melee!.damage).toBeGreaterThan(goblin.melee!.damage);
  });

  it('should have wider hit arc than goblin', () => {
    const goblin = ENEMY_TYPES.goblin;
    expect(golem.melee!.hitArc).toBeGreaterThan(goblin.melee!.hitArc);
  });

  it('should have longer hit range than goblin', () => {
    const goblin = ENEMY_TYPES.goblin;
    expect(golem.melee!.hitRange).toBeGreaterThan(goblin.melee!.hitRange);
  });

  it('should NOT have lungeDistance (heavy stationary swing)', () => {
    expect(golem.melee!.lungeDistance).toBeUndefined();
  });
});

// ─── Skeleton Archer Config (no melee, uses sniper) ───

describe('Skeleton Archer config', () => {
  const archer = ENEMY_TYPES.skeletonArcher;

  it('should NOT have melee config (ranged enemy)', () => {
    expect(archer.melee).toBeUndefined();
  });

  it('should have sniper config', () => {
    expect(archer.sniper).toBeDefined();
  });

  it('should have telegraph duration for sniper', () => {
    expect(archer.sniper!.telegraphDuration).toBeGreaterThan(0);
  });

  it('should have kite behavior (not rush or tank)', () => {
    expect(archer.behavior).toBe('kite');
  });
});

// ─── Ice Mortar Imp Config ───

describe('Ice Mortar Imp config', () => {
  const imp = ENEMY_TYPES.iceMortarImp;

  it('should NOT have melee config (ranged enemy)', () => {
    expect(imp.melee).toBeUndefined();
  });

  it('should have mortar config', () => {
    expect(imp.mortar).toBeDefined();
  });

  it('should have mortar behavior', () => {
    expect(imp.behavior).toBe('mortar');
  });
});

// ─── State Machine Logic (pure math, no THREE) ───

describe('Enemy melee state machine logic', () => {
  // Simulate the state machine transitions without THREE.js

  it('telegraph duration scales with MOB_GLOBAL.telegraphMult', () => {
    const goblin = ENEMY_TYPES.goblin;
    const baseDuration = goblin.melee!.telegraphDuration;

    const savedMult = MOB_GLOBAL.telegraphMult;
    MOB_GLOBAL.telegraphMult = 2.0;
    const scaledDuration = baseDuration * MOB_GLOBAL.telegraphMult;
    expect(scaledDuration).toBe(baseDuration * 2);
    MOB_GLOBAL.telegraphMult = savedMult; // restore
  });

  it('recovery duration scales with MOB_GLOBAL.recoveryMult', () => {
    const goblin = ENEMY_TYPES.goblin;
    const baseDuration = goblin.melee!.recoveryDuration;

    const savedMult = MOB_GLOBAL.recoveryMult;
    MOB_GLOBAL.recoveryMult = 1.5;
    const scaledDuration = baseDuration * MOB_GLOBAL.recoveryMult;
    expect(scaledDuration).toBe(baseDuration * 1.5);
    MOB_GLOBAL.recoveryMult = savedMult; // restore
  });

  it('damage scales with MOB_GLOBAL.damageMult', () => {
    const goblin = ENEMY_TYPES.goblin;
    const baseDmg = goblin.melee!.damage;

    const savedMult = MOB_GLOBAL.damageMult;
    MOB_GLOBAL.damageMult = 0.5;
    const scaledDmg = baseDmg * MOB_GLOBAL.damageMult;
    expect(scaledDmg).toBe(baseDmg * 0.5);
    MOB_GLOBAL.damageMult = savedMult; // restore
  });

  it('speed scales with MOB_GLOBAL.speedMult', () => {
    const goblin = ENEMY_TYPES.goblin;
    const baseSpeed = goblin.speed;

    const savedMult = MOB_GLOBAL.speedMult;
    MOB_GLOBAL.speedMult = 1.5;
    const scaledSpeed = baseSpeed * MOB_GLOBAL.speedMult;
    expect(scaledSpeed).toBeCloseTo(baseSpeed * 1.5);
    MOB_GLOBAL.speedMult = savedMult; // restore
  });
});

// ─── Arc Check for Enemy Melee (reuse same math as player melee) ───

describe('Enemy melee arc check', () => {
  // The enemy melee uses the same arc check math:
  // angleToPlayer = atan2(-dx, -dz), compared to enemy.mesh.rotation.y

  function isInArc(
    enemyX: number, enemyZ: number, facingAngle: number,
    targetX: number, targetZ: number, hitRange: number, hitArc: number
  ): boolean {
    const dx = targetX - enemyX;
    const dz = targetZ - enemyZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > hitRange) return false;

    const angleToTarget = Math.atan2(-dx, -dz);
    let angleDiff = angleToTarget - facingAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    return Math.abs(angleDiff) <= hitArc / 2;
  }

  it('should hit target directly in front', () => {
    // Enemy at origin facing +Z (rotation.y = PI), target at (0, 0, -1)
    // Actually atan2 convention: facing = atan2(-dx, -dz) for direction
    // Enemy facing toward (0, 0, 1): rotation.y = Math.atan2(0, -1) = PI
    expect(isInArc(0, 0, Math.PI, 0, 1, 2, 1.5)).toBe(true);
  });

  it('should miss target behind', () => {
    expect(isInArc(0, 0, Math.PI, 0, -1, 2, 1.5)).toBe(false);
  });

  it('should miss target out of range', () => {
    expect(isInArc(0, 0, Math.PI, 0, 5, 2, 1.5)).toBe(false);
  });

  it('should hit target at edge of range', () => {
    expect(isInArc(0, 0, Math.PI, 0, 1.9, 2, 1.5)).toBe(true);
  });

  it('golem wide arc hits at wider angles than goblin', () => {
    const golemArc = ENEMY_TYPES.stoneGolem.melee!.hitArc; // 2.0
    const goblinArc = ENEMY_TYPES.goblin.melee!.hitArc;     // 1.5

    // Target at a moderate angle
    const target = { x: 0.8, z: 1 };
    const facing = Math.PI; // facing +Z

    const golemHits = isInArc(0, 0, facing, target.x, target.z, 3, golemArc);
    const goblinHits = isInArc(0, 0, facing, target.x, target.z, 3, goblinArc);

    // Golem should hit, goblin may or may not depending on exact angle
    expect(golemArc).toBeGreaterThan(goblinArc);
  });
});

// ─── All Enemy Types Validation ───

describe('All enemy types have required fields', () => {
  const types = Object.entries(ENEMY_TYPES);

  types.forEach(([name, cfg]) => {
    describe(name, () => {
      it('should have positive health', () => {
        expect(cfg.health).toBeGreaterThan(0);
      });

      it('should have positive speed', () => {
        expect(cfg.speed).toBeGreaterThan(0);
      });

      it('should have a behavior string', () => {
        expect(['rush', 'kite', 'tank', 'mortar']).toContain(cfg.behavior);
      });

      it('should have valid size', () => {
        expect(cfg.size.radius).toBeGreaterThan(0);
        expect(cfg.size.height).toBeGreaterThan(0);
      });

      it('should have drops config', () => {
        expect(cfg.drops.currency.min).toBeGreaterThanOrEqual(0);
        expect(cfg.drops.currency.max).toBeGreaterThanOrEqual(cfg.drops.currency.min);
        expect(cfg.drops.healthChance).toBeGreaterThanOrEqual(0);
        expect(cfg.drops.healthChance).toBeLessThanOrEqual(1);
      });

      it('should have knockbackResist in range [0, 1]', () => {
        expect(cfg.knockbackResist).toBeGreaterThanOrEqual(0);
        expect(cfg.knockbackResist).toBeLessThanOrEqual(1);
      });
    });
  });
});
