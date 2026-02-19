// Tests for Portfolio Demo Room System
// Pure logic tests — no THREE.js dependency

import { describe, it, expect } from 'vitest';
import { ROOMS, RoomDefinition } from '../src/config/rooms';
import { ENEMY_TYPES } from '../src/config/enemies';

// ─── Demo Room Definitions ───

describe('Demo room definitions', () => {
  it('should have 4 rooms', () => {
    expect(ROOMS.length).toBe(4);
  });

  ROOMS.forEach((room, i) => {
    describe(`Room ${i + 1}: ${room.name}`, () => {
      it('should have a name', () => {
        expect(room.name.length).toBeGreaterThan(0);
      });

      it('should have a valid profile', () => {
        const validProfiles = ['origin', 'base', 'assassin', 'rule-bending', 'vertical'];
        expect(validProfiles).toContain(room.profile);
      });

      it('should have sandboxMode true', () => {
        expect(room.sandboxMode).toBe(true);
      });

      it('should have commentary', () => {
        expect(room.commentary.length).toBeGreaterThan(0);
      });

      it('should have positive arena dimensions', () => {
        expect(room.arenaHalfX).toBeGreaterThan(5);
        expect(room.arenaHalfZ).toBeGreaterThan(5);
      });

      it('should have a spawnBudget with packs', () => {
        expect(room.spawnBudget.packs.length).toBeGreaterThan(0);
      });

      it('should have valid enemy types', () => {
        for (const pack of room.spawnBudget.packs) {
          for (const enemy of pack.enemies) {
            expect(ENEMY_TYPES).toHaveProperty(enemy.type);
          }
        }
      });

      it('should have valid spawn zones', () => {
        const validZones = ['ahead', 'sides', 'far', 'behind'];
        for (const pack of room.spawnBudget.packs) {
          expect(validZones).toContain(pack.spawnZone);
        }
      });

      it('should have playerStart within arena bounds', () => {
        expect(Math.abs(room.playerStart.x)).toBeLessThan(room.arenaHalfX);
        expect(Math.abs(room.playerStart.z)).toBeLessThan(room.arenaHalfZ);
      });

      it('should not spawn player inside obstacle or pit', () => {
        const px = room.playerStart.x;
        const pz = room.playerStart.z;
        for (const obs of room.obstacles) {
          const inX = px >= obs.x - obs.w / 2 && px <= obs.x + obs.w / 2;
          const inZ = pz >= obs.z - obs.d / 2 && pz <= obs.z + obs.d / 2;
          expect(inX && inZ).toBe(false);
        }
        for (const pit of room.pits) {
          const inX = px >= pit.x - pit.w / 2 && px <= pit.x + pit.w / 2;
          const inZ = pz >= pit.z - pit.d / 2 && pz <= pit.z + pit.d / 2;
          expect(inX && inZ).toBe(false);
        }
      });
    });
  });
});

// ─── Profile System ───

describe('Profile system', () => {
  it('every room should have a valid profile', () => {
    const validProfiles = ['origin', 'base', 'assassin', 'rule-bending', 'vertical'];
    for (const room of ROOMS) {
      expect(validProfiles).toContain(room.profile);
    }
  });
});

// ─── Sandbox Mode ───

describe('Sandbox mode', () => {
  it('all demo rooms should have sandboxMode: true', () => {
    for (const room of ROOMS) {
      expect(room.sandboxMode).toBe(true);
    }
  });
});

// ─── Room 1 specifics: The Origin ───

describe('Room 1: The Origin', () => {
  const room = ROOMS[0];

  it('should have origin profile', () => {
    expect(room.profile).toBe('origin');
  });

  it('should only have goblins', () => {
    const types = new Set(
      room.spawnBudget.packs.flatMap(p => p.enemies.map(e => e.type))
    );
    expect(types.size).toBe(1);
    expect(types.has('goblin')).toBe(true);
  });

  it('should have no pits', () => {
    expect(room.pits.length).toBe(0);
  });
});

// ─── Room 2 specifics: The Foundation ───

describe('Room 2: The Foundation', () => {
  const room = ROOMS[1];

  it('should have base profile', () => {
    expect(room.profile).toBe('base');
  });

  it('should only have goblins', () => {
    const types = new Set(
      room.spawnBudget.packs.flatMap(p => p.enemies.map(e => e.type))
    );
    expect(types.size).toBe(1);
    expect(types.has('goblin')).toBe(true);
  });

  it('should have at least one pit', () => {
    expect(room.pits.length).toBeGreaterThan(0);
  });
});

// ─── Room 3 specifics: Physics Playground ───

describe('Room 3: Physics Playground', () => {
  const room = ROOMS[2];

  it('should have base profile', () => {
    expect(room.profile).toBe('base');
  });

  it('should have at least as many pits as room 2', () => {
    expect(room.pits.length).toBeGreaterThanOrEqual(ROOMS[1].pits.length);
  });

  it('should have more obstacles than room 2', () => {
    expect(room.obstacles.length).toBeGreaterThan(ROOMS[1].obstacles.length);
  });
});

// ─── Room 4 specifics: The Arena (Vertical) ───

describe('Room 4: The Arena', () => {
  const room = ROOMS[3];

  it('should have vertical profile', () => {
    expect(room.profile).toBe('vertical');
  });

  it('should have heightZones', () => {
    expect(room.heightZones).toBeDefined();
    expect(room.heightZones!.length).toBeGreaterThan(0);
  });

  it('should have tighter frustum', () => {
    expect(room.frustumSize).toBeDefined();
    expect(room.frustumSize).toBeLessThan(12);
  });

  it('should only have goblins', () => {
    const types = new Set(
      room.spawnBudget.packs.flatMap(p => p.enemies.map(e => e.type))
    );
    expect(types.size).toBe(1);
    expect(types.has('goblin')).toBe(true);
  });

  it('should have no pits (vertical is the hazard)', () => {
    expect(room.pits.length).toBe(0);
  });

  it('should have no obstacles (open for aerial combat)', () => {
    expect(room.obstacles.length).toBe(0);
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
    setArenaConfig([], [], 20, 20);
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
