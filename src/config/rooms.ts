// Room definitions for the Hades prototype
// Each room defines its own arena layout, obstacles, pits, and enemy spawns
// Enemies spawn in waves — wave 2 spawns after wave 1 is cleared

import { Obstacle, Pit, SpawnEntry } from '../types/index';

export interface RoomDefinition {
  name: string;
  arenaHalf: number;
  obstacles: Obstacle[];
  pits: Pit[];
  waves: SpawnEntry[][];   // each sub-array is a wave of spawns
  playerStart: { x: number; z: number };
}

export const ROOMS: RoomDefinition[] = [
  // ── Room 1: Small arena, introductory enemies ──
  {
    name: 'The Pit',
    arenaHalf: 15,
    obstacles: [
      { x: -4, z: 4, w: 1.5, h: 2, d: 1.5 },   // pillar left
      { x: 5, z: -3, w: 1.5, h: 2, d: 1.5 },    // pillar right
      { x: 0, z: -8, w: 3, h: 1, d: 1 },         // low wall
    ],
    pits: [
      { x: 7, z: 7, w: 4, d: 3 },                // corner pit
    ],
    waves: [
      // Wave 1: 5 enemies (4 goblins + 1 archer)
      [
        { type: 'goblin', x: 8, z: 3 },
        { type: 'goblin', x: -6, z: 5 },
        { type: 'goblin', x: 3, z: -6 },
        { type: 'goblin', x: -8, z: -4 },
        { type: 'skeletonArcher', x: -10, z: -8 },
      ],
      // Wave 2: 5 enemies (more goblins + archer from different side)
      [
        { type: 'goblin', x: -8, z: 3 },
        { type: 'goblin', x: 6, z: -5 },
        { type: 'goblin', x: -3, z: 6 },
        { type: 'goblin', x: 8, z: -4 },
        { type: 'skeletonArcher', x: 10, z: 8 },
      ],
    ],
    playerStart: { x: 0, z: 0 },
  },

  // ── Room 2: Medium arena, mixed enemies ──
  {
    name: 'The Gauntlet',
    arenaHalf: 18,
    obstacles: [
      { x: 6, z: 6, w: 2, h: 1.5, d: 2 },       // pillar NE
      { x: -6, z: 6, w: 2, h: 1.5, d: 2 },       // pillar NW
      { x: 0, z: -5, w: 1.5, h: 2.5, d: 1.5 },   // tall pillar center-south
      { x: 10, z: -8, w: 3, h: 1, d: 1 },         // low wall east
    ],
    pits: [
      { x: -8, z: 0, w: 3, d: 6 },               // long vertical pit west
      { x: 8, z: 4, w: 4, d: 3 },                 // pit east
      { x: 0, z: 12, w: 6, d: 2.5 },              // pit north
    ],
    waves: [
      // Wave 1: 5 enemies (3 goblins + archer + golem)
      [
        { type: 'goblin', x: 10, z: 5 },
        { type: 'goblin', x: -10, z: 8 },
        { type: 'goblin', x: 5, z: -10 },
        { type: 'skeletonArcher', x: -12, z: -10 },
        { type: 'stoneGolem', x: 0, z: 10 },
      ],
      // Wave 2: 5 enemies (more goblins + archer + golem from different positions)
      [
        { type: 'goblin', x: -10, z: -5 },
        { type: 'goblin', x: 10, z: -8 },
        { type: 'goblin', x: -5, z: 10 },
        { type: 'skeletonArcher', x: 12, z: 10 },
        { type: 'stoneGolem', x: -10, z: -10 },
      ],
    ],
    playerStart: { x: 0, z: -3 },
  },
];
