// Tests for Room System (rooms, waves, arena config)
// Pure logic tests — no THREE.js dependency

import { describe, it, expect } from 'vitest';
import { ROOMS, RoomDefinition } from '../src/config/rooms';
import { ENEMY_TYPES } from '../src/config/enemies';

// ─── Room Definitions Validation ───

describe('Room definitions', () => {
  it('should have at least 2 rooms', () => {
    expect(ROOMS.length).toBeGreaterThanOrEqual(2);
  });

  ROOMS.forEach((room, i) => {
    describe(`Room ${i + 1}: ${room.name}`, () => {
      it('should have a name', () => {
        expect(room.name.length).toBeGreaterThan(0);
      });

      it('should have positive arenaHalf', () => {
        expect(room.arenaHalf).toBeGreaterThan(5);
        expect(room.arenaHalf).toBeLessThan(40);
      });

      it('should have at least one wave', () => {
        expect(room.waves.length).toBeGreaterThan(0);
      });

      it('should have at least one spawn per wave', () => {
        for (const wave of room.waves) {
          expect(wave.length).toBeGreaterThan(0);
        }
      });

      it('should have valid spawn types in all waves', () => {
        for (const wave of room.waves) {
          for (const spawn of wave) {
            expect(ENEMY_TYPES).toHaveProperty(spawn.type);
          }
        }
      });

      it('should have spawns within arena bounds in all waves', () => {
        const maxCoord = room.arenaHalf - 1; // 1 unit margin from wall
        for (const wave of room.waves) {
          for (const spawn of wave) {
            expect(Math.abs(spawn.x)).toBeLessThanOrEqual(maxCoord);
            expect(Math.abs(spawn.z)).toBeLessThanOrEqual(maxCoord);
          }
        }
      });

      it('should have playerStart within arena bounds', () => {
        const maxCoord = room.arenaHalf - 1;
        expect(Math.abs(room.playerStart.x)).toBeLessThanOrEqual(maxCoord);
        expect(Math.abs(room.playerStart.z)).toBeLessThanOrEqual(maxCoord);
      });

      it('should have valid obstacles', () => {
        for (const obs of room.obstacles) {
          expect(obs.w).toBeGreaterThan(0);
          expect(obs.h).toBeGreaterThan(0);
          expect(obs.d).toBeGreaterThan(0);
          // Obstacle should be within arena
          expect(Math.abs(obs.x)).toBeLessThan(room.arenaHalf);
          expect(Math.abs(obs.z)).toBeLessThan(room.arenaHalf);
        }
      });

      it('should have valid pits', () => {
        for (const pit of room.pits) {
          expect(pit.w).toBeGreaterThan(0);
          expect(pit.d).toBeGreaterThan(0);
        }
      });

      it('should not spawn player inside an obstacle', () => {
        const px = room.playerStart.x;
        const pz = room.playerStart.z;
        for (const obs of room.obstacles) {
          const inX = px >= obs.x - obs.w / 2 && px <= obs.x + obs.w / 2;
          const inZ = pz >= obs.z - obs.d / 2 && pz <= obs.z + obs.d / 2;
          expect(inX && inZ).toBe(false);
        }
      });

      it('should not spawn player inside a pit', () => {
        const px = room.playerStart.x;
        const pz = room.playerStart.z;
        for (const pit of room.pits) {
          const inX = px >= pit.x - pit.w / 2 && px <= pit.x + pit.w / 2;
          const inZ = pz >= pit.z - pit.d / 2 && pz <= pit.z + pit.d / 2;
          expect(inX && inZ).toBe(false);
        }
      });

      it('should have 2 waves per room', () => {
        expect(room.waves.length).toBe(2);
      });
    });
  });
});

// ─── Arena Config Swap ───

describe('Arena config swap', () => {
  it('setArenaConfig should update OBSTACLES, PITS, and ARENA_HALF', async () => {
    // Dynamic import to avoid pulling THREE
    const { OBSTACLES, PITS, ARENA_HALF, setArenaConfig } = await import('../src/config/arena');

    const origObsCount = OBSTACLES.length;
    const origPitCount = PITS.length;
    const origHalf = ARENA_HALF;

    const newObs = [{ x: 1, z: 1, w: 2, h: 2, d: 2 }];
    const newPits = [{ x: 3, z: 3, w: 4, d: 4 }];
    setArenaConfig(newObs, newPits, 10);

    // Verify swap happened
    const { OBSTACLES: O2, PITS: P2, ARENA_HALF: H2 } = await import('../src/config/arena');
    expect(O2.length).toBe(1);
    expect(P2.length).toBe(1);
    expect(H2).toBe(10);
    expect(O2[0].x).toBe(1);
    expect(P2[0].x).toBe(3);

    // Restore originals (arena.ts arrays are module singletons)
    const origObs = [
      { x: 5, z: 9, w: 2, h: 1.5, d: 3 },
      { x: -9, z: -7.5, w: 4, h: 1.5, d: 2 },
      { x: 3.5, z: -3, w: 1.5, h: 2, d: 1.5 },
      { x: 3.5, z: -9.5, w: 1.5, h: 2, d: 1.5 },
      { x: 1, z: 10, w: 9, h: 1, d: 1 },
      { x: 8.5, z: -8, w: 3, h: 1, d: 1 },
      { x: 10, z: 9, w: 1, h: 2.5, d: 1 },
      { x: -7.5, z: 8, w: 1, h: 2.5, d: 1 },
    ];
    const origPitsData = [
      { x: 0, z: 7.5, w: 8, d: 3 },
      { x: 16, z: -17, w: 4.5, d: 4.5 },
      { x: -7.5, z: 0, w: 2.5, d: 8 },
      { x: -0.5, z: -7, w: 8.5, d: 2.5 },
      { x: 8, z: 0, w: 3, d: 9 },
    ];
    setArenaConfig(origObs, origPitsData, 20);
  });
});

// ─── Room Progression Logic ───

describe('Room progression', () => {
  it('room count should match ROOMS array length', () => {
    expect(ROOMS.length).toBe(2);
  });

  it('rooms should have increasing difficulty (more or tougher enemies)', () => {
    // Room 2 should have a golem (tougher) that Room 1 doesn't
    const room1Types = ROOMS[0].waves.flat().map(s => s.type);
    const room2Types = ROOMS[1].waves.flat().map(s => s.type);
    expect(room1Types).not.toContain('stoneGolem');
    expect(room2Types).toContain('stoneGolem');
  });

  it('each room should have double the enemies across waves vs single wave', () => {
    // Each room has 2 waves of 5 enemies = 10 total
    for (const room of ROOMS) {
      const totalEnemies = room.waves.reduce((sum, wave) => sum + wave.length, 0);
      expect(totalEnemies).toBe(10);
    }
  });
});
