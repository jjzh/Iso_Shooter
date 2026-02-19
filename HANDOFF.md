# Portfolio Demo Handoff

> Playable portfolio piece: walk through design exploration as sequential rooms, each showcasing a different prototype branch's mechanics.

---

## Branch Info
- **Branch:** `demo/portfolio`
- **Forked from:** `explore/hades`
- **Last updated:** 2026-02-18

## Current State
**Phase 1.5 complete. 3 playable demo rooms with origin prototype recreation, profile-based visual/mechanic switching, dev tools stripped.**

- Room 1 ("The Origin") — cylinder+sphere player, auto-fire projectiles, no melee/force push, goblins, no pits
- Room 2 ("The Foundation") — bipedal rig, melee + dash + force push, goblins, 1 pit
- Room 3 ("Physics Playground") — bipedal rig, 3 pits, 4 obstacles, wall slams + spatial force push
- All rooms are sandbox mode (door starts unlocked, enemies still spawn)
- Room selector on start screen lets you jump to any room
- Player visual swaps between origin model (cylinder+sphere) and bipedal rig based on room profile
- Tuning panel and spawn editor stripped (portfolio demo, not dev environment)
- HUD shows room name instead of wave number

Design plan: `docs/plans/2026-02-18-portfolio-demo-design.md`
Phase 1 implementation plan: `docs/plans/2026-02-18-portfolio-phase1-foundation.md`

## Vision
6 rooms, each showcasing a different stage of Jeff's design exploration:
1. **The Origin** — Feb 7 prototype (auto-fire, cylinder+sphere, pure movement) ✅
2. **The Foundation** — base combat (melee, dash, pit + force push) ✅
3. **Physics Playground** — wall slams, enemy collisions, force push as spatial tool ✅
4. **The Shadows** — assassin branch (vision cones, stealth, bullet time)
5. **The Workshop** — rule-bending branch (physics objects, enlarge/shrink)
6. **The Arena** — vertical branch (Y-axis, launch, dunk, spike)

Architecture: profile-gated superset (`'origin' | 'base' | 'assassin' | 'rule-bending' | 'vertical'`). Each room declares its profile. Sandbox mode (no required combat). Room selector UI to jump anywhere.

## New Files Created (Phase 1)
- `src/engine/profileManager.ts` — setProfile, cleanup/setup hooks, resetProfile
- `src/ui/roomSelector.ts` — populates start screen with room buttons
- `tests/profile-manager.test.ts` — 6 tests for profile manager
- `tests/room-selector.test.ts` — data contract tests (not created yet — tests are in rooms.test.ts)

## Modified Files (Phase 1)
- `src/types/index.ts` — added `PlayerProfile` type
- `src/config/rooms.ts` — new `RoomDefinition` fields (profile, sandboxMode, commentary), replaced 5 Hades rooms with 2 demo rooms
- `src/engine/roomManager.ts` — profile switching on room load, sandbox mode (unlockDoor immediately), getCurrentRoomName getter
- `src/ui/screens.ts` — accepts `onStartAtRoom` callback, wires room selector
- `src/engine/game.ts` — passes room selector callback to initScreens
- `src/ui/hud.ts` — shows room name instead of "Wave N"
- `index.html` — room selector HTML on start screen, updated title
- `style.css` — room selector styles
- `tests/rooms.test.ts` — rewritten for 2-room demo structure

## What To Do Next
Start Phase 2: Vertical Room (hardest integration — do it next)
1. Copy all vertical-unique files from `explore/vertical`
2. Build superset `player.ts` with vertical code in profile-gated sections
3. Build superset `physics.ts` with Y-axis gravity
4. Wire vertical systems in `game.ts` (aerial verbs, carriers, ground shadows)
5. Add vertical input bindings (jump, launch)
6. Define Room 6 layout with height zones
7. Implement vertical cleanup (resetPlayerToGround, clearAerialState, etc.)
8. Test: room 1 → room 6, vertical combat works

**Note:** `explore/vertical` has had significant changes since the original plan — mobile controls, tag system, entity carrier, float selector, spike verb, BT exit ramp. Update the Phase 2 file list before starting.

## Open Questions
- [ ] Manual playtest needed — sandbox mode + room selector haven't been browser-tested yet
- [ ] Room 2 currently has goblins only — plan says it should emphasize physics (wall slams, collisions). May want to add more enemies or tighter walls to really showcase force push spatial play
- [ ] Whether to include archers in any rooms (adds ranged pressure but more complexity)

## Session Log
- **2026-02-18 (session 3)** — Added "The Origin" room (Room 1) recreating Feb 7 prototype: cylinder+sphere player model, auto-fire projectiles toward cursor, no melee/force push/afterimages. Player visual swaps between origin model and bipedal rig based on room profile. Stripped tuning panel and spawn editor from demo (dead code, tree-shaken by esbuild). Removed `editorPaused` phase and `toggleEditor` input. Added `'origin'` to PlayerProfile union. Updated tests for 3-room structure. 531 tests pass, clean build + typecheck.
- **2026-02-18 (session 2)** — Implemented Phase 1: Foundation. Added PlayerProfile type, extended RoomDefinition with profile/sandboxMode/commentary. Created profileManager skeleton with cleanup/setup hooks. Implemented sandbox mode (door unlocks immediately on room load). Replaced 5 Hades rooms with 2 demo rooms (The Foundation + Physics Playground). Built room selector UI on start screen. Updated HUD to show room name. 516 tests pass, clean build. Key decisions: sandbox mode = enemies still spawn but door is always open; room selector is start-screen only for now (will add to pause menu later); profileManager is a thin skeleton — future phases fill in cleanup logic per profile.
- **2026-02-18 (session 1)** — Feasibility analysis and design planning. Explored all 4 branch codebases, mapped file conflicts (player.ts, physics.ts, enemy.ts, game.ts are the 4 conflict surfaces). Evaluated 3 approaches: kitchen sink merge (too risky), system modules (over-engineered), profile-gated superset (right-sized). Resolved edge cases: linear progression, room selector UI, standardized inputs, comprehensive cleanup, vertical as final room. Estimated ~5-7 sessions total. Created branch and design doc.
