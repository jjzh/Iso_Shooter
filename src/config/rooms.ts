// Room definitions for the Portfolio Demo
// Each room showcases a different stage of design exploration
// Rooms are rectangular (longer on Z) — player enters from +Z (bottom-left in iso),
// progresses toward -Z (top-right in iso), exits through a door at the far end

import { Obstacle, Pit, SpawnPack, RoomSpawnBudget, PlayerProfile } from '../types/index';

export interface RoomDefinition {
  name: string;
  profile: PlayerProfile;
  sandboxMode: boolean;
  commentary: string;
  arenaHalfX: number;
  arenaHalfZ: number;
  obstacles: Obstacle[];
  pits: Pit[];
  spawnBudget: RoomSpawnBudget;
  playerStart: { x: number; z: number };
  isRestRoom?: boolean;
  isVictoryRoom?: boolean;
}

// ─── Helper: build packs of N enemies ───

function pack(enemies: { type: string }[], zone: SpawnPack['spawnZone'] = 'ahead'): SpawnPack {
  return { enemies, spawnZone: zone };
}

function goblins(n: number): { type: string }[] {
  return Array.from({ length: n }, () => ({ type: 'goblin' }));
}

// ─── Room Definitions ───

export const ROOMS: RoomDefinition[] = [

  // ══════════════════════════════════════════════════════════════════════
  // Room 1: "The Foundation" — goblins only, teach melee + dash + pit kills
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Foundation',
    profile: 'base',
    sandboxMode: true,
    commentary: "Starting point: what's the simplest satisfying combat loop?",
    arenaHalfX: 10,
    arenaHalfZ: 20,
    obstacles: [
      { x: -4, z: 5, w: 1.5, h: 2, d: 1.5 },
      { x: 4, z: -5, w: 1.5, h: 2, d: 1.5 },
    ],
    pits: [
      { x: 5, z: -8, w: 3, d: 3 },
    ],
    spawnBudget: {
      maxConcurrent: 4,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'ahead'),
        pack(goblins(3), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 16 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "Physics Playground" — walls + pits, force push as spatial tool
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Physics Playground',
    profile: 'base',
    sandboxMode: true,
    commentary: "What if the arena is the weapon? Physics-first combat.",
    arenaHalfX: 11,
    arenaHalfZ: 22,
    obstacles: [
      { x: -6, z: 0, w: 2, h: 2, d: 2 },
      { x: 6, z: 0, w: 2, h: 2, d: 2 },
      { x: 0, z: -10, w: 4, h: 1.5, d: 1 },
      { x: -3, z: 10, w: 1.5, h: 2, d: 1.5 },
    ],
    pits: [
      { x: -8, z: -8, w: 3, d: 4 },
      { x: 8, z: 5, w: 3, d: 3 },
      { x: 0, z: -16, w: 4, d: 3 },
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'far'),
        pack(goblins(3), 'ahead'),
        pack(goblins(3), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 18 },
  },
];
