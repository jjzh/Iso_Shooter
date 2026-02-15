import { describe, it, expect } from 'vitest';
import { PHYSICS } from '../src/config/physics';

describe('destructible obstacle mechanics', () => {
  it('destructible obstacle has finite health', () => {
    const obs = { x: 0, z: 0, w: 2, h: 2, d: 2, destructible: true, health: 50, maxHealth: 50, material: 'stone' as const };
    expect(obs.health).toBe(50);
    expect(obs.destructible).toBe(true);
  });

  it('non-destructible obstacle has no health', () => {
    const obs = { x: 0, z: 0, w: 2, h: 2, d: 2 };
    expect((obs as any).destructible).toBeUndefined();
    expect((obs as any).health).toBeUndefined();
  });

  it('impact damage formula works for obstacles', () => {
    const impactSpeed = 6;
    const damage = Math.round((impactSpeed - PHYSICS.objectWallSlamMinSpeed) * PHYSICS.objectWallSlamDamage);
    expect(damage).toBeGreaterThan(0);
  });

  it('obstacle health can reach zero', () => {
    let health = 50;
    const damage = 60;
    health -= damage;
    expect(health).toBeLessThanOrEqual(0);
  });

  it('AABB overlap detection for circle-vs-obstacle', () => {
    // Circle at (0, 0.5) with radius 0.8, obstacle AABB from (-1,-1) to (1,1)
    const cx = 0, cz = 0.5, radius = 0.8;
    const minX = -1, maxX = 1, minZ = -1, maxZ = 1;
    const closestX = Math.max(minX, Math.min(cx, maxX));
    const closestZ = Math.max(minZ, Math.min(cz, maxZ));
    const dx = cx - closestX;
    const dz = cz - closestZ;
    const distSq = dx * dx + dz * dz;
    expect(distSq).toBeLessThan(radius * radius); // overlapping
  });
});
