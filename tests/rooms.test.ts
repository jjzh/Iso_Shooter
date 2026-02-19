// Tests for Room System — room definitions, arena config, spawn budgets
// Pure logic tests — no THREE.js dependency

import { describe, it, expect } from 'vitest';
import { ROOMS, RoomDefinition } from '../src/config/rooms';
import { ENEMY_TYPES } from '../src/config/enemies';

// ─── Room Definitions Validation ───

describe('Room definitions', () => {
  it('should have 5 rooms', () => {
    expect(ROOMS.length).toBe(5);
  });

  ROOMS.forEach((room, i) => {
    describe(`Room ${i + 1}: ${room.name}`, () => {
      it('should have a name', () => {
        expect(room.name.length).toBeGreaterThan(0);
      });

      it('should have positive arenaHalfX and arenaHalfZ', () => {
        expect(room.arenaHalfX).toBeGreaterThan(5);
        expect(room.arenaHalfX).toBeLessThan(40);
        expect(room.arenaHalfZ).toBeGreaterThan(5);
        expect(room.arenaHalfZ).toBeLessThan(40);
      });

      it('should have a spawnBudget', () => {
        expect(room.spawnBudget).toBeDefined();
        expect(room.spawnBudget.packs).toBeDefined();
        expect(room.spawnBudget.maxConcurrent).toBeGreaterThanOrEqual(0);
      });

      if (!room.isRestRoom && !room.isVictoryRoom) {
        it('should have at least one spawn pack', () => {
          expect(room.spawnBudget.packs.length).toBeGreaterThan(0);
        });

        it('should have valid enemy types in all packs', () => {
          for (const pack of room.spawnBudget.packs) {
            for (const enemy of pack.enemies) {
              expect(ENEMY_TYPES).toHaveProperty(enemy.type);
            }
          }
        });

        it('should have valid spawn zones in all packs', () => {
          const validZones = ['ahead', 'sides', 'far', 'behind'];
          for (const pack of room.spawnBudget.packs) {
            expect(validZones).toContain(pack.spawnZone);
          }
        });

        it('should have maxConcurrent > 0', () => {
          expect(room.spawnBudget.maxConcurrent).toBeGreaterThan(0);
        });

        it('should have telegraphDuration > 0', () => {
          expect(room.spawnBudget.telegraphDuration).toBeGreaterThan(0);
        });
      }

      it('should have playerStart within arena bounds', () => {
        const maxX = room.arenaHalfX - 1;
        const maxZ = room.arenaHalfZ - 1;
        expect(Math.abs(room.playerStart.x)).toBeLessThanOrEqual(maxX);
        expect(Math.abs(room.playerStart.z)).toBeLessThanOrEqual(maxZ);
      });

      it('should have valid obstacles', () => {
        for (const obs of room.obstacles) {
          expect(obs.w).toBeGreaterThan(0);
          expect(obs.h).toBeGreaterThan(0);
          expect(obs.d).toBeGreaterThan(0);
          expect(Math.abs(obs.x)).toBeLessThan(room.arenaHalfX);
          expect(Math.abs(obs.z)).toBeLessThan(room.arenaHalfZ);
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
    });
  });
});

// ─── Room Progression ───

describe('Room progression', () => {
  const combatRooms = ROOMS.filter(r => !r.isRestRoom && !r.isVictoryRoom);

  it('should have at least 3 combat rooms', () => {
    expect(combatRooms.length).toBeGreaterThanOrEqual(3);
  });

  it('should have escalating enemy budgets across combat rooms', () => {
    const budgets = combatRooms.map(r =>
      r.spawnBudget.packs.reduce((sum, p) => sum + p.enemies.length, 0)
    );
    for (let i = 1; i < budgets.length; i++) {
      expect(budgets[i]).toBeGreaterThanOrEqual(budgets[i - 1]);
    }
  });

  it('should have escalating maxConcurrent across combat rooms', () => {
    const maxConcurrents = combatRooms.map(r => r.spawnBudget.maxConcurrent);
    for (let i = 1; i < maxConcurrents.length; i++) {
      expect(maxConcurrents[i]).toBeGreaterThanOrEqual(maxConcurrents[i - 1]);
    }
  });

  it('room 1 should only have goblins', () => {
    const types = new Set(
      combatRooms[0].spawnBudget.packs.flatMap(p => p.enemies.map(e => e.type))
    );
    expect(types.size).toBe(1);
    expect(types.has('goblin')).toBe(true);
  });

  it('room 2 should have goblins and archers', () => {
    const types = new Set(
      combatRooms[1].spawnBudget.packs.flatMap(p => p.enemies.map(e => e.type))
    );
    expect(types.has('goblin')).toBe(true);
    expect(types.has('skeletonArcher')).toBe(true);
  });

  it('room 3 should include imps', () => {
    const types = new Set(
      combatRooms[2].spawnBudget.packs.flatMap(p => p.enemies.map(e => e.type))
    );
    expect(types.has('iceMortarImp')).toBe(true);
  });
});

// ─── Special Rooms ───

describe('Special rooms', () => {
  it('should have exactly one rest room', () => {
    const restRooms = ROOMS.filter(r => r.isRestRoom);
    expect(restRooms.length).toBe(1);
  });

  it('rest room should have no spawn packs', () => {
    const restRoom = ROOMS.find(r => r.isRestRoom)!;
    expect(restRoom.spawnBudget.packs.length).toBe(0);
  });

  it('should have exactly one victory room', () => {
    const victoryRooms = ROOMS.filter(r => r.isVictoryRoom);
    expect(victoryRooms.length).toBe(1);
  });

  it('victory room should be the last room', () => {
    expect(ROOMS[ROOMS.length - 1].isVictoryRoom).toBe(true);
  });

  it('rest room should come before victory room', () => {
    const restIdx = ROOMS.findIndex(r => r.isRestRoom);
    const victIdx = ROOMS.findIndex(r => r.isVictoryRoom);
    expect(restIdx).toBeLessThan(victIdx);
  });
});

// ─── Rectangular Arena ───

describe('Rectangular arena support', () => {
  it('rooms should have rectangular shapes (Z >= X)', () => {
    for (const room of ROOMS.filter(r => !r.isRestRoom && !r.isVictoryRoom)) {
      expect(room.arenaHalfZ).toBeGreaterThanOrEqual(room.arenaHalfX);
    }
  });

  it('player should start at positive Z (entrance end = bottom-left in iso)', () => {
    for (const room of ROOMS) {
      expect(room.playerStart.z).toBeGreaterThan(0);
    }
  });
});

// ─── Arena Config Swap ───

describe('Arena config swap', () => {
  it('setArenaConfig should update OBSTACLES, PITS, and arena dimensions', async () => {
    const { OBSTACLES, PITS, ARENA_HALF_X, ARENA_HALF_Z, setArenaConfig } = await import('../src/config/arena');

    const newObs = [{ x: 1, z: 1, w: 2, h: 2, d: 2 }];
    const newPits = [{ x: 3, z: 3, w: 4, d: 4 }];
    setArenaConfig(newObs, newPits, 10, 20);

    const { OBSTACLES: O2, PITS: P2, ARENA_HALF_X: HX, ARENA_HALF_Z: HZ } = await import('../src/config/arena');
    expect(O2.length).toBe(1);
    expect(P2.length).toBe(1);
    expect(HX).toBe(10);
    expect(HZ).toBe(20);

    // Restore defaults
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
    setArenaConfig(origObs, origPitsData, 20, 20);
  });

  it('setArenaConfig with single dimension should set both to same value', async () => {
    const { ARENA_HALF_X, ARENA_HALF_Z, setArenaConfig } = await import('../src/config/arena');
    setArenaConfig([], [], 15);
    const { ARENA_HALF_X: HX, ARENA_HALF_Z: HZ } = await import('../src/config/arena');
    expect(HX).toBe(15);
    expect(HZ).toBe(15);
    // Restore
    setArenaConfig([], [], 20, 20);
  });
});

// ─── Profile System ───

describe('Profile system', () => {
  it('every room should have a valid profile', () => {
    const validProfiles = ['base', 'assassin', 'rule-bending', 'vertical'];
    for (const room of ROOMS) {
      expect(validProfiles).toContain(room.profile);
    }
  });

  it('every room should have sandboxMode defined', () => {
    for (const room of ROOMS) {
      expect(typeof room.sandboxMode).toBe('boolean');
    }
  });

  it('every room should have a commentary string', () => {
    for (const room of ROOMS) {
      expect(typeof room.commentary).toBe('string');
      expect(room.commentary.length).toBeGreaterThan(0);
    }
  });
});

// ─── Collision Bounds with Rectangular Arena ───

describe('Rectangular collision bounds', () => {
  it('getCollisionBounds should produce walls matching arena dimensions', async () => {
    const { setArenaConfig, getCollisionBounds } = await import('../src/config/arena');
    setArenaConfig([], [], 10, 25);
    const bounds = getCollisionBounds();

    // Should have 4 wall bounds (no obstacles)
    expect(bounds.length).toBe(4);

    // North wall at +Z=25
    const north = bounds[0];
    expect(north.minZ).toBeCloseTo(24.75, 1);
    expect(north.maxZ).toBeCloseTo(25.25, 1);
    expect(north.minX).toBeCloseTo(-10.25, 1);
    expect(north.maxX).toBeCloseTo(10.25, 1);

    // South wall at -Z=25
    const south = bounds[1];
    expect(south.minZ).toBeCloseTo(-25.25, 1);
    expect(south.maxZ).toBeCloseTo(-24.75, 1);

    // East wall at +X=10
    const east = bounds[2];
    expect(east.minX).toBeCloseTo(9.75, 1);
    expect(east.maxX).toBeCloseTo(10.25, 1);
    expect(east.minZ).toBeCloseTo(-25.25, 1);
    expect(east.maxZ).toBeCloseTo(25.25, 1);

    // West wall at -X=10
    const west = bounds[3];
    expect(west.minX).toBeCloseTo(-10.25, 1);
    expect(west.maxX).toBeCloseTo(-9.75, 1);

    // Restore
    setArenaConfig([], [], 20, 20);
  });
});
