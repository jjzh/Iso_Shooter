# Hades Prototype Handoff

> Action roguelike scaffolding — the base game that twists and generative surfaces will be layered onto.

---

## The Twist
**Phase 1 has no twist yet.** We're building the minimum genre scaffolding first. The twist (strongest candidates: Bullet Time / Near-Miss, Absorb / Redirect) will be chosen after the base game feels right. See `docs/DESIGN_EXPLORATION.md` for the full candidate list and pairing matrix.

## Design Hypothesis
**Deferred until Phase 2.** Phase 1's question is simpler: "Does the base action roguelike loop feel good enough to evaluate twists on top of?"

**Status:** ready for playtesting

## Genre Scaffolding
The minimum viable action roguelike shell:
- Melee combat (click-to-attack) — because the twist candidates all assume a core combat verb that isn't auto-fire
- Force push (keep from main) — utility verb, sandbox tool for pushing enemies into pits/walls. Potential basis for future generative twist (elemental variants: push via water, lightning, etc.)
- Enclosed room arenas with pits — because pacing/encounter design requires bounded spaces, and pits make force push immediately interesting
- Room clear → auto-transition → next room — the roguelike loop
- Death → restart at room 1 — the genre's core contract
- Dash (already exists) — primary defensive/mobility verb AND gap-closer for melee

**Verb set:** Melee (left click) + Dash (space) + Force Push (E, hold to charge)

## Vertical Slice Target
- **Duration:** ~1 minute
- **What you'd experience:** Spawn in room 1, fight goblins and an archer with melee + dash + force push, shove a goblin into a pit, clear the room, auto-transition to room 2, face a golem + mixed enemies, either die (restart) or clear it

## Reference Games
- Hades — melee feel (fast swings, VERY generous hit areas, cancel into dash), room pacing, environmental hazards
- Dead Cells — melee weight and hit feedback, enemy telegraphs
- Katana Zero — enemy telegraph → player punish loop, one-hit-kill tension

## Generative Surface
None identified yet for Phase 1. Phase 2/3 will add this. See `docs/DESIGN_EXPLORATION.md` → "Exogenous Context Twist Candidates" for candidates.

## Cross-Pollination Notes
- (none yet — first prototype)

---

## Branch Info
- **Branch:** `explore/hades`
- **Forked from:** `main`
- **Last updated:** 2026-02-12

## Current State
**Phase 1 COMPLETE + Physics system implemented. Ready for combat tuning.**

The full action roguelike loop is functional with a physics-first combat system:
- Click-to-attack melee with generous arc, auto-targeting, hit pause
- 4 enemy types reworked with telegraph → attack → recovery state machines
- 2 hand-coded rooms with distinct layouts and escalating difficulty
- Room clear → 1.5s pause → auto-transition to next room
- Death → restart at room 1
- **Physics-based knockback** — all forces go through velocity system (no teleport)
- **Wall slam** — enemies take damage + stun when knocked into walls at speed
- **Enemy-enemy collision** — mass-weighted separation + momentum transfer + impact damage
- **Force push wave occlusion** — push wave stops at first enemies, back enemies get bowled into
- **Pit falls from knockback** — force push can knock enemies into pits
- All 509 automated tests passing, clean typecheck, clean build

## Phase 1 Build Plan — COMPLETED

### 1. Melee Combat System ✅
- Left click → melee swing in aim direction with 380ms cooldown
- Generous hit arc (2.4rad ~137°) with auto-targeting snap (3.0 range, 2.8rad cone)
- Multi-hit: hits ALL enemies in arc per swing (Hades style, Set-based tracking)
- Hit feedback: HIT_SPARK particles, screen shake, damage numbers, hit pause (40ms freeze frame)
- Swing animation: wind-up (0-30%) + follow-through (30-100%) with torso twist and arm sweep
- Audio: procedural swing whoosh + punchy thump on hit
- Tuning panel: full Melee section with 9 sliders

### 2. Enemy Rework for Melee Combat ✅
- **Goblin:** telegraph (300ms flash) → lunge attack (0.8u forward, 100ms) → recovery (400ms punish window)
- **Stone Golem:** heavy melee swing (700ms telegraph, 2.0rad arc, 2.5 range, 30 damage) → 800ms recovery. Charge attack unchanged.
- **Skeleton Archer:** hitscan AoE rect replaced with real dodgeable projectile. Telegraph (pulsing emissive 800ms) → fires visible arrow (speed 12, dodgeable).
- **Ice Mortar Imp:** unchanged (already works well for melee game)
- **MOB_GLOBAL** multiplier system: speedMult, damageMult, healthMult, telegraphMult, recoveryMult — all exposed in tuning panel
- Contact damage gated for enemies with melee config (use state machine instead)

### 3. Room System ✅
- Room definitions (`src/config/rooms.ts`) — 2 rooms with obstacles, pits, spawns, player start
- Room manager (`src/engine/roomManager.ts`) — loads rooms, swaps arena config, rebuilds visuals, spawns enemies
- Arena config setter (`setArenaConfig`) + collision bounds invalidation
- Replaces wave runner on this branch

### 4. Room Clear → Auto-Transition ✅
- All enemies dead → emit `roomCleared` event → audio celebration chime
- 1.5s pause → auto-load next room
- Last room clear → "VICTORY!" announce

### 5. Death → Restart at Room 1 ✅
- Existing game over screen → click restart → `loadRoom(0)` → full state reset

---

## Systems Added
- **Melee config** (`src/config/player.ts: MELEE`) — damage: 25, range: 2.2, arc: 2.4rad (~137°), cooldown: 380ms, knockback: 1.5, autoTargetRange: 3.0, autoTargetArc: 2.8rad (~160°), screenShake: 1.5, hitPause: 40ms
- **Melee math** (`src/engine/meleemath.ts`) — pure math arc detection, no THREE dependency (testable)
- **Melee hit detection** (`src/engine/physics.ts: checkMeleeHits`) — arc+range check, damage, knockback, feedback
- **Enemy melee state machine** (`src/entities/enemy.ts`) — `startEnemyMelee`, `updateEnemyMelee` — telegraph/attack/recovery with visual feedback
- **MOB_GLOBAL** (`src/config/enemies.ts`) — global multipliers for tuning all mobs at once
- **Room definitions** (`src/config/rooms.ts`) — 2 rooms: "The Pit" (small, goblins+archer) and "The Gauntlet" (medium, mixed+golem)
- **Room manager** (`src/engine/roomManager.ts`) — load/unload/transition/restart logic

## Systems Modified (from main)
- **Input** (`src/engine/input.ts`) — added `attack` boolean to inputState, left-click mousedown listener
- **Player** (`src/entities/player.ts`) — removed auto-fire projectile, added melee state machine with multi-hit Set tracking, auto-targeting, swing animation pass-through, `setPlayerPosition` export
- **Player animator** (`src/entities/playerAnimator.ts`) — added `'swing'` animation state with wind-up/follow-through phases
- **Physics** (`src/engine/physics.ts`) — added `checkMeleeHits`, gated contact damage for melee enemies
- **Audio** (`src/engine/audio.ts`) — added `playMeleeSwing`, `playMeleeHit`, wired `meleeSwing`/`meleeHit`/`roomCleared` events
- **Particles** (`src/engine/particles.ts`) — added meleeSwing particle effect
- **Tuning panel** (`src/ui/tuning.ts`) — added Melee section (9 sliders), Mob Global section (5 sliders), melee audio sliders
- **Game loop** (`src/engine/game.ts`) — added hit pause system, replaced wave runner with room manager
- **Events** (`src/engine/events.ts`) — added `meleeSwing`, `meleeHit`, `roomCleared` event types
- **Enemy config** (`src/config/enemies.ts`) — added MOB_GLOBAL, melee configs for goblin and stoneGolem
- **Enemy** (`src/entities/enemy.ts`) — added melee state machine, MOB_GLOBAL speed multipliers, archer fires real projectile, stun cancels melee attacks
- **Arena** (`src/config/arena.ts`) — added `setArenaConfig` for room swaps, `ARENA_HALF` now mutable
- **Types** (`src/types/index.ts`) — added `attack` to InputState, `melee` to EnemyConfig

## Tests
- `tests/melee.test.ts` — 24 tests: config validation, arc math, multi-hit, auto-targeting
- `tests/enemy-rework.test.ts` — 59 tests: MOB_GLOBAL, goblin/golem/archer configs, state machine math, arc checks, all enemy type validation
- `tests/rooms.test.ts` — 24 tests: room definitions, arena config swap, room progression
- `tests/physics-velocity.test.ts` — 24 tests: velocity formula, friction stop distance, wall slam thresholds, knockback math
- `tests/physics-collision.test.ts` — 22 tests: enemy collision config, mass-weighted separation, elastic collision, impact damage
- `tests/push-wave.test.ts` — 15 tests: wave occlusion logic, lateral blocking, edge cases
- **Total: 509 tests (all passing)**

## What Feels Good
- Force push bowling — pushing a goblin into another goblin is satisfying
- Wall slam feedback — screen shake + damage number + particles + sound on impact
- Wave occlusion — intuitive blocking behavior, front enemies shield back enemies

## What Doesn't Work Yet
- Melee knockback removed (was competing with force push for same design role) — melee is now pure damage
- Need more playtesting to tune physics values (friction, wall slam damage, impact thresholds)

## Key Config Values
- `PHYSICS.friction: 25` — deceleration rate, higher = snappier stop
- `PHYSICS.pushInstantRatio: 0` — pure velocity, no teleport
- `PHYSICS.wallSlamDamage: 8` — damage per unit of speed above threshold
- `PHYSICS.enemyBounce: 0.4` — enemy-enemy restitution
- `PHYSICS.pushWaveBlockRadius: 0.8` — lateral blocking distance for wave occlusion
- Enemy masses: goblin 1.0, archer 0.8, imp 0.9, golem 3.0

## Open Questions
- Melee swing animation: how elaborate does it need to be for the swing to read clearly?
- Auto-targeting generosity: how much should melee snap to nearby enemies?
- Room transition: should there be a brief screen effect (flash/fade) or is instant swap fine?
- Physics tuning: are current friction/damage/stun values in the right ballpark?
- Should the push instant ratio slider be removed entirely now that we've committed to pure velocity?

## Merge Candidates
- Room system (`roomManager.ts`, `rooms.ts` data format) — will be needed by heist and other prototypes
- Melee combat system — could be reused in souls prototype
- Enemy telegraph/recovery state machine — general-purpose for any action prototype
- `MOB_GLOBAL` multiplier pattern — useful for any prototype with enemies
- `meleemath.ts` pure arc detection — testable, no THREE dependency
- **Physics system** (velocity, wall slam, enemy collision, wave occlusion) — general-purpose for any action prototype

## What To Do Next
1. **Playtest combat feel** — focus on force push bowling, wall slams, pit kills
2. **Tune physics values** — friction, wall slam damage/stun, impact thresholds, wave block radius (all in tuning panel)
3. **Tune enemy feel** — adjust MOB_GLOBAL multipliers (telegraph/recovery timing is critical for the punish loop)
4. **Evaluate scaffolding** — does the base loop feel good enough to layer a twist on top?
5. **If yes:** choose twist candidate from `docs/DESIGN_EXPLORATION.md`, start Phase 2
6. **If no:** identify what's missing and iterate on Phase 1

## Systems Added (Physics Session)
- **Velocity knockback** (`src/engine/physics.ts: applyVelocities`) — enemies get velocity vectors, friction decelerates to zero, stepped substeps prevent wall tunneling
- **Wall slam** (`src/engine/physics.ts`) — wall impact above speed threshold deals damage, stun, screen shake, particles, bounce reflection
- **Enemy-enemy collision** (`src/engine/physics.ts: resolveEnemyCollisions`) — O(n²) pairwise circle-circle, mass-weighted separation, 2D elastic collision with restitution, impact damage above speed threshold
- **Force push wave occlusion** (`src/engine/physics.ts`) — project enemies into push-local coords (forward + lateral), sort nearest-first, block farther enemies within lateral radius of nearer pushed enemies
- **Pit fall from knockback** (`src/engine/physics.ts: applyVelocities`) — check pits during velocity substeps, enemies with active velocity skip pit collision in checkCollisions
- **Physics config** (`src/config/physics.ts: PHYSICS`) — all physics parameters in one config object, all exposed in tuning panel
- **Enemy mass** (`src/config/enemies.ts`) — mass values per enemy type (goblin 1.0, archer 0.8, imp 0.9, golem 3.0)
- **Enemy impact audio** (`src/engine/audio.ts: playEnemyImpact`) — mid-pitched collision thud, wired to event bus
- **Enemy impact particles** (`src/engine/particles.ts: ENEMY_IMPACT_SPARK`) — orange spark burst on collision

## Session Log
- **2025-02-12** — Created HANDOFF.md with Phase 1 build plan. Design exploration captured in docs/DESIGN_EXPLORATION.md.
- **2026-02-12** — Started Phase 1. Added MELEE config, left-click input wiring, and melee swing trigger with event bus emission. Removed auto-fire projectile from player.
- **2026-02-12** — Completed Phase 1 (all 5 steps). Melee combat with hit detection, auto-targeting, animation, audio. Enemy rework with telegraph/attack/recovery state machines, MOB_GLOBAL multipliers, archer real projectile. Room system with 2 rooms, auto-transition, death restart. 395 tests passing, clean build.
- **2026-02-12** — Physics session. Built velocity knockback, wall slam, enemy-enemy collision, force push wave occlusion, pit falls from knockback. Removed melee knockback (competing with force push). Committed to pure velocity (pushInstantRatio=0, no teleport). 509 tests passing, clean build. Session context captured in `docs/SESSION_CONTEXT_PHYSICS.md`.
