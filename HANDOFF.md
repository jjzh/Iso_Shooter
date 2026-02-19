# Portfolio Demo Handoff

> Playable portfolio piece: walk through design exploration as sequential rooms, each showcasing a different prototype branch's mechanics.

---

## Branch Info
- **Branch:** `demo/portfolio`
- **Forked from:** `explore/hades`
- **Last updated:** 2026-02-19

## Current State
**Phase 4 complete. 6 playable demo rooms — all prototype branches integrated. 851 tests pass across 27 test files.**

- Room 1 ("The Origin") — cylinder+sphere player, auto-fire projectiles, no melee/force push, goblins, no pits
- Room 2 ("The Foundation") — fist rig, melee + dash + force push, goblins, 3 pits, pit highlights on entry, no wall slam/collision damage
- Room 3 ("Physics Playground") — fist rig, 3 pits, 4 obstacles, wall slams + enemy collision damage + spatial force push
- Room 4 ("The Shadows") — assassin profile: vision cones, waypoint patrol circuits around pits, detection-based bullet time (cone overlap triggers BT before aggro), push aggro with 250ms delay, 3 pits for force push kills, LOS occlusion
- Room 5 ("The Workshop") — rule-bending profile: Q-toggle bend mode, radial menu (enlarge/shrink), physics objects (rock + crate), pressure plate puzzle, 20×20 arena, wall slams + collision damage
- Room 6 ("The Arena") — vertical combat: jump (Space), launch (E), dunk (hold LMB), spike (tap LMB), aerial strike, 2 raised platforms, tighter camera (9.6 frustum), blue platform highlights on entry
- All rooms are sandbox mode (door starts unlocked, enemies still spawn)
- Room selector on start screen lets you jump to any room
- Player visual swaps between origin model (cylinder+sphere) and fist rig based on room profile
- Tuning panel and spawn editor stripped (portfolio demo, not dev environment)
- HUD shows room name instead of wave number
- HUD grays out abilities not available for current room profile (progressive reveal)
- Mobile buttons: profile-gated radial fan layout (dash/push for base, jump/launch/cancel for vertical)
- Per-room physics flags: `enableWallSlamDamage`, `enableEnemyCollisionDamage` on RoomDefinition
- Bullet time HUD: meter bar + vignette overlay + ceremony text — BT triggered by detection events (cone overlap), not aggro

Design plan: `docs/plans/2026-02-18-portfolio-demo-design.md`
Phase 1 implementation plan: `docs/plans/2026-02-18-portfolio-phase1-foundation.md`
Phase 2 integration plan: `.claude/plans/gentle-purring-otter.md`
Phase 3 design: `docs/plans/2026-02-19-the-shadows-room-design.md`
Phase 3 implementation: `docs/plans/2026-02-19-the-shadows-implementation.md`
Phase 4 design: `docs/plans/2026-02-19-the-workshop-room-design.md`
Phase 4 implementation: `docs/plans/2026-02-19-the-workshop-implementation.md`

## Vision
6 rooms, each showcasing a different stage of Jeff's design exploration:
1. **The Origin** — Feb 7 prototype (auto-fire, cylinder+sphere, pure movement) ✅
2. **The Foundation** — base combat (melee, dash, pit + force push) ✅
3. **Physics Playground** — wall slams, enemy collisions, force push as spatial tool ✅
4. **The Shadows** — assassin branch (vision cones, patrol maze, bullet time) ✅
5. **The Workshop** — rule-bending branch (physics objects, enlarge/shrink, pressure plate) ✅
6. **The Arena** — vertical branch (Y-axis, jump, launch, dunk, spike) ✅

Architecture: profile-gated superset (`'origin' | 'base' | 'assassin' | 'rule-bending' | 'vertical'`). Each room declares its profile. Sandbox mode (no required combat). Room selector UI to jump anywhere.

## Phase 2 Integration Summary (Vertical Combat)
15 tasks completed in a single session:
1. Copied 11 vertical-unique files from `explore/vertical`
2. Added vertical config values (JUMP, LAUNCH, DUNK, SPIKE, etc.)
3. Extended types/events for vertical combat (10 new event types)
4. Rebound inputs: Space=jump, Shift=dash, E=launch
5. Added bullet time exit ramp (250ms smooth deactivation)
6. Added 7 procedural audio sounds + 7 particle presets for vertical events
7. Updated player rig (sword → fists) and animator (5 new animation states)
8. Integrated vertical mechanics into player.ts (profile-gated jump, launch, aerial strike, Y-axis physics)
9. Added Y-axis physics to physics.ts (gravity, airborne guards, launched enemy tracking)
10. Updated enemy.ts (vel.y, carrier skip, tag stun, ledge fall, airborne tumble)
11-12. Wired vertical systems in game.ts and roomManager.ts
13. Added Room 4 definition with heightZones and platform rendering
14. Profile-gated mobile buttons with radial fan layout
15. Copied 13 test files + updated rooms.test.ts

Key architecture decisions:
- Vertical code is purely additive — all existing rooms untouched
- `getActiveProfile() === 'vertical'` gates all vertical mechanics
- Per-room physics flags preserved (vertical branch had removed them)
- Fist model replaces sword globally (visual improvement)
- Platform highlights render at ground level (base of platforms, not top)

## Phase 3 Integration Summary (Assassin Detection)
8 tasks completed in a single session:
1. Copied visionCone.ts from `explore/assassin` (detection cones, LOS occlusion, idle scan)
2. Extended types/events/config: `enemyAggroed` event, `patrol` on EnemyConfig, `aggroRadius`+`patrol` on goblin
3. Wrote vision cone geometry tests (isInsideVisionCone pure function)
4. Added assassin behavior to enemy.ts: aggro indicator, facing helpers, patrol, detection timer, vision cone lifecycle — all profile-gated
5. Wired visionCone init in game.ts (with raycast injection), cleanup in roomManager.ts
6. Added Room 5 definition: 14×14 patrol maze with 3 lane walls, 2 cover pillars, 3 pits
7. Updated tests for 5 rooms + Room 5 specifics
8. Full build + typecheck + all 817 tests pass

Key architecture decisions:
- Bullet time triggers on vision cone overlap (detectionStarted/detectionCleared events), NOT on aggro — gives player a slow-mo reaction window before aggro
- Reference-counted BT activation: `_detectingCount` tracks simultaneous cone overlaps, BT stays active until all clear
- Push aggro uses 250ms delay timer (doesn't trigger BT — only cone detection does)
- Damage instantly aggros regardless of detection state
- `aggroed` defaults to `true` on spawn — non-assassin rooms skip detection entirely
- `getActiveProfile() === 'assassin'` gates all new enemy behavior
- Waypoint patrol: rectangular circuits around pits, slow turn speed (1.2 rad/s), stops walking while turning >45°
- Fixed-position spawning: `SpawnPackEnemy.fixedPos` overrides zone-based spawn resolution
- Detection timer decays faster than it builds (1500ms/s decay vs 1000ms/s build) — forgiving

## Phase 4 Integration Summary (Rule-Bending / The Workshop)
8 commits in a single session:
1. Added PhysicsObject/PressurePlate types, physics config constants, 9 new event types (bend + object + pressure plate)
2. Copied 5 files from `explore/rule-bending`: physicsObject.ts, bends.ts, bendSystem.ts, radialMenu.ts, bendMode.ts
3. Added bendMode input binding (Q key triggers both bulletTime and bendMode)
4. Added physics object velocity, collision, and force push integration to physics.ts (applyObjectVelocities, resolveObjectCollisions, resolvePhysicsObjectBodyCollisions, unified wave occlusion)
5. Wired bend mode in game.ts (profile-gated Q toggle, targeting click/hover, combat input gating during bend mode), room spawning for objects/plates
6. Added Room 5 "The Workshop" definition: 20×20 arena, 3 obstacles, 2 pits, 1 rock (mass 2.0), 1 crate (mass 5.0), 1 pressure plate (threshold 3.5), 3 goblins
7. Added bend system tests, physics object tests, Workshop room tests (including pressure plate mass threshold logic)
8. HUD bend counter (BENDS: X/3) + mobile bend toggle button
9. Pressure plate system: floor zone with mass threshold check, ceremony on activation (glow + screen shake + event)

Key architecture decisions:
- `getActiveProfile() === 'rule-bending'` gates bend mode (Q key becomes bend toggle instead of bullet time toggle)
- Physics objects share force push wave with enemies (unified occlusion)
- Pressure plate activates when object with mass >= threshold rests on it (velocity < 0.5)
- Enlarge doubles mass (2.0 → 4.0, exceeds 3.5 threshold), shrink halves mass (5.0 → 1.5, becomes pushable)
- Bend system is a factory: `createBendSystem(maxBends)` with 3 bends per room, opposite-pole enforcement
- Room arena expanded from 14×14 to 20×20 after playtest feedback

## New Files Created (Phase 4)
- `src/entities/physicsObject.ts` — physics object entity (creation, mesh, bend visuals, cleanup)
- `src/config/bends.ts` — enlarge/shrink bend definitions (scale, mass, radius, color multipliers)
- `src/engine/bendSystem.ts` — bend system factory (apply, undo, reset, tracking)
- `src/ui/radialMenu.ts` — DOM overlay radial menu (enlarge left, shrink right)
- `src/engine/bendMode.ts` — Q-toggle controller (bullet time, radial menu, raycasted targeting, highlight pulsing)
- `src/engine/pressurePlate.ts` — pressure plate system (create, mesh, update, ceremony, cleanup)
- `tests/bends.test.ts` — 10 tests for bend config and system
- `tests/physics-objects-demo.test.ts` — 5 tests for physics object creation

## New Files Created (Phase 3)
- `src/engine/visionCone.ts` — vision cone rendering, color ramp, LOS occlusion, idle scan, `isInsideVisionCone` pure function
- `tests/vision-cone.test.ts` — 8 tests for config + cone geometry

## New Files Created (Phase 2)
- `src/engine/tags.ts` — entity tag system for aerial state tracking
- `src/config/terrain.ts` — height zones for elevated platforms
- `src/engine/aerialVerbs.ts` — aerial verb framework (claim, transfer, gravity overrides)
- `src/engine/entityCarrier.ts` — spiked enemies as physics projectiles
- `src/engine/groundShadows.ts` — ground shadow projections for airborne entities
- `src/effects/launchIndicator.ts` — launch target indicator ring
- `src/effects/launchPillar.ts` — rock pillar visual on launch
- `src/verbs/dunk.ts` — dunk verb (rising → float → grab → slam → impact)
- `src/verbs/floatSelector.ts` — float selector (hold=dunk, tap=spike)
- `src/verbs/spike.ts` — spike verb (fast downward strike + AoE)
- `src/config/mobileControls.ts` — radial fan layout config for mobile buttons
- 13 new test files (tags, terrain, aerial-verbs, dunk-verb, float-selector, spike-verb, entity-carrier, ground-shadows, player-jump, launch, ledge, vertical-physics, input-remap)

## What To Do Next
All 6 rooms complete. Choose next step:
- **Option A: Polish pass** — playtest all 6 rooms end-to-end, tune feel, add commentary UI, room transitions
- **Option B: Deploy** — get the 6-room demo hosted and shareable
- **Option C: Playtest The Workshop** — tune pressure plate position, physics object placement, arena layout, bend feel
- **Option D: Commentary/narrative UI** — add the design exploration narration that makes this a portfolio piece

**Recommendation:** Quick playtest of The Workshop (Option C) to validate the pressure plate puzzle flow, then deploy (Option B).

## Open Questions
- [ ] Whether to include archers in any rooms (adds ranged pressure but more complexity)
- [ ] Room highlight timing/color tuning — current defaults feel good but may want to adjust per room
- [ ] Commentary UI — how to present the design narrative text per room
- [x] ~~Room 5 detection tuning~~ — playtested, iterated: waypoint patrols, detection-based BT, push aggro delay, fixed spawns near pits
- [x] ~~Whether Room 6 adds enough value~~ — resolved: Workshop added as Room 5, all 6 rooms complete
- [x] ~~Vertical integration approach~~ — resolved: profile-gated superset, 15-task plan executed successfully
- [x] ~~Assassin integration approach~~ — resolved: profile-gated, bullet time already wired, 8-task plan executed

## Session Log
- **2026-02-19 (session 7)** — Completed Phase 4: The Workshop (rule-bending room). Designed enlarge/shrink puzzle room with physics objects and pressure plate. Executed 17-task implementation plan via subagent-driven development: copied 5 files from explore/rule-bending, added physics object velocity/collision/force push integration to physics.ts, wired bend mode (profile-gated Q toggle), added Room 5 definition, pressure plate system, HUD bend counter, mobile button. User playtested, requested larger arena (7→10 half-extents) and pressure plate addition. Key decisions: enlarge rock to exceed pressure plate mass threshold (2.0→4.0 > 3.5), shrink crate to make pushable (5.0→1.5); bend mode reuses bullet time visual but gates differently per profile. All 6 rooms now complete. 851 tests across 27 files. Next: playtest Workshop puzzle flow, then deploy.
- **2026-02-19 (session 6)** — Playtested Room 4 "The Shadows" and iterated. Fixed 3 bugs from Phase 3 (force push E-key binding, enemy death in detection block, room 4/5 ordering). Added waypoint patrol system (slow rectangular circuits around pits instead of quick snap-turns). Fixed-position spawning (goblins near each pit). Refactored bullet time to trigger on vision cone overlap (detectionStarted/detectionCleared events with reference counting) instead of aggro — gives slow-mo reaction window before aggro fires. Added push aggro with 250ms delay (doesn't trigger BT). Fixed dash label. Key decisions: BT should feel like a reaction window to cone detection, not a consequence of aggro; push should aggro enemies but not trigger BT. Next: more playtesting, polish pass, or Room 6.
- **2026-02-19 (session 5)** — Completed assassin detection room integration (Phase 3). Designed patrol maze with vision cones as portfolio's detection puzzle room. Executed 8-task plan: copied visionCone.ts, extended types/events/config, added patrol+detection+aggro to enemy.ts (profile-gated), wired systems, added Room 5 "The Shadows" (14×14 maze, 3 walls, 2 pillars, 3 pits, 5 goblins). Key discovery: bullet time was already fully integrated from Phase 2 — just needed to emit `enemyAggroed` event. 817 tests across 25 files all pass. Next: playtest Room 5 to tune detection feel.
- **2026-02-19 (session 4)** — Completed full vertical combat integration (Phase 2). Executed 15-task plan: copied 11 files from explore/vertical, built profile-gated superset versions of player.ts/physics.ts/enemy.ts/game.ts/roomManager.ts, added Room 4 ("The Arena") with heightZones and platform rendering, profile-gated mobile buttons, 7 audio + 7 particle presets, bullet time exit ramp. Added blue platform highlights rendering at ground level. 793 tests across 24 files all pass. Key decisions: fists replace sword globally; Space=jump/Shift=dash/E=launch globally (no-op in non-vertical rooms); per-room physics flags preserved. PR: #3.
- **2026-02-18 (session 3)** — Added "The Origin" room (Room 1) recreating Feb 7 prototype: cylinder+sphere player model, auto-fire projectiles toward cursor, no melee/force push/afterimages. Stripped tuning panel and spawn editor. Added per-room physics flags (`enableWallSlamDamage`, `enableEnemyCollisionDamage`) — Foundation disables both to focus on pit kills, Physics Playground enables both. Added 3 pits to Foundation (was 1). Built room highlight system with vertical corner pillars + gradient glow wall planes that pulse on room entry. HUD now grays out abilities unavailable for current profile (progressive reveal). Highlight system is reusable with configurable color per target type. 531 tests pass. PR: #3.
- **2026-02-18 (session 2)** — Implemented Phase 1: Foundation. Added PlayerProfile type, extended RoomDefinition with profile/sandboxMode/commentary. Created profileManager skeleton with cleanup/setup hooks. Implemented sandbox mode (door unlocks immediately on room load). Replaced 5 Hades rooms with 2 demo rooms (The Foundation + Physics Playground). Built room selector UI on start screen. Updated HUD to show room name. 516 tests pass, clean build. Key decisions: sandbox mode = enemies still spawn but door is always open; room selector is start-screen only for now (will add to pause menu later); profileManager is a thin skeleton — future phases fill in cleanup logic per profile.
- **2026-02-18 (session 1)** — Feasibility analysis and design planning. Explored all 4 branch codebases, mapped file conflicts (player.ts, physics.ts, enemy.ts, game.ts are the 4 conflict surfaces). Evaluated 3 approaches: kitchen sink merge (too risky), system modules (over-engineered), profile-gated superset (right-sized). Resolved edge cases: linear progression, room selector UI, standardized inputs, comprehensive cleanup, vertical as final room. Estimated ~5-7 sessions total. Created branch and design doc.
