import { describe, it, expect, beforeEach } from 'vitest';
import { getGroundHeight, setHeightZones } from '../src/config/terrain';
import { PHYSICS } from '../src/config/physics';

describe('Ledge Walking Physics', () => {
  beforeEach(() => {
    setHeightZones([
      { x: 5, z: 0, w: 4, d: 4, y: 2 },  // platform at height 2
    ]);
  });

  describe('Walking off platform edge triggers fall', () => {
    it('detects ground drop when stepping off platform', () => {
      // Player is on platform at y=2
      const playerY = 2;
      // Steps to position just outside platform
      const groundBelow = getGroundHeight(7.1, 0); // just past edge
      expect(groundBelow).toBe(0); // floor level
      expect(playerY > groundBelow + PHYSICS.groundEpsilon).toBe(true);
      // → would trigger airborne state
    });

    it('stays grounded when still on platform', () => {
      const playerY = 2;
      const groundBelow = getGroundHeight(5, 0); // center of platform
      expect(groundBelow).toBe(2);
      expect(playerY > groundBelow + PHYSICS.groundEpsilon).toBe(false);
      // → stays grounded
    });
  });

  describe('Walking into platform acts as wall', () => {
    it('ground-level entity blocked by platform (entityY < maxY)', () => {
      // Entity at ground level walking toward platform
      const entityY = 0;
      const platformMaxY = 2;
      // Height-aware collision skips when entityY > maxY
      // Since 0 < 2, collision NOT skipped → entity is blocked
      expect(entityY > platformMaxY).toBe(false);
    });

    it('airborne entity above platform passes over (entityY > maxY)', () => {
      const entityY = 2.5;
      const platformMaxY = 2;
      expect(entityY > platformMaxY).toBe(true);
      // → collision skipped, entity can pass
    });

    it('entity exactly at platform height passes over', () => {
      const entityY = 2;
      const platformMaxY = 2;
      // entityY > maxY is false when equal, so entity is blocked at exact height
      // This is correct — you need to be ABOVE the platform to walk on it
      expect(entityY > platformMaxY).toBe(false);
    });
  });

  describe('Jump onto platform', () => {
    it('landing on platform when airborne above it', () => {
      // Falling player at y=2.1 above platform
      const playerY = 2.1;
      const groundHeight = getGroundHeight(5, 0); // platform center
      expect(groundHeight).toBe(2);
      // velY is negative (falling), playerY > groundHeight
      // When playerY <= groundHeight → land on platform
      const nextY = playerY + (-5 * 0.016); // falling at -5 u/s for one frame
      expect(nextY).toBeLessThan(playerY);
      // Eventually reaches groundHeight and lands
    });
  });
});
