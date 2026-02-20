// Room definitions for the Portfolio Demo
// Each room showcases a different stage of design exploration
// Rooms are rectangular (longer on Z) — player enters from +Z (bottom-left in iso),
// progresses toward -Z (top-right in iso), exits through a door at the far end

import { Obstacle, Pit, SpawnPack, SpawnPackEnemy, RoomSpawnBudget, PlayerProfile, PhysicsObjectPlacement, PressurePlatePlacement } from '../types/index';

export type HighlightTarget = 'pits' | 'obstacles' | 'platforms';

export interface RoomHighlight {
  target: HighlightTarget;
  color?: number;      // override highlight color (default per target type)
  delay?: number;      // ms after room load (default 800)
  duration?: number;   // ms for the pulse (default 2000)
}

export interface RoomDefinition {
  name: string;
  profile: PlayerProfile;
  sandboxMode: boolean;
  commentary: string;
  intro?: string;
  arenaHalfX: number;
  arenaHalfZ: number;
  obstacles: Obstacle[];
  pits: Pit[];
  spawnBudget: RoomSpawnBudget;
  playerStart: { x: number; z: number };
  enableWallSlamDamage?: boolean;
  enableEnemyCollisionDamage?: boolean;
  highlights?: RoomHighlight[];
  isRestRoom?: boolean;
  isVictoryRoom?: boolean;
  heightZones?: Array<{ x: number; z: number; w: number; d: number; y: number }>;
  frustumSize?: number;
  physicsObjects?: PhysicsObjectPlacement[];
  pressurePlates?: PressurePlatePlacement[];
  lockedBends?: string[];
}

// ─── Helper: build packs of N enemies ───

function pack(enemies: SpawnPackEnemy[], zone: SpawnPack['spawnZone'] = 'ahead'): SpawnPack {
  return { enemies, spawnZone: zone };
}

function goblins(n: number): SpawnPackEnemy[] {
  return Array.from({ length: n }, () => ({ type: 'goblin' }));
}

// ─── Room Definitions ───

export const ROOMS: RoomDefinition[] = [

  // ══════════════════════════════════════════════════════════════════════
  // Room 1: "The Origin" — Feb 7 prototype, auto-fire projectiles, cylinder+sphere model
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Origin',
    profile: 'origin',
    sandboxMode: true,
    commentary: "Where it all started: auto-fire, simple shapes, pure movement.",
    intro: "The very first prototype — February 7th. Auto-fire projectiles, a cylinder-and-sphere player model, and the question: does moving and shooting in isometric feel good? This is where it all started.",
    arenaHalfX: 9,
    arenaHalfZ: 16,
    obstacles: [
      { x: -3, z: 3, w: 1.5, h: 2, d: 1.5 },
      { x: 4, z: -4, w: 1.5, h: 2, d: 1.5 },
    ],
    pits: [],
    spawnBudget: {
      maxConcurrent: 3,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 12 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "The Foundation" — goblins only, teach melee + dash + pit kills
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Foundation',
    profile: 'base',
    sandboxMode: true,
    commentary: "Starting point: what's the simplest satisfying combat loop?",
    intro: "What's the simplest satisfying combat loop? Goblins rush you, you have melee and dash. Pits in the arena let you knock enemies off the edge. The design question: can force push + environmental hazards carry the combat?",
    arenaHalfX: 10,
    arenaHalfZ: 20,
    enableWallSlamDamage: false,
    enableEnemyCollisionDamage: false,
    highlights: [{ target: 'pits' }],
    obstacles: [
      { x: -4, z: 5, w: 1.5, h: 2, d: 1.5 },
      { x: 4, z: -5, w: 1.5, h: 2, d: 1.5 },
    ],
    pits: [
      { x: 6, z: -8, w: 3, d: 3 },
      { x: -6, z: -2, w: 3, d: 3 },
      { x: 3, z: 6, w: 3, d: 2.5 },
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
    intro: "What if the arena itself is the weapon? Wall slam damage, enemy collision damage, and pits everywhere. The force push becomes a spatial tool — not just knockback, but a way to use the environment against enemies.",
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
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

  // ══════════════════════════════════════════════════════════════════════
  // Room 4: "The Shadows" — patrol maze, vision cones, detection puzzle
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Shadows',
    profile: 'assassin' as PlayerProfile,
    sandboxMode: true,
    commentary: "What if the design question shifts from damage to detection?",
    intro: "What if the design question shifts from 'how do I deal damage' to 'how do I avoid detection'? Enemies patrol with vision cones. Cover matters. You can still fight — but getting spotted changes the encounter.",
    arenaHalfX: 14,
    arenaHalfZ: 14,
    obstacles: [
      // Maze walls — creating lanes
      { x: -5, z: 5, w: 8, h: 2, d: 1 },     // upper-left horizontal wall
      { x: 5, z: -1, w: 8, h: 2, d: 1 },      // center-right horizontal wall
      { x: -5, z: -7, w: 8, h: 2, d: 1 },     // lower-left horizontal wall
      // Cover pillars at intersections
      { x: 0, z: 8, w: 1.5, h: 2, d: 1.5 },   // top gap pillar
      { x: -1, z: -4, w: 1.5, h: 2, d: 1.5 }, // center gap pillar
    ],
    pits: [
      // Opportunistic push spots at corridor intersections
      { x: 8, z: 5, w: 3, d: 3 },     // right side, near upper wall end
      { x: -8, z: -1, w: 3, d: 3 },    // left side, center height
      { x: 4, z: -5, w: 3, d: 2.5 },   // lower-right, between center and lower walls
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        // Pit 1 (x:8, z:5) — right side, 2 goblins on opposite corners
        {
          enemies: [
            { type: 'goblin', fixedPos: { x: 11, z: 3 }, patrolWaypoints: [{ x: 11, z: 3 }, { x: 11, z: 7 }, { x: 5, z: 7 }, { x: 5, z: 3 }] },
            { type: 'goblin', fixedPos: { x: 5, z: 7 }, patrolWaypoints: [{ x: 5, z: 7 }, { x: 5, z: 3 }, { x: 11, z: 3 }, { x: 11, z: 7 }] },
          ],
          spawnZone: 'ahead' as const,
        },
        // Pit 2 (x:-8, z:-1) — left side, 2 goblins on opposite corners
        {
          enemies: [
            { type: 'goblin', fixedPos: { x: -5, z: -3 }, patrolWaypoints: [{ x: -5, z: -3 }, { x: -5, z: 1 }, { x: -11, z: 1 }, { x: -11, z: -3 }] },
            { type: 'goblin', fixedPos: { x: -11, z: 1 }, patrolWaypoints: [{ x: -11, z: 1 }, { x: -11, z: -3 }, { x: -5, z: -3 }, { x: -5, z: 1 }] },
          ],
          spawnZone: 'ahead' as const,
        },
        // Pit 3 (x:4, z:-5) — lower center-right, 1 goblin
        {
          enemies: [
            { type: 'goblin', fixedPos: { x: 7, z: -3 }, patrolWaypoints: [{ x: 7, z: -3 }, { x: 7, z: -7 }, { x: 1, z: -7 }, { x: 1, z: -3 }] },
          ],
          spawnZone: 'ahead' as const,
        },
      ],
    },
    playerStart: { x: -10, z: 10 },
    enableWallSlamDamage: false,
    enableEnemyCollisionDamage: false,
    highlights: [{ target: 'pits' }],
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 5: "The Workshop" — rule-bending (enlarge/shrink physics objects)
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Workshop',
    profile: 'rule-bending' as PlayerProfile,
    sandboxMode: true,
    commentary: 'What if you could bend the rules? Enlarge a rock, shrink a crate...',
    intro: "What if you could bend the rules of the world? Enlarge a rock to trigger a pressure plate. Shrink a crate blocking your path. This room explores object manipulation as a core verb alongside combat.",
    arenaHalfX: 14,
    arenaHalfZ: 14,
    obstacles: [
      // Left wall segment — creates wall slam opportunities
      { x: -8, z: 0, w: 1, h: 2, d: 10 },
      // Right wall segment
      { x: 8, z: -4, w: 1, h: 2, d: 7 },
    ],
    pits: [
      { x: 8, z: 7, w: 3, d: 3 },       // right-back pit
      { x: -8, z: -7, w: 3, d: 3 },      // left-front pit
    ],
    physicsObjects: [
      // Rock: enlarge to reach pressure plate mass threshold (2.0 → 4.0)
      { meshType: 'rock' as const, material: 'stone' as const, x: 0, z: 0, mass: 2.0, health: Infinity, radius: 0.6, suspended: true, suspendHeight: 3.0 },
      // Crate: blocks the door at -Z end, too heavy to push (mass 5.0), shrink to move aside
      { meshType: 'crate' as const, material: 'wood' as const, x: 0, z: -12, mass: 5.0, health: 80, radius: 1.5 },
    ],
    pressurePlates: [
      // Pressure plate: center of room, needs mass >= 3.5 (enlarged rock = 4.0)
      { x: 0, z: 0, radius: 1.2, massThreshold: 3.5 },
    ],
    spawnBudget: {
      maxConcurrent: 6,
      telegraphDuration: 1500,
      packs: [
        // Goblin loitering under the suspended boulder — enlarge the rock to crush it
        { enemies: [{ type: 'goblin', fixedPos: { x: 0, z: 0 }, patrolWaypoints: [{ x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }, { x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }] }], spawnZone: 'ahead' as const },
        { enemies: [{ type: 'goblin' }, { type: 'goblin' }, { type: 'goblin' }], spawnZone: 'ahead' as const },
      ],
    },
    playerStart: { x: 0, z: 11 },
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
    highlights: [
      { target: 'pits', color: 0xff4444 },
    ],
    lockedBends: ['shrink'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 6: "The Arena" — vertical combat: jump, launch, dunk, spike
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Arena',
    profile: 'vertical' as PlayerProfile,
    sandboxMode: true,
    commentary: 'What if combat had a Y-axis? Jump, launch, dunk, spike — the current direction.',
    intro: "What if combat had a Y-axis? Jump, launch enemies into the air, dunk them back down, spike them across the arena. This is the current direction — vertical combat with physics-driven aerial verbs.",
    arenaHalfX: 12,
    arenaHalfZ: 12,
    obstacles: [],
    pits: [],
    heightZones: [
      { x: -6, z: -6, w: 4, d: 4, y: 1.5 },
      { x: 6, z: 6, w: 4, d: 4, y: 1.5 },
    ],
    spawnBudget: {
      maxConcurrent: 10,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(4), 'ahead'),
        pack(goblins(3), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 5 },
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
    frustumSize: 9.6,
    highlights: [{ target: 'platforms', color: 0x4488ff }],
  },
];
