// Room definitions for the Hades prototype
// Each room defines its own arena layout, obstacles, pits, and incremental spawn budget
// Rooms are rectangular (longer on Z) — player enters from +Z (bottom-left in iso),
// progresses toward -Z (top-right in iso), exits through a door at the far end

import { Obstacle, Pit, SpawnPack, RoomSpawnBudget } from '../types/index';
import type { HeightZone } from './terrain';

export interface RoomDefinition {
  name: string;
  arenaHalfX: number;
  arenaHalfZ: number;
  obstacles: Obstacle[];
  pits: Pit[];
  heightZones?: HeightZone[];
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

function archers(n: number): { type: string }[] {
  return Array.from({ length: n }, () => ({ type: 'skeletonArcher' }));
}

function imps(n: number): { type: string }[] {
  return Array.from({ length: n }, () => ({ type: 'iceMortarImp' }));
}

// ─── Room Definitions ───

export const ROOMS: RoomDefinition[] = [

  // ══════════════════════════════════════════════════════════════════════
  // Room 1: "The Approach" — goblins only, teach melee + dash
  // Player enters at +Z (bottom-left in iso), progresses toward -Z (top-right)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Approach',
    arenaHalfX: 10,
    arenaHalfZ: 22,
    obstacles: [
      { x: -4, z: 5, w: 1.5, h: 2, d: 1.5 },    // pillar left near entrance
      { x: 4, z: -5, w: 1.5, h: 2, d: 1.5 },     // pillar right mid
      { x: 0, z: -12, w: 3, h: 1, d: 1 },         // low wall far
    ],
    pits: [
      { x: 5, z: -8, w: 3, d: 3 },                // small pit mid-right (teaches force push)
    ],
    heightZones: [
      { x: -6, z: -2, w: 5, d: 4, y: 1.2, label: 'raised left' },    // low platform, jumpable
      { x: 3, z: -15, w: 4, d: 3, y: 1.5, label: 'raised far-right' }, // slightly higher
    ],
    spawnBudget: {
      maxConcurrent: 4,
      telegraphDuration: 1500,
      packs: [
        // Start light: 2 goblins ahead
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'ahead'),
        // Ramp up: 3 goblins, mix positions
        pack(goblins(3), 'ahead'),
        pack(goblins(3), 'sides'),
        // One final push from far end
        pack(goblins(2), 'far'),
      ],
    },
    playerStart: { x: 0, z: 18 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "The Crossfire" — goblins + archers, introduce ranged pressure
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Crossfire',
    arenaHalfX: 12,
    arenaHalfZ: 24,
    obstacles: [
      { x: -6, z: 0, w: 2, h: 2, d: 2 },         // cover pillar left
      { x: 6, z: 0, w: 2, h: 2, d: 2 },           // cover pillar right
      { x: 0, z: -10, w: 4, h: 1.5, d: 1 },       // mid wall (toward far/exit end)
      { x: -3, z: 10, w: 1.5, h: 2, d: 1.5 },     // pillar near entrance
    ],
    pits: [
      { x: -8, z: -8, w: 3, d: 4 },               // pit left mid (toward exit)
      { x: 8, z: 5, w: 3, d: 3 },                  // pit right near entrance
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        // Intro: goblins rush
        pack(goblins(2), 'ahead'),
        // Archer appears far back
        pack([...archers(1), ...goblins(1)], 'far'),
        // More melee pressure
        pack(goblins(3), 'ahead'),
        // Flanking archers
        pack(archers(2), 'sides'),
        // Mixed push
        pack([...goblins(2), ...archers(1)], 'ahead'),
        // Final rush
        pack(goblins(3), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 20 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 3: "The Crucible" — full mix with imps, area denial
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Crucible',
    arenaHalfX: 13,
    arenaHalfZ: 25,
    obstacles: [
      { x: -5, z: 8, w: 2, h: 2, d: 2 },         // pillar near entrance left
      { x: 5, z: 8, w: 2, h: 2, d: 2 },           // pillar near entrance right
      { x: 0, z: -5, w: 1.5, h: 2.5, d: 1.5 },   // tall center pillar
      { x: -8, z: -10, w: 3, h: 1, d: 1 },        // low wall far left
      { x: 8, z: -10, w: 3, h: 1, d: 1 },         // low wall far right
    ],
    pits: [
      { x: 0, z: 3, w: 5, d: 3 },                 // central pit (forces flanking)
      { x: -9, z: -15, w: 3, d: 4 },              // far left pit
      { x: 9, z: -15, w: 3, d: 4 },               // far right pit
    ],
    spawnBudget: {
      maxConcurrent: 6,
      telegraphDuration: 1500,
      packs: [
        // Start with melee rush
        pack(goblins(3), 'ahead'),
        // Introduce ranged
        pack([...archers(1), ...goblins(1)], 'far'),
        // First imp — area denial begins
        pack([...imps(1), ...goblins(1)], 'sides'),
        // Melee wave to push player into imp zones
        pack(goblins(3), 'ahead'),
        // More imps + archer
        pack([...imps(1), ...archers(1)], 'far'),
        // Heavy mixed final push
        pack([...goblins(2), ...imps(1)], 'ahead'),
        pack([...archers(1), ...goblins(1)], 'sides'),
      ],
    },
    playerStart: { x: 0, z: 21 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 4: "The Respite" — rest room, heal to full
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Respite',
    arenaHalfX: 8,
    arenaHalfZ: 12,
    obstacles: [],
    pits: [],
    spawnBudget: {
      maxConcurrent: 0,
      telegraphDuration: 0,
      packs: [],
    },
    playerStart: { x: 0, z: 8 },
    isRestRoom: true,
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 5: "The Throne" — victory room (boss designed separately)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Throne',
    arenaHalfX: 10,
    arenaHalfZ: 10,
    obstacles: [],
    pits: [],
    spawnBudget: {
      maxConcurrent: 0,
      telegraphDuration: 0,
      packs: [],
    },
    playerStart: { x: 0, z: 6 },
    isVictoryRoom: true,
  },
];
