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
- **Last updated:** 2026-02-14

## Current State
**Phase 1 COMPLETE + Room & Spawn Rework COMPLETE + Stealth Feel Pass COMPLETE. Ready for playtesting.**

The full action roguelike loop is functional with a physics-first combat system, reworked room/spawn system, and a stealth feel pass that makes enemy awareness readable and manipulable:
- Click-to-attack melee with generous arc, auto-targeting, hit pause
- 4 enemy types with telegraph → attack → recovery state machines (all used)
- **5 rectangular rooms** with escalating difficulty — player enters from one end, progresses forward
- **Incremental pack spawning** — enemies spawn in groups of 2-3 with telegraphs, escalating pressure
- **Door system** — physical door at far wall unlocks on room clear, player walks through to transition
- **Rest room** (Room 4) — heals player, door auto-opens after brief pause
- **Victory room** (Room 5) — empty celebration, boss designed separately
- **Ice Mortar Imp** integrated into Room 3 for area denial variety
- Physics-based knockback, wall slam, enemy collision, force push wave occlusion, pit falls
- **Vision cone LOS occlusion** — enemies cannot detect through walls/obstacles
- **Detection timer** — 250ms in-cone+LOS required before aggro (no instant clips)
- **Detection color ramp** — cone fills green→yellow→orange→red as detection builds
- **Tighter cones** — 48° half-angle (down from 60°), reduced aggro radii across all enemies
- **Aggro ceremony** — red flash hold + "!" indicator above enemy on aggro
- **Goblin patrol** — back-and-forth patrol along facing axis with terrain collision reversal
- **Spawn safety** — enemies won't spawn within 6 units of player
- **Additional cover** — ~10 new pillars across rooms 1-3 for LOS breaks
- **Bullet time polish** — infinite mode, relocated meter, screen vignette, ceremony text
- **Facing system rearchitected** — `mesh.rotation.y` is single source of truth, `facingAngle` eliminated entirely
- All 620 automated tests passing, clean typecheck, clean build

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
- **Total: 616 tests (all passing)**

## What Feels Good
- Force push bowling — pushing a goblin into another goblin is satisfying
- Wall slam feedback — screen shake + damage number + particles + sound on impact
- Wave occlusion — intuitive blocking behavior, front enemies shield back enemies
- Detection color ramp — green→yellow→orange→red makes awareness state instantly readable
- LOS occlusion — ducking behind a pillar to break detection feels intentional and satisfying
- Goblin patrol — random facing + staggered pauses make goblins feel alive, not scripted
- Aggro ceremony — the "!" pop + red flash gives a clear "you've been spotted" moment
- Cover play — new pillars create stealth corridors and meaningful positioning choices
- Bullet time vignette — screen effect sells the time-slow with minimal visual overhead

## What Doesn't Work Yet
- Melee knockback removed (was competing with force push for same design role) — melee is now pure damage
- Need more playtesting to tune physics values (friction, wall slam damage, impact thresholds)
- Detection timer value (250ms) may need per-enemy tuning — one size fits all might not work for archers vs goblins
- Goblin patrol distance/speed relative to room size needs playtesting — might patrol off meaningful sightlines
- Cover pillar placement is hand-tuned — no procedural cover generation yet

### ✅ RESOLVED: Enemy Facing / Movement / Vision Cone — Rearchitected
**Status: Rearchitected. `facingAngle` eliminated, `mesh.rotation.y` is single source of truth. Needs visual playtesting to confirm fix.**

The old system maintained two angle spaces (`facingAngle` in atan2-space, `mesh.rotation.y` in THREE-space) with a fragile conversion formula. This caused persistent moonwalking bugs across 5+ fix attempts. The root cause: `sin(facingAngle)/cos(facingAngle)` produced the opposite direction from what the visual `mesh.rotation.y` showed.

**New architecture:** Two helper functions define the entire angle system:
```typescript
getForward(rotY)  → { x: -sin(rotY), z: -cos(rotY) }  // forward from rotation.y
rotationToFace(dx, dz) → atan2(-dx, -dz)               // rotation.y to face direction
```
All behaviors, vision cone checks, and movement use these two functions. No angle conversion anywhere. Cone geometry also fixed to face -Z at rotation.y=0 (matching the model), so copying rotation.y from model to cone aligns them without any offset.

## Key Config Values
- `PHYSICS.friction: 25` — deceleration rate, higher = snappier stop
- `PHYSICS.pushInstantRatio: 0` — pure velocity, no teleport
- `PHYSICS.wallSlamDamage: 8` — damage per unit of speed above threshold
- `PHYSICS.enemyBounce: 0.4` — enemy-enemy restitution
- `PHYSICS.pushWaveBlockRadius: 0.8` — lateral blocking distance for wave occlusion
- Enemy masses: goblin 1.0, archer 0.8, imp 0.9, golem 3.0
- Vision cone half-angle: 48° (down from 60°)
- Aggro radii: goblin 8 (was 10), archer 11 (was 14), imp 13 (was 16), golem 6 (was 8)
- Detection timer: 250ms (tunable via slider)
- Aggro hold timer: 250ms red flash before 1s fade
- Goblin patrol: distance 6, speed 1.2, pauseMin 500ms, pauseMax 1500ms
- Spawn `minPlayerDist: 6` — minimum distance from player for enemy spawns
- `BULLET_TIME.infinite: 1` — skips meter drain (tunable, 0 to disable)

## Open Questions
- Melee swing animation: how elaborate does it need to be for the swing to read clearly?
- Auto-targeting generosity: how much should melee snap to nearby enemies?
- Room transition: should there be a brief screen effect (flash/fade) or is instant swap fine?
- Physics tuning: are current friction/damage/stun values in the right ballpark?
- Should the push instant ratio slider be removed entirely now that we've committed to pure velocity?
- Detection timer: should it be per-enemy-type? Archers (long range) might want longer detection than goblins (close patrol)
- Patrol: should other enemy types patrol, or is it goblin-only flavor?
- Cover generation: should rooms 4+ get procedural cover placement, or keep hand-tuned?
- Bullet time infinite mode: is this for dev/tuning only, or does it stay as a gameplay option?
- Aggro ceremony: does the "!" indicator need to persist longer for readability at a glance?

## Merge Candidates
- Room system (`roomManager.ts`, `rooms.ts` data format) — will be needed by heist and other prototypes
- Melee combat system — could be reused in souls prototype
- Enemy telegraph/recovery state machine — general-purpose for any action prototype
- `MOB_GLOBAL` multiplier pattern — useful for any prototype with enemies
- `meleemath.ts` pure arc detection — testable, no THREE dependency
- **Physics system** (velocity, wall slam, enemy collision, wave occlusion) — general-purpose for any action prototype
- **Vision cone LOS system** (detection timer, color ramp, LOS raycast) — directly needed by heist prototype for stealth gameplay
- **Patrol behavior** (back-and-forth with terrain collision) — useful for heist guard routes, souls enemy placement
- **Spawn safety** (`minPlayerDist`) — should be on main, prevents frustrating spawn-on-top-of-player moments

## What To Do Next
1. **🔴 PLAYTEST: Verify facing rearchitecture in-game** — facing system was rearchitected (facingAngle → mesh.rotation.y single source of truth). Needs visual verification: do goblins patrol without moonwalking? Do cones point where models face? Does aggro trigger correctly? If cone looks backward, flip `thetaStart` back in visionCone.ts (see risk note below).
2. **Playtest with stealth feel** — walk through rooms 1-3, test LOS cover play, patrol timing, detection ramp readability
3. **Tune detection values** — use new tuning sliders: detect time, aggro hold, patrol dist/speed/pause
4. **Tune spawn pacing** — use "Spawn Pacing" tuning section (telegraph duration, cooldown, max concurrent multiplier, spawn distances)
5. **Tune door feel** — use "Door" tuning section (unlock duration, interact radius, rest pause)
6. **Evaluate stealth + combat balance** — does the detection timer make stealth viable without making combat too easy to avoid?
7. **Cover layout iteration** — are the new pillars creating interesting stealth routes, or just clutter?
8. **Camera check** — verify isometric camera handles the longer rectangular rooms well, adjust frustum if needed
9. **Design boss encounter** — Room 5 is currently empty; design the golem boss fight separately
10. **Evaluate scaffolding** — does the 5-room loop feel good enough to layer a twist on top?
11. **If ready for twist:** choose from `docs/DESIGN_EXPLORATION.md`, start Phase 2

## Systems Added (Room & Spawn Rework Session)
- **Rectangular arena** (`src/config/arena.ts`) — `ARENA_HALF_X` + `ARENA_HALF_Z` for different width vs depth. `setArenaConfig` accepts both dimensions.
- **Incremental spawn system** (`src/engine/roomManager.ts`) — pack dispatch algorithm. Enemies spawn in groups of 2-3 with telegraphs. Escalating pressure: `maxConcurrent` controls ceiling, kills open slots for new packs.
- **Spawn position resolver** (`src/engine/roomManager.ts`) — dynamic position resolution based on `spawnZone` (ahead/sides/far/behind) relative to player position. Validates against obstacles and pits.
- **Door system** (`src/engine/door.ts`) — physical door at far wall (+Z). States: locked → unlocking (animation) → open. Player walks within `interactRadius` to trigger transition.
- **Door audio** (`src/engine/audio.ts: playDoorUnlock`) — 4-note ascending arpeggio on room clear
- **Door particles** (`src/engine/particles.ts: DOOR_UNLOCK_BURST`) — upward blue-white burst on door unlock
- **Heal audio** (`src/engine/audio.ts: playHeal`) — warm ascending tone on rest room entry
- **Spawn config** (`src/config/spawn.ts`) — tunable: telegraphDuration, spawnCooldown, maxConcurrentMult, spawnAheadMin/Max
- **Door config** (`src/config/door.ts`) — tunable: unlockDuration, interactRadius, restPause
- **5 room definitions** (`src/config/rooms.ts`) — The Approach (goblins), The Crossfire (+ archers), The Crucible (+ imps), The Respite (rest), The Throne (victory)
- **New types** (`src/types/index.ts`) — `SpawnPack`, `RoomSpawnBudget`, `SpawnZone`
- **New events** (`src/engine/events.ts`) — `roomClearComplete`, `doorUnlocked`, `doorEntered`, `spawnPackTelegraph`, `spawnPackSpawned`, `restRoomEntered`, `playerHealed`
- **Telegraph: imp type** (`src/engine/telegraph.ts`) — added `iceMortarImp` geometry (sphere) + label

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
- **2026-02-13** — Room & spawn rework. Rectangular arena (ARENA_HALF_X/Z), 5 rooms with escalating difficulty, incremental pack spawn system with telegraphs, door system with unlock animation + audio + particles, rest room (heal to full), victory room. Added ice mortar imp to Room 3. New tuning sections: "Spawn Pacing" and "Door". New configs: `spawn.ts`, `door.ts`. New file: `door.ts`. Rewrote `roomManager.ts` with pack dispatch algorithm. 552 tests passing, clean build.
- **2026-02-13** — Stealth feel pass. Vision cone LOS occlusion (enemies can't detect through walls), detection timer (250ms in-cone+LOS before aggro), detection color ramp (green→yellow→orange→red), tighter cones (48° from 60°), reduced aggro radii. Aggro ceremony (red flash hold + "!" indicator). Goblin patrol (back-and-forth with terrain collision). Spawn safety (minPlayerDist: 6), ~10 additional cover pillars. Bullet time polish (infinite mode, meter relocation, vignette, ceremony text). 8 new tuning sliders, 64 new tests. 616 tests passing, clean build.
- **2026-02-14** — Facing/rotation fix session (2 sessions). Fixed 180° model+cone inversion with `-facingAngle + Math.PI` formula and cone-copies-model approach. Attempted moonwalk fix by switching movement from `_toPlayer` vector to `sin(facingAngle)/cos(facingAngle)` forward vector, and changing retreat to turn-away-then-walk-forward. Moonwalking persists despite all changes. Math spot-checks verify the formula but user reports it's wrong visually in-game. **Decision: needs ground-up rearchitect with visual test harness.** 620 tests passing, clean build.
- **2026-02-14** — Facing system rearchitecture. Eliminated `facingAngle` entirely — `mesh.rotation.y` is now the single source of truth. Added `getForward(rotY)` and `rotationToFace(dx,dz)` helper functions. Updated all 13 turnToward() callers, 6 forward vector computations, vision cone angle check, idle scan, cone geometry thetaStart (now faces -Z matching model), enemy arc decal geometry+rotation, event types. Zero `facingAngle` references remain. Files changed: enemy.ts (major), visionCone.ts (moderate), events.ts, particles.ts, enemy-rework.test.ts (minor). Key risk: cone thetaStart change — if cone looks backward in-game, flip it back. 620 tests passing, clean build. **Next: visual playtest to confirm moonwalking is fixed.**

## Systems Added (Stealth Feel Pass)
- **Vision cone LOS** (`src/entities/enemy.ts`) — `raycastTerrainDist()` slab-method ray-AABB checks whether player is visible through obstacles. Detection blocked when LOS is occluded.
- **Detection timer** (`src/entities/enemy.ts`) — 250ms cumulative in-cone+LOS time required before aggro. Timer resets when player leaves cone or LOS breaks. Tunable via slider.
- **Detection color ramp** (`src/engine/visionCone.ts`) — cone material transitions green→yellow→orange→red as detection timer fills. Provides instant readability of enemy awareness state.
- **Aggro hold timer** (`src/engine/visionCone.ts`) — 250ms solid red hold before 1s fade on aggro trigger. Prevents the red flash from being too brief to notice.
- **Aggro indicator** (`src/entities/enemy.ts`) — red cone+dot "!" pops above enemy on `enemyAggroed` event. Bobs and fades over ~1s. Subscribes to event bus.
- **Goblin patrol** (`src/entities/enemy.ts`) — back-and-forth patrol along initial facing axis. Config: distance 6, speed 1.2, pauseMin 500ms, pauseMax 1500ms. Terrain collision reversal via `pointHitsTerrain()`. Random initial facing + random pause durations.
- **Patrol-aware cone scan** (`src/engine/visionCone.ts`) — idle sinusoidal scan skipped for patrolling enemies; patrol controls facing directly.
- **Facing system** (`src/entities/enemy.ts`) — `mesh.rotation.y` is single source of truth. `getForward()` and `rotationToFace()` helpers replace all angle conversion. `facingAngle` property eliminated entirely.
- **Spawn safety** (`src/engine/roomManager.ts`, `src/config/spawn.ts`) — `minPlayerDist: 6` prevents enemies from spawning within 6 units of player.
- **Additional cover** (`src/config/rooms.ts`) — ~10 new obstacle pillars in rooms 1-3 for LOS breaks and stealth corridors.
- **Bullet time infinite mode** (`src/engine/bulletTime.ts`) — `infinite: 1` in BULLET_TIME config skips meter drain. Tunable via slider.
- **Bullet time meter relocation** (`src/ui/hud.ts`) — meter moved from bottom-center to top-left (below health bar, 220px wide).
- **Bullet time vignette** (`src/ui/hud.ts`) — blue radial gradient + inner glow overlay during bullet time with 0.3s CSS transition.
- **Bullet time ceremony text** (`src/ui/hud.ts`) — "BULLET TIME ENGAGED" / "BULLET TIME ENDED" at top-center with letter-spacing + glow effect.
- **Patrol type** (`src/types/index.ts`) — `patrol?` optional field added to `EnemyConfig`.
- **8 new tuning sliders** (`src/ui/tuning.ts`) — detect time, aggro hold, patrol dist/speed/pauseMin, infinite BT, min player dist.
- **64 new slider validation tests** (`tests/tuning-config.test.ts`) — validates all new tuning slider configs.
