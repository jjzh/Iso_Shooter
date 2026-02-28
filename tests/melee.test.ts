import { describe, it, expect } from 'vitest';
import { isInMeleeArc } from '../src/engine/meleemath';
import { MELEE } from '../src/config/player';

// ─── Config Validation ───

describe('MELEE config', () => {
  it('has valid damage', () => {
    expect(MELEE.damage).toBeGreaterThan(0);
    expect(MELEE.damage).toBeLessThanOrEqual(100);
  });

  it('has valid range', () => {
    expect(MELEE.range).toBeGreaterThan(0);
    expect(MELEE.range).toBeLessThanOrEqual(10);
  });

  it('has valid arc in radians', () => {
    expect(MELEE.arc).toBeGreaterThan(0);
    expect(MELEE.arc).toBeLessThanOrEqual(Math.PI * 2);
  });

  it('has valid cooldown', () => {
    expect(MELEE.cooldown).toBeGreaterThanOrEqual(50);
    expect(MELEE.cooldown).toBeLessThanOrEqual(2000);
  });

  it('has non-negative knockback', () => {
    expect(MELEE.knockback).toBeGreaterThanOrEqual(0);
  });

  it('has auto-target range >= melee range', () => {
    expect(MELEE.autoTargetRange).toBeGreaterThanOrEqual(MELEE.range);
  });

  it('has auto-target arc >= melee arc', () => {
    expect(MELEE.autoTargetArc).toBeGreaterThanOrEqual(MELEE.arc);
  });

  it('has non-negative screen shake and hit pause', () => {
    expect(MELEE.screenShake).toBeGreaterThanOrEqual(0);
    expect(MELEE.hitPause).toBeGreaterThanOrEqual(0);
  });
});

// ─── Arc Hit Detection ───

describe('isInMeleeArc', () => {
  // Player at origin, facing down -Z (angle = 0)
  const px = 0, pz = 0;
  const faceAngle = 0; // atan2(-dx, -dz) = 0 means facing -Z

  it('hits enemy directly in front within range', () => {
    // Enemy at (0, -1.5) → directly in front when facing -Z
    expect(isInMeleeArc(px, pz, faceAngle, 0, -1.5, 2, Math.PI)).toBe(true);
  });

  it('misses enemy beyond range', () => {
    expect(isInMeleeArc(px, pz, faceAngle, 0, -5, 2, Math.PI)).toBe(false);
  });

  it('misses enemy behind player outside arc', () => {
    // Enemy at (0, 1.5) → behind player. With narrow arc, should miss.
    expect(isInMeleeArc(px, pz, faceAngle, 0, 1.5, 2, Math.PI * 0.5)).toBe(false);
  });

  it('hits enemy at edge of arc', () => {
    // Arc of PI (180°) → halfArc = PI/2 (90°)
    // Enemy at (1.5, 0) → 90° to the side, should be at boundary
    // atan2(-1.5, 0) = -PI/2, angle diff from 0 = PI/2 which is exactly halfArc
    expect(isInMeleeArc(px, pz, faceAngle, 1.5, 0, 2, Math.PI)).toBe(true);
  });

  it('misses enemy just outside arc', () => {
    // Arc of PI*0.5 (90°) → halfArc = PI/4 (45°)
    // Enemy at (1.5, 0) → 90° to the side, should be outside 90° arc
    expect(isInMeleeArc(px, pz, faceAngle, 1.5, 0, 2, Math.PI * 0.5)).toBe(false);
  });

  it('hits enemy directly on top of player (distance ~0)', () => {
    expect(isInMeleeArc(px, pz, faceAngle, 0.001, 0.001, 2, 1)).toBe(true);
  });

  it('works with rotated player facing', () => {
    // Player facing +X direction: atan2(-dx, -dz) = -PI/2 when target is at +X
    // Let's say player faces right (angle = -PI/2)
    const rightAngle = -Math.PI / 2;
    // Enemy at (1.5, 0) should be in front
    expect(isInMeleeArc(px, pz, rightAngle, 1.5, 0, 2, Math.PI)).toBe(true);
    // Enemy at (-1.5, 0) should be behind with narrow arc
    expect(isInMeleeArc(px, pz, rightAngle, -1.5, 0, 2, Math.PI * 0.5)).toBe(false);
  });

  it('uses generous arc from MELEE config (~137°)', () => {
    // With MELEE.arc = 2.4 (~137°), enemies at ~60° should hit
    const angle60 = Math.PI / 3;
    const ex = Math.sin(angle60) * 1.5; // ~1.3
    const ez = -Math.cos(angle60) * 1.5; // ~-0.75
    expect(isInMeleeArc(px, pz, faceAngle, ex, ez, MELEE.range, MELEE.arc)).toBe(true);
  });
});

// ─── Multi-Hit Tracking ───

describe('Multi-hit per swing', () => {
  it('Set correctly tracks unique enemies', () => {
    const hitSet = new Set<any>();
    const enemy1 = { id: 1 };
    const enemy2 = { id: 2 };

    hitSet.add(enemy1);
    expect(hitSet.has(enemy1)).toBe(true);
    expect(hitSet.has(enemy2)).toBe(false);

    hitSet.add(enemy2);
    expect(hitSet.size).toBe(2);

    // Adding same enemy again doesn't increase size
    hitSet.add(enemy1);
    expect(hitSet.size).toBe(2);
  });

  it('Set clears between swings', () => {
    const hitSet = new Set<any>();
    hitSet.add({ id: 1 });
    hitSet.add({ id: 2 });
    expect(hitSet.size).toBe(2);

    hitSet.clear();
    expect(hitSet.size).toBe(0);
  });
});

// ─── Auto-Targeting Logic ───

describe('Auto-targeting selection', () => {
  // Simulate the auto-targeting logic from player.ts
  function findAutoTarget(
    playerX: number, playerZ: number, aimAngle: number,
    enemies: { pos: { x: number; z: number }; health: number; fellInPit?: boolean }[],
    autoRange: number, autoArc: number
  ): any | null {
    let bestDist = autoRange * autoRange;
    let bestEnemy: any = null;

    for (const e of enemies) {
      if (e.health <= 0 || e.fellInPit) continue;
      const dx = e.pos.x - playerX;
      const dz = e.pos.z - playerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > bestDist) continue;
      const angleToEnemy = Math.atan2(-dx, -dz);
      let angleDiff = angleToEnemy - aimAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      if (Math.abs(angleDiff) <= autoArc / 2) {
        bestDist = distSq;
        bestEnemy = e;
      }
    }
    return bestEnemy;
  }

  it('selects closest enemy in cone', () => {
    const enemies = [
      { pos: { x: 0, z: -2 }, health: 30 },   // further
      { pos: { x: 0, z: -1 }, health: 30 },   // closer
    ];
    const result = findAutoTarget(0, 0, 0, enemies, 3, Math.PI);
    expect(result).toBe(enemies[1]); // closer
  });

  it('ignores dead enemies', () => {
    const enemies = [
      { pos: { x: 0, z: -1 }, health: 0 },    // dead
      { pos: { x: 0, z: -2 }, health: 30 },   // alive
    ];
    const result = findAutoTarget(0, 0, 0, enemies, 3, Math.PI);
    expect(result).toBe(enemies[1]);
  });

  it('ignores enemies outside cone', () => {
    const enemies = [
      { pos: { x: 0, z: 1.5 }, health: 30 },  // behind player with narrow arc
    ];
    const result = findAutoTarget(0, 0, 0, enemies, 3, Math.PI * 0.5);
    expect(result).toBeNull();
  });

  it('ignores enemies outside range', () => {
    const enemies = [
      { pos: { x: 0, z: -5 }, health: 30 },
    ];
    const result = findAutoTarget(0, 0, 0, enemies, 3, Math.PI * 2);
    expect(result).toBeNull();
  });

  it('ignores pit-fallen enemies', () => {
    const enemies = [
      { pos: { x: 0, z: -1 }, health: 30, fellInPit: true },
    ];
    const result = findAutoTarget(0, 0, 0, enemies, 3, Math.PI);
    expect(result).toBeNull();
  });

  it('returns null with no enemies', () => {
    const result = findAutoTarget(0, 0, 0, [], 3, Math.PI);
    expect(result).toBeNull();
  });
});
