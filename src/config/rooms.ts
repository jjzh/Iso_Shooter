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
  date?: string;
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
    name: 'Origin',
    date: 'Feb 7',
    profile: 'origin',
    sandboxMode: true,
    commentary: "Where I started: auto-fire, simple shapes, simple movement.",
    intro: "This was the first hackathon build — Auto-fire projectiles, a cylinder-and-sphere player model, WASD movement. It's simplified to one enemy type here but there are more.",
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
    name: 'Foundations',
    date: 'Feb 8',
    profile: 'base',
    sandboxMode: true,
    commentary: "How does adding displacement affect combat? What about hazards?",
    intro: "Activate force-push with E or press-and-hold LMB. Dash past goblins and push them into pits.\n\nOn mobile: tap the Push button to attack, press and hold to charge force-push.",
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
      maxConcurrent: 3,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 16 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "Physics Playground" — walls + pits, force push as spatial tool
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Add More Physics',
    date: 'Feb 12',
    profile: 'base',
    sandboxMode: true,
    commentary: "Can we extend physics-first combat further?",
    intro: "Can we extend physics more and lean into the isometric camera. Knocking enemies into each other and terrain is satisfying. Players have more options in second-to-second gameplay.",
    enableWallSlamDamage: true,
    enableEnemyCollisionDamage: true,
    arenaHalfX: 9,
    arenaHalfZ: 16,
    obstacles: [
      { x: -5, z: 0, w: 2, h: 2, d: 2 },
      { x: 5, z: 0, w: 2, h: 2, d: 2 },
      { x: 0, z: -8, w: 4, h: 1.5, d: 1 },
      { x: -3, z: 8, w: 1.5, h: 2, d: 1.5 },
    ],
    pits: [
      { x: -6, z: -6, w: 3, d: 3 },
      { x: 6, z: 4, w: 3, d: 3 },
      { x: 0, z: -12, w: 4, d: 3 },
    ],
    spawnBudget: {
      maxConcurrent: 4,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'far'),
        pack(goblins(2), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 12 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 4: "The Shadows" — patrol maze, vision cones, detection puzzle
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Tension & Sneak',
    date: 'Feb 14',
    profile: 'assassin' as PlayerProfile,
    sandboxMode: true,
    commentary: "How do we add tension? How can we slow the game down?",
    intro: "What does an assassination or heist variation of the sandbox look like? How can we make the experience accessible? Bullet-time automatically activates when you get spotted or use Q to trigger it manually.",
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
      maxConcurrent: 3,
      telegraphDuration: 1500,
      packs: [
        // Pit 1 (x:8, z:5) — right side, 1 goblin patrolling
        {
          enemies: [
            { type: 'goblin', fixedPos: { x: 11, z: 3 }, patrolWaypoints: [{ x: 11, z: 3 }, { x: 11, z: 7 }, { x: 5, z: 7 }, { x: 5, z: 3 }] },
          ],
          spawnZone: 'ahead' as const,
        },
        // Pit 2 (x:-8, z:-1) — left side, 1 goblin patrolling
        {
          enemies: [
            { type: 'goblin', fixedPos: { x: -5, z: -3 }, patrolWaypoints: [{ x: -5, z: -3 }, { x: -5, z: 1 }, { x: -11, z: 1 }, { x: -11, z: -3 }] },
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
    name: 'Puzzles & Magic',
    date: 'Feb 15',
    profile: 'rule-bending' as PlayerProfile,
    sandboxMode: true,
    commentary: "What does magic look like? Enlarge a rock, shrink a crate...",
    intro: "What if you could bend the rules of the world? How can we incorporate magic in a way that supports the sandbox?\n\nBuilding off of Bullet-time, use Q to enlarge the floating rock. This room explores layering puzzle gameplay in the sandbox.",
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
        // Goblin frozen under the suspended boulder — enlarge the rock to crush it
        { enemies: [{ type: 'goblin', fixedPos: { x: 0, z: 0 }, frozen: true }], spawnZone: 'ahead' as const },
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
    name: 'Physics Playground',
    date: 'Feb 16',
    profile: 'vertical' as PlayerProfile,
    sandboxMode: true,
    commentary: "What if combat had a real Z-axis? Jump, launch, spike, and dunk. What if terrain had more levels of height?",
    intro: "What if we also leaned into the Z-axis of the game? Use the launch button to send enemies into the air! Tap to spike them volleyball. Press and hold to bullet-time dunk. What if terrain had more levels of height?",
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
