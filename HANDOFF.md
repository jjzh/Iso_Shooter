# Portfolio Demo Handoff

> Playable portfolio piece: walk through design exploration as sequential rooms, each showcasing a different prototype branch's mechanics.

---

## Branch Info
- **Branch:** `demo/portfolio`
- **Forked from:** `explore/hades`
- **Last updated:** 2026-02-19

## Current State
**Phase 2 complete. 4 playable demo rooms with vertical combat fully integrated. 793 tests pass across 24 test files.**

- Room 1 ("The Origin") — cylinder+sphere player, auto-fire projectiles, no melee/force push, goblins, no pits
- Room 2 ("The Foundation") — fist rig, melee + dash + force push, goblins, 3 pits, pit highlights on entry, no wall slam/collision damage
- Room 3 ("Physics Playground") — fist rig, 3 pits, 4 obstacles, wall slams + enemy collision damage + spatial force push
- Room 4 ("The Arena") — vertical combat: jump (Space), launch (E), dunk (hold LMB), spike (tap LMB), aerial strike, 2 raised platforms, tighter camera (9.6 frustum), blue platform highlights on entry
- All rooms are sandbox mode (door starts unlocked, enemies still spawn)
- Room selector on start screen lets you jump to any room
- Player visual swaps between origin model (cylinder+sphere) and fist rig based on room profile
- Tuning panel and spawn editor stripped (portfolio demo, not dev environment)
- HUD shows room name instead of wave number
- HUD grays out abilities not available for current room profile (progressive reveal)
- Mobile buttons: profile-gated radial fan layout (dash/push for base, jump/launch/cancel for vertical)
- Per-room physics flags: `enableWallSlamDamage`, `enableEnemyCollisionDamage` on RoomDefinition

Design plan: `docs/plans/2026-02-18-portfolio-demo-design.md`
Phase 1 implementation plan: `docs/plans/2026-02-18-portfolio-phase1-foundation.md`
Phase 2 integration plan: `.claude/plans/gentle-purring-otter.md`

## Vision
6 rooms, each showcasing a different stage of Jeff's design exploration:
1. **The Origin** — Feb 7 prototype (auto-fire, cylinder+sphere, pure movement) ✅
2. **The Foundation** — base combat (melee, dash, pit + force push) ✅
3. **Physics Playground** — wall slams, enemy collisions, force push as spatial tool ✅
4. **The Arena** — vertical branch (Y-axis, jump, launch, dunk, spike) ✅
5. **The Shadows** — assassin branch (vision cones, stealth, bullet time)
6. **The Workshop** — rule-bending branch (physics objects, enlarge/shrink)

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
Start Phase 3: Choose next room to integrate
- **Option A: "The Shadows" (assassin)** — vision cones, stealth, bullet time as primary mechanic
- **Option B: "The Workshop" (rule-bending)** — physics objects, enlarge/shrink
- **Option C: Polish pass** — playtest all 4 rooms, tune feel, add commentary UI, transitions
- **Option D: Deploy** — get the 4-room demo hosted and shareable

**Recommendation:** A polish pass (Option C) would be high-value before adding more rooms — make the existing 4 feel great, then decide if rooms 5-6 are worth the integration effort.

## Open Questions
- [ ] Whether to include archers in any rooms (adds ranged pressure but more complexity)
- [ ] Room highlight timing/color tuning — current defaults feel good but may want to adjust per room
- [ ] Commentary UI — how to present the design narrative text per room
- [ ] Whether rooms 5-6 add enough value vs. polishing the existing 4
- [x] ~~Vertical integration approach~~ — resolved: profile-gated superset, 15-task plan executed successfully

## Session Log
- **2026-02-19 (session 4)** — Completed full vertical combat integration (Phase 2). Executed 15-task plan: copied 11 files from explore/vertical, built profile-gated superset versions of player.ts/physics.ts/enemy.ts/game.ts/roomManager.ts, added Room 4 ("The Arena") with heightZones and platform rendering, profile-gated mobile buttons, 7 audio + 7 particle presets, bullet time exit ramp. Added blue platform highlights rendering at ground level. 793 tests across 24 files all pass. Key decisions: fists replace sword globally; Space=jump/Shift=dash/E=launch globally (no-op in non-vertical rooms); per-room physics flags preserved. PR: #3.
- **2026-02-18 (session 3)** — Added "The Origin" room (Room 1) recreating Feb 7 prototype: cylinder+sphere player model, auto-fire projectiles toward cursor, no melee/force push/afterimages. Stripped tuning panel and spawn editor. Added per-room physics flags (`enableWallSlamDamage`, `enableEnemyCollisionDamage`) — Foundation disables both to focus on pit kills, Physics Playground enables both. Added 3 pits to Foundation (was 1). Built room highlight system with vertical corner pillars + gradient glow wall planes that pulse on room entry. HUD now grays out abilities unavailable for current profile (progressive reveal). Highlight system is reusable with configurable color per target type. 531 tests pass. PR: #3.
- **2026-02-18 (session 2)** — Implemented Phase 1: Foundation. Added PlayerProfile type, extended RoomDefinition with profile/sandboxMode/commentary. Created profileManager skeleton with cleanup/setup hooks. Implemented sandbox mode (door unlocks immediately on room load). Replaced 5 Hades rooms with 2 demo rooms (The Foundation + Physics Playground). Built room selector UI on start screen. Updated HUD to show room name. 516 tests pass, clean build. Key decisions: sandbox mode = enemies still spawn but door is always open; room selector is start-screen only for now (will add to pause menu later); profileManager is a thin skeleton — future phases fill in cleanup logic per profile.
- **2026-02-18 (session 1)** — Feasibility analysis and design planning. Explored all 4 branch codebases, mapped file conflicts (player.ts, physics.ts, enemy.ts, game.ts are the 4 conflict surfaces). Evaluated 3 approaches: kitchen sink merge (too risky), system modules (over-engineered), profile-gated superset (right-sized). Resolved edge cases: linear progression, room selector UI, standardized inputs, comprehensive cleanup, vertical as final room. Estimated ~5-7 sessions total. Created branch and design doc.
