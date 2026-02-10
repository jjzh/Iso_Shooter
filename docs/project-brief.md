# Project: Isometric Wave Battler — Hackathon Build

## Context
This is a submission for the Supercell Global AI Game Hack. We have **less than 24 hours** to ship. The team is two people: one game/product designer and one gameplay/UI engineer. Prioritize shipping a playable, polished-feeling core loop over feature breadth. Every decision should optimize for "playable and impressive in under 24 hours."

## Game Overview
An isometric wave-based action game inspired by Brawl Stars and Squad Busters. The player controls a single character navigating a dungeon arena, fighting through 3 waves of enemies plus a boss encounter. The game should feel satisfying to play moment-to-moment — responsive movement, punchy combat, clear visual feedback.

**Setting:** Fantasy dungeon — dark environment with neon/emissive visual styling. Simple geometry with glowing edges, emissive enemy silhouettes, dark ground. This aesthetic makes placeholder art look intentional and ensures combat readability.

**Win condition:** Survive all 3 waves + defeat the boss.
**Lose condition:** Player health reaches zero.

## Tech Stack
- **Platform:** Web (desktop-first). Must run in modern browsers (Chrome, Firefox, Safari).
- **Rendering:** Three.js (r128 via CDN: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`)
- **No build tools.** Start as a single HTML file with `<script>` tags. Refactor into ES modules only if complexity demands it.
- **Local dev:** `npx serve .` in the project root. No bundler, no framework.
- **Hosting:** GitHub Pages for sharing/demo. Repo should be push-to-deploy ready.

## Controls (Desktop)
- **WASD:** Movement (translate joystick-to-isometric mapping from prototype)
- **Mouse position:** Aim direction (character always faces toward cursor)
- **Auto-fire:** Player automatically shoots projectiles toward the cursor at a fixed interval (e.g., every 200ms). No click to fire.
- **Abilities:** 2-3 active abilities bound to keyboard keys (e.g., Shift, Space, E) with cooldown timers visualized in the HUD.
- **Future consideration:** These inputs will eventually map to dual-stick + buttons on mobile, so keep input handling abstracted into a clean input manager that reads from an input state object rather than directly from event listeners in game logic.

## Camera
- **Isometric orthographic camera** that follows the player.
- **Scrolling arena** — the level is larger than one screen.
- Camera should have slight smoothing/lerp on follow (don't snap rigidly to player position).
- The isometric angle should match the prototype: camera at position `(20, 20, 20)` looking at the player, using orthographic projection.

## Core Architecture

### Data-Driven Design (CRITICAL)
The designer on the team needs to be able to tune gameplay without touching game logic code. Structure the project so that **enemy types, wave compositions, ability definitions, drop tables, and boss behavior** are all defined in configuration objects/files that are clearly separated from the game engine code.

Example structure:
```js
// config/enemies.js
export const ENEMY_TYPES = {
  goblin: {
    name: 'Goblin',
    health: 30,
    speed: 3.5,
    damage: 10,
    attackRange: 1.5,
    behavior: 'rush',        // moves directly toward player
    color: 0xff4466,
    emissive: 0xff2244,
    size: { radius: 0.3, height: 0.8 },
    drops: { currency: { min: 1, max: 3 }, healthChance: 0.1 }
  },
  skeletonArcher: {
    name: 'Skeleton Archer',
    health: 20,
    speed: 2.0,
    damage: 15,
    attackRange: 12,
    attackRate: 1500,         // ms between shots
    behavior: 'kite',        // maintains distance, shoots projectiles
    projectile: { speed: 8, color: 0xaa44ff, size: 0.1 },
    color: 0xaa88ff,
    emissive: 0x8844cc,
    size: { radius: 0.25, height: 1.0 },
    drops: { currency: { min: 2, max: 4 }, healthChance: 0.05 }
  },
  crystalGolem: {
    name: 'Crystal Golem',
    health: 80,
    speed: 1.5,
    damage: 25,
    attackRange: 2.0,
    behavior: 'tank',        // slow, high HP, charges periodically
    color: 0x44ddff,
    emissive: 0x2288cc,
    size: { radius: 0.5, height: 1.4 },
    drops: { currency: { min: 3, max: 6 }, healthChance: 0.2 }
  }
};

// config/waves.js
export const WAVES = [
  {
    wave: 1,
    spawns: [
      { type: 'goblin', count: 6, delay: 500 },
    ],
    message: 'Wave 1 — The dungeon stirs...'
  },
  {
    wave: 2,
    spawns: [
      { type: 'goblin', count: 4, delay: 300 },
      { type: 'skeletonArcher', count: 3, delay: 800 },
    ],
    message: 'Wave 2 — They brought ranged support.'
  },
  {
    wave: 3,
    spawns: [
      { type: 'goblin', count: 6, delay: 200 },
      { type: 'skeletonArcher', count: 4, delay: 600 },
      { type: 'crystalGolem', count: 2, delay: 1500 },
    ],
    message: 'Wave 3 — The ground shakes.'
  }
];

// config/boss.js
export const BOSS = {
  name: 'The Warden',
  health: 300,
  speed: 2.0,
  damage: 30,
  size: { radius: 0.8, height: 2.0 },
  color: 0xff8800,
  emissive: 0xff4400,
  phases: [
    { healthThreshold: 1.0, behavior: 'chase', attackRate: 1000 },
    { healthThreshold: 0.5, behavior: 'enrage', attackRate: 600, speed: 3.0, spawnMinions: { type: 'goblin', count: 3 } },
  ]
};

// config/abilities.js
export const ABILITIES = {
  dash: {
    name: 'Shadow Dash',
    key: 'Shift',
    cooldown: 3000,

    // Core feel parameters — these are the main tuning knobs
    duration: 200,              // ms — how long the dash lasts
    distance: 5,                // units — total distance traveled
    curve: 'easeOut',           // 'linear' | 'easeOut' | 'easeIn' | 'easeInOut'
                                //   easeOut = fast start, decelerates (snappy, responsive)
                                //   easeIn = slow start, accelerates (windup feel)
                                //   linear = constant speed (mechanical)

    // Invincibility
    invincible: true,           // i-frames during dash
    iFrameStart: 0,             // ms into dash before i-frames begin (0 = instant)
    iFrameEnd: 200,             // ms into dash when i-frames end (match duration for full invincibility)

    // Direction
    directionSource: 'movement',// 'movement' = dash toward WASD direction
                                // 'aim' = dash toward cursor
                                // 'movementOrAim' = WASD if moving, cursor if stationary

    // Visual feedback
    afterimageCount: 3,         // number of ghost silhouettes left behind
    afterimageFadeDuration: 300,// ms for each afterimage to fade out
    ghostColor: 0x44ffaa,       // afterimage tint
    trailColor: 0x44ff88,       // dash trail color
    screenShakeOnStart: 1.5,    // px, 0 to disable

    // Recovery
    canShootDuring: false,      // can player fire projectiles mid-dash?
    canAbilityCancel: false,    // can other abilities interrupt the dash?
    endLag: 50,                 // ms of input lockout after dash ends (0 = instant recovery)

    description: 'Dash forward, briefly invincible'
  },
  aoeBlast: {
    name: 'Arcane Nova',
    key: 'Space',
    cooldown: 8000,
    radius: 4,
    damage: 40,
    knockback: 3,
    description: 'Blast all nearby enemies'
  },
  ultimate: {
    name: 'Neon Barrage',
    key: 'E',
    cooldown: 20000,
    duration: 3000,
    fireRateMultiplier: 4,
    damageMultiplier: 1.5,
    description: 'Massively increased fire rate and damage'
  }
};

// config/player.js
export const PLAYER = {
  maxHealth: 100,
  speed: 6,
  fireRate: 200,             // ms between auto-shots
  projectile: { speed: 16, damage: 10, color: 0x44ff88, size: 0.12 },
  size: { radius: 0.35, height: 1.2 }
};
```

These configs should be the ONLY thing the designer needs to edit to change how the game feels. The game engine reads from these configs and never hardcodes gameplay values.

### Enemy Behaviors

**IMPLEMENTATION PRIORITY: Dash ability should be built first among abilities.** It's the core feel mechanic and needs the most iteration. The dash system should read every parameter from config so the designer can rapidly tune duration, distance, easing curve, i-frame windows, direction source, and recovery without code changes. Build a complete dash with afterimage visuals before touching the other abilities — a great-feeling dash carries the whole game; mediocre abilities are fine.

Implement these as simple behavior functions, not a full state machine. Keep them dumb but distinct:

- **`rush`**: Move directly toward player. Attack when in range. No pathfinding — just vector toward player each frame.
- **`kite`**: If distance to player < preferred range, move away. If distance > preferred range, move closer. Shoot projectiles at the player periodically.
- **`tank`**: Move toward player slowly. Periodically charge (increase speed briefly, deal extra damage on contact). Flash/telegraph before charging.
- **Boss phases**: Switch behavior when health crosses thresholds defined in config.

Do NOT implement pathfinding. Enemies that walk through obstacles is acceptable for this prototype.

### Object Pooling
Pre-allocate pools for projectiles (player + enemy), currency pickups, and health pickups. Reuse meshes instead of creating/destroying. This matters for mobile performance later and prevents GC stutters.

### Game State
Keep all mutable game state in a single state object:
```js
const gameState = {
  phase: 'playing',      // 'playing' | 'waveComplete' | 'bossPhase' | 'gameOver' | 'victory'
  currentWave: 0,
  playerHealth: 100,
  currency: 0,
  enemies: [],
  projectiles: [],
  pickups: [],
  waveTimer: 0,
  abilities: { dash: { cooldownRemaining: 0 }, aoeBlast: { cooldownRemaining: 0 }, ultimate: { cooldownRemaining: 0, active: false } }
};
```

## Visual Style

### Aesthetic: Dark Neon Dungeon
- **Ground:** Dark slate/charcoal plane with a subtle grid pattern (neon-tinted grid lines, low opacity).
- **Walls/obstacles:** Dark geometry with faint emissive edges (think Tron meets dungeon crawler).
- **Player character:** Built from simple Three.js primitives (cylinder body, sphere head). Bright green/teal emissive glow. Aim indicator cone in front.
- **Enemies:** Each type has a distinct emissive color (red-pink goblins, purple archers, cyan golems, orange boss). Should be instantly distinguishable by silhouette + color.
- **Projectiles:** Small glowing spheres with matching emissive colors. Player = green, enemy = their type color.
- **Pickups:** Health = pulsing red/pink glow. Currency = pulsing gold/yellow glow. Both should bob up and down slightly.
- **Hit feedback:** Enemy flashes white for 2-3 frames on hit. Slight knockback in the projectile's direction. Screen shake on player taking damage (subtle — 2-3px for 100ms).
- **Abilities:** Dash leaves a brief afterimage trail. AoE blast is an expanding ring of light. Ultimate changes the player's emissive to bright white/gold.
- **Wave transitions:** Brief text overlay ("Wave 2 — They brought ranged support.") that fades in/out. 2-3 second pause between waves.
- **Arena:** Rectangular dungeon floor (~40x40 units) with some scattered obstacle boxes. Walls at the perimeter (can be simple tall boxes with emissive top edges).

### HUD
- **Health bar:** Top-left, horizontal bar. Green to red gradient as health decreases.
- **Ability cooldowns:** Bottom-center, 3 icons/boxes showing ability key binding + circular cooldown sweep overlay. Glow when ready.
- **Currency counter:** Top-right, small coin icon + number.
- **Wave indicator:** Top-center, "Wave 1/3" or "BOSS" text.
- **Use HTML overlay for HUD, not Three.js.** It's faster to build and style, and it stays crisp at any resolution.

## Scope Tiers

### Must-Ship (MVP — aim to finish in first ~12 hours)
1. WASD movement with isometric mapping
2. Mouse aim + auto-fire
3. 3 enemy types with distinct behaviors (rush, kite, tank)
4. 3 waves with escalating composition
5. 1 boss with at least 2 phases
6. Player health + health drops from enemies
7. Currency drops (visual only — just a counter, no spending yet)
8. 2-3 abilities with cooldowns
9. HUD (health, abilities, wave counter, currency)
10. Game over screen + restart
11. Victory screen on boss kill
12. Hit feedback (flash, knockback, screen shake)

### Stretch Goals (if time remains)
13. Mistral AI integration — between waves, send player performance data (clear time, health remaining, abilities used, enemies killed by type) to Mistral API and have it adjust next wave composition dynamically. This is the hackathon's "AI hook." Mistral endpoint: `https://api.mistral.ai/v1/chat/completions`. Model: `mistral-large-latest`. Credits available with code at `https://mistral-credits-app-production.up.railway.app/h/supercell-game-hack/` (password: GamingHack). The prompt to Mistral should describe available enemy types and ask it to return a JSON wave config.
14. Chests in the arena that cost currency to open, granting a random power-up.
15. Power-up selection screen between waves (choose 1 of 3 buffs).
16. Sound effects (howler.js or simple Web Audio API).
17. Mobile virtual joystick support (nipplejs) as an alternate input mode.
18. Minimap showing enemy positions.

## File Structure
```
/
├── index.html            # Entry point, loads everything
├── style.css             # HUD and overlay styles
├── config/
│   ├── player.js         # Player stats, projectile config
│   ├── enemies.js        # Enemy type definitions
│   ├── waves.js          # Wave compositions
│   ├── boss.js           # Boss definition
│   └── abilities.js      # Ability definitions
├── engine/
│   ├── game.js           # Main game loop, state management
│   ├── input.js          # Input manager (keyboard + mouse → input state)
│   ├── renderer.js       # Three.js scene setup, camera, lighting
│   ├── physics.js        # Collision detection (distance-based)
│   ├── pools.js          # Object pools for projectiles/pickups
│   └── spawner.js        # Wave spawning logic
├── entities/
│   ├── player.js         # Player entity (movement, shooting, abilities)
│   ├── enemy.js          # Enemy entity + behavior implementations
│   ├── boss.js           # Boss entity + phase logic
│   ├── projectile.js     # Projectile update logic
│   └── pickup.js         # Health/currency pickup logic
├── ui/
│   ├── hud.js            # HUD updates (health bar, cooldowns, wave text)
│   └── screens.js        # Game over, victory, wave transition overlays
└── ai/
    └── mistral.js        # (Stretch) Mistral API integration for adaptive waves
```

## Working Agreements

### For the Designer (tuning gameplay)
Edit ONLY files in `/config/`. Change enemy stats, wave compositions, ability cooldowns, player values. Refresh browser to test. The game should never require code changes to adjust difficulty or encounter design.

### For the Engineer (building systems)
Own everything in `/engine/`, `/entities/`, and `/ui/`. The game loop in `game.js` should be the single orchestrator — it reads config, updates entities, checks collisions, manages state transitions. Keep entity logic in entity files, not scattered across the loop.

### Git Workflow
Both working on `main` (no time for branch workflows at a hackathon). Communicate before editing the same file. Config files and engine files should have zero overlap, so conflicts should be rare.

## Key Technical Notes
- **Isometric input mapping:** Screen-space input must be rotated into isometric world space. The camera faces along (-1, -1, -1). Screen-right maps to world vector (1, 0, -1) normalized. Screen-up maps to world vector (-1, 0, -1) normalized.
- **No pathfinding.** Enemies move directly toward their target. This is a deliberate scope decision.
- **Collision = distance checks.** `if (distanceBetween(a, b) < a.radius + b.radius)` is sufficient. No physics engine.
- **Object pooling from the start.** Don't create/destroy Three.js meshes at runtime. Pre-allocate and reuse.
- **requestAnimationFrame game loop** with delta time. Cap dt at 50ms to prevent spiral-of-death on tab-switch.
- **Window resize handler** that updates the orthographic camera's aspect ratio.
