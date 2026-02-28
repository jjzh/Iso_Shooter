import { describe, it, expect, beforeEach } from 'vitest';
import { getGroundHeight, isOnPlatform, setHeightZones, HEIGHT_ZONES } from '../src/config/terrain';

describe('Terrain Height Zones', () => {
  beforeEach(() => {
    setHeightZones([]);
  });

  describe('getGroundHeight', () => {
    it('returns 0 when no zones defined', () => {
      expect(getGroundHeight(0, 0)).toBe(0);
    });

    it('returns zone height when point is inside', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 2 }]);
      expect(getGroundHeight(0, 0)).toBe(2);
    });

    it('returns 0 when point is outside all zones', () => {
      setHeightZones([{ x: 10, z: 10, w: 2, d: 2, y: 3 }]);
      expect(getGroundHeight(0, 0)).toBe(0);
    });

    it('returns highest zone when overlapping', () => {
      setHeightZones([
        { x: 0, z: 0, w: 6, d: 6, y: 1 },
        { x: 0, z: 0, w: 3, d: 3, y: 3 },
      ]);
      // Center is inside both — should return 3
      expect(getGroundHeight(0, 0)).toBe(3);
      // Edge of large zone but outside small — should return 1
      expect(getGroundHeight(2.5, 2.5)).toBe(1);
    });

    it('handles edge of zone (inclusive bounds)', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 2 }]);
      // Exactly on the edge: x = 2, which is x + w/2
      expect(getGroundHeight(2, 0)).toBe(2);
      expect(getGroundHeight(-2, 0)).toBe(2);
    });

    it('returns 0 just outside zone boundary', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 2 }]);
      expect(getGroundHeight(2.01, 0)).toBe(0);
    });

    it('handles multiple non-overlapping zones', () => {
      setHeightZones([
        { x: -5, z: 0, w: 3, d: 3, y: 1 },
        { x: 5, z: 0, w: 3, d: 3, y: 2 },
      ]);
      expect(getGroundHeight(-5, 0)).toBe(1);
      expect(getGroundHeight(5, 0)).toBe(2);
      expect(getGroundHeight(0, 0)).toBe(0);
    });
  });

  describe('isOnPlatform', () => {
    it('returns false when on floor (no zones)', () => {
      expect(isOnPlatform(0, 0, 0)).toBe(false);
    });

    it('returns true when entity Y matches platform height', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 2 }]);
      expect(isOnPlatform(0, 0, 2)).toBe(true);
    });

    it('returns true within epsilon', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 2 }]);
      expect(isOnPlatform(0, 0, 2.03, 0.05)).toBe(true);
    });

    it('returns false when too far from surface', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 2 }]);
      expect(isOnPlatform(0, 0, 3)).toBe(false);
    });

    it('returns false when outside zone XZ bounds', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 2 }]);
      expect(isOnPlatform(10, 0, 2)).toBe(false);
    });
  });

  describe('setHeightZones', () => {
    it('clears previous zones', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 5 }]);
      expect(getGroundHeight(0, 0)).toBe(5);
      setHeightZones([]);
      expect(getGroundHeight(0, 0)).toBe(0);
    });

    it('replaces with new zones', () => {
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 5 }]);
      setHeightZones([{ x: 0, z: 0, w: 4, d: 4, y: 10 }]);
      expect(getGroundHeight(0, 0)).toBe(10);
    });
  });
});
