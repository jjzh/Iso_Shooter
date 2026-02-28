# Portfolio Demo — Design Plan

## Context

Jeff wants a playable portfolio piece that walks through his design exploration process as sequential rooms. Each room showcases a different prototype branch's mechanics, with hooks for future commentary explaining design reasoning. The demo serves as a portfolio piece — someone plays through it and experiences the evolution of Jeff's design thinking.

**Why playable over video:** Game companies hire people who make things you can play. A playable demo lets reviewers *feel* the design decisions, not just watch them.

---

## Room Sequence (Linear)

```
Room 1: The Origin — Feb 7 prototype (auto-fire, cylinder+sphere, pure movement)
Room 2: Base combat — melee, dash, pit + force push
Room 3: Physics sandbox — wall slams, enemy-enemy collisions, force push as universal tool
Room 4: Assassin exploration — vision cones, stealth, bullet time (branch Jeff explored + shifted away from)
Room 5: Rule-bending — physics objects (crates/boulders), enlarge/shrink in bullet time
Room 6: Vertical combat — Y-axis, jump, launch, dunk, spike (current direction)
```

Note: Tuning panel and spawn editor are excluded from the portfolio demo build.

- Progression is linear (1->2->3->4->5), no backtracking
- Each room is sandbox (no required combat, door always open)
- Room selector in UI lets you jump to any room directly
- Commentary hooks per room (text/audio added later by Jeff)

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Room structure | Linear, not tree | Avoids round-trip state cleanup complexity |
| Room navigation | Door to next + room selector UI | No save state needed; jump to any room |
| State management | Comprehensive cleanup between rooms | Event-based clear-all for all systems |
| Inputs | Additive, standardized | Shift=dash always; Space=jump when vertical; new abilities layer on |
| Enemy composition | 1-2 types per room | Simpler, reduces integration conflicts |
| Mobile | Required | Touch controls, performance optimization |
| Branch code | Profile-gated superset | Simple string flag ('base'/'assassin'/'rule-bending'/'vertical') in 4 conflict files |

---

## Architecture: Profile-Gated Superset

### How it works
1. New branch `demo/portfolio` off `explore/hades` (has room system, doors, base combat, bullet time)
2. Copy all unique files from each branch (no conflicts — these are new files)
3. Build superset versions of 4 conflict files (`player.ts`, `physics.ts`, `enemy.ts`, `game.ts`) with simple profile gating
4. Room config declares which profile is active — room manager sets it on transition

### Profile system
```typescript
type PlayerProfile = 'origin' | 'base' | 'assassin' | 'rule-bending' | 'vertical';
```
- 5 known profiles: origin (Feb 7 prototype), base, assassin, rule-bending, vertical
- Simple if/else in conflict files, not a plugin architecture
- Each room declares its profile in config

### Input standardization
All inputs are additive across the demo (verified from branch diffs):
- **Always available:** WASD move, Shift=dash, LMB=attack, Q=bullet time, F=interact
- **Room 4+:** Q also toggles bend mode (bullet time + bend selection)
- **Room 5:** Space=jump, E=launch (added on top)
- LMB hold = force push charge (vertical branch already wired this)
- Touch: existing mobile buttons (dash, ultimate) work; may need jump/launch buttons for room 5

### Room transition cleanup
On room exit, fire a `roomCleanup` event or call explicit clear functions:
- `clearEnemies()` — already exists
- `releaseAllProjectiles()` — already exists
- `clearMortarProjectiles()`, `clearIcePatches()` — already exist
- `clearDamageNumbers()` — already exists
- `clearParticles()` — already exists
- `clearEffectGhosts()` — already exists
- **NEW:** `clearVisionCones()` — assassin branch meshes
- **NEW:** `clearPhysicsObjects()` — rule-bending objects
- **NEW:** `clearAerialState()` — vertical tags, carriers, launch indicators, ground shadows
- **NEW:** `resetPlayerToGround()` — ensure player Y=0, no velocity, no aerial state
- **NEW:** `clearHeightZones()` — vertical terrain platforms

### Room selector UI
- Shown on start screen (before game begins) and accessible via pause/menu
- List of rooms with name + 1-line description
- Click to jump directly to any room
- No progression gating — all rooms always available

---

## Room Definitions

### Room 1: "The Foundation"
- **Profile:** base
- **Teaches:** Auto-fire, melee punches, dash, force push, pit kills
- **Layout:** Medium arena, 1-2 pits near walls, a few obstacles
- **Enemies:** 2-3 goblins (simplest enemy, melee only)
- **Commentary hook:** "Starting point: what's the simplest satisfying combat loop?"

### Room 2: "Physics Playground"
- **Profile:** base (same profile, different room design emphasizes physics)
- **Teaches:** Wall slam damage, pushing enemies into each other, force push as spatial tool
- **Layout:** Tighter arena with more walls, multiple pits, obstacles near walls
- **Enemies:** 3-4 goblins (more targets for collision chains)
- **Commentary hook:** "What if the arena is the weapon? Physics-first combat."

### Room 3: "The Shadows"
- **Profile:** assassin
- **Teaches:** Vision cones, stealth positioning, bullet time on detection
- **Layout:** Cover pillars for LOS breaks, wider arena
- **Enemies:** 2-3 goblins with vision cones and patrol behavior
- **Commentary hook:** "I explored: what if enemies couldn't see behind them?"
- **Note:** Need to evaluate assassin branch stability (1 large commit)

### Room 4: "The Workshop"
- **Profile:** rule-bending
- **Teaches:** Physics objects (push crates/boulders), enlarge/shrink in bullet time
- **Layout:** Arena with physics objects scattered, some destructible obstacles
- **Enemies:** 2-3 goblins (targets for object collisions)
- **Commentary hook:** "What if you could bend the rules? Enlarge a boulder, shrink a crate."

### Room 5: "The Arena"
- **Profile:** vertical
- **Teaches:** Jump, launch enemy, float -> dunk or spike, self-slam
- **Layout:** Arena with height zones/platforms, open space for aerial combat
- **Enemies:** 3-4 goblins (launchable targets)
- **Commentary hook:** "What if combat had a Y-axis? The current direction."
- **This is the final room** — avoids needing to clean up vertical state back to base

---

## Files to Modify/Create

### New files (copy from branches, no conflicts)
From assassin: `src/engine/visionCone.ts`, `src/engine/dynamicHazards.ts`, `src/engine/bulletTime.ts`
From rule-bending: `src/config/bends.ts`, `src/engine/bendMode.ts`, `src/engine/bendSystem.ts`, `src/entities/physicsObject.ts`, `src/ui/radialMenu.ts`
From vertical: `src/engine/aerialVerbs.ts`, `src/engine/tags.ts`, `src/engine/entityCarrier.ts`, `src/engine/groundShadows.ts`, `src/config/terrain.ts`, `src/effects/launchPillar.ts`, `src/effects/launchIndicator.ts`, `src/verbs/dunk.ts`, `src/verbs/floatSelector.ts`, `src/verbs/spike.ts`

### Superset files (manual integration from all branches)
- `src/engine/game.ts` — profile-gated update calls for each branch's systems
- `src/entities/player.ts` — profile-gated vertical sections (jump, launch, aerial)
- `src/engine/physics.ts` — additive: Y-axis gravity (vertical) + object physics (rule-bending)
- `src/entities/enemy.ts` — profile-gated vision cones + stealth AI (assassin)
- `src/engine/input.ts` — additive: all input bindings present, consumers decide per profile
- `src/engine/events.ts` — additive: all event types from all branches
- `src/engine/roomManager.ts` — profile switching, sandbox mode, cleanup orchestration
- `src/config/rooms.ts` — new room definitions with profile field
- `src/types/index.ts` — union of all branch type additions
- `src/ui/tuning.ts` — profile-gated tuning sections
- `src/engine/audio.ts` — all sound presets (additive)
- `src/engine/particles.ts` — all particle presets (additive, may need larger pool)

### New files to create
- `src/engine/profileManager.ts` — profile switching, cleanup orchestration
- `src/ui/roomSelector.ts` — room picker UI for start screen
- Commentary hook system (minimal — placeholder for Jeff to author later)

---

## Implementation Phases

### Phase 1: Foundation (1 session)
1. Create `demo/portfolio` branch off `explore/hades` ✅
2. Extend `RoomDefinition` with `profile`, `sandboxMode`, `commentary` fields
3. Implement `profileManager.ts` (setProfile, cleanup, setup)
4. Implement sandbox mode (doors always unlocked immediately)
5. Build room selector UI
6. Define Room 1 + Room 2 layouts (base profile only)
7. Test: play through rooms 1-2, room selector works

### Phase 2: Vertical Room (1-2 sessions) — hardest, do first
1. Copy all vertical-unique files
2. Build superset `player.ts` with vertical code in profile-gated sections
3. Build superset `physics.ts` with Y-axis gravity
4. Wire vertical systems in `game.ts` (aerial verbs, carriers, ground shadows)
5. Add vertical input bindings (jump, launch)
6. Define Room 5 layout with height zones
7. Implement vertical cleanup (resetPlayerToGround, clearAerialState, etc.)
8. Test: room 1 -> room 5, vertical combat works

### Phase 3: Rule-bending Room (1 session)
1. Copy rule-bending unique files
2. Wire physics objects, bend mode, radial menu in game.ts
3. Define Room 4 layout with physics objects
4. Implement rule-bending cleanup (clearPhysicsObjects, reset bend state)
5. Test: room 1 -> room 4 -> room 5, transitions clean

### Phase 4: Assassin Room (0.5-1 session)
1. Evaluate assassin branch stability (read the 1 commit carefully)
2. Copy assassin unique files
3. Wire vision cones + stealth AI in enemy.ts (profile-gated)
4. Define Room 3 layout with cover pillars
5. Implement assassin cleanup (clearVisionCones, reset enemy AI)
6. Test: full linear walkthrough rooms 1-5

### Phase 5: Mobile + Polish (1 session)
1. Add touch buttons for jump/launch (room 5)
2. Test on mobile viewport
3. Performance check: particle pool sizing, object cleanup
4. Add commentary hook placeholders
5. Room transition polish (fade, room name display)
6. Full end-to-end test

---

## Verification

### Per-phase testing
- `npm run build` — clean compile after each phase
- `npm run typecheck` — no TS errors
- Manual playtest: enter each room, use mechanics, exit to next room
- Verify cleanup: after exiting a branch room, no visual artifacts remain

### End-to-end test
1. Open game -> room selector shows 5 rooms
2. Play Room 1 -> Room 2 -> Room 3 -> Room 4 -> Room 5 linearly via doors
3. Use room selector to jump directly to Room 4, then to Room 2
4. Verify no state leakage (no vision cones in Room 4, no physics objects in Room 2, etc.)
5. Test on mobile: touch controls work in all rooms
6. Check particle pool doesn't run dry with all presets loaded

### Risk items to monitor
- **Vertical player.ts integration** — largest single integration task
- **Assassin branch stability** — only 1 commit, may need bug fixes
- **Physics.ts coexistence** — Y-axis gravity + object physics are independent but untested together
- **Mobile performance** — all systems loaded, need to verify framerate

---

## Open Items for Jeff
- [ ] Author commentary text for each room (after demo is built)
- [ ] Decide on commentary format (text cards, voiceover, etc.)
- [ ] Choose which enemy types per room (current plan: goblins only for simplicity)
- [ ] Whether to include archers in any rooms (adds ranged pressure but more complexity)
- [ ] Level editor from rule-bending branch: include or skip? (1302 lines, probably skip for demo)
