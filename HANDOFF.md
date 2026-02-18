# Vertical Combat Prototype Handoff

> Exploring vertical combat — launch, aerial verbs (dunk, future spike/juggle), and 3D movement as core gameplay.

---

## Branch Info
- **Branch:** `explore/vertical`
- **Forked from:** `explore/hades` (which forked from `main`)
- **Last updated:** 2026-02-17

## Current State
**Aerial verb framework COMPLETE. Dunk reimplemented on extensible system. Ready for playtesting + future verb exploration.**

The vertical combat system adds a third axis to the Hades prototype:
- **Launch** (E grounded) — launch nearest enemy upward, player hops to follow
- **Dunk** (E during float) — grab launched enemy, slam to aimed landing target with arc trajectory
- **Self-slam** (E airborne, no target) — fast ground pound with AoE
- **Aerial strike** (LMB airborne) — spike nearby enemy downward
- Martial arts punches (replaced sword), jump, all existing melee/dash/force push

### Aerial Verb Framework (new this session)
The monolithic dunk code was extracted into an extensible framework:
- **Launch registry** (`src/engine/aerialVerbs.ts`) — tracks launched enemies, claim protocol, gravity overrides
- **Verb interface** — plug-in modules with `rising → float → grab → slam` (or whatever phases a verb needs)
- **Dunk verb** (`src/verbs/dunk.ts`) — first verb on the framework, with drift fix
- **Drift fix** — exponential lerp replaces fixed-speed drift during float; enemy converges in ~100ms regardless of player movement

Future verbs (spike, juggle, co-op toss) just need a new file in `src/verbs/` implementing `AerialVerb`.

## Architecture: Aerial Verb Framework

```
Launch (shared, in aerialVerbs.ts)
  → Enemy gets upward velocity, enters registry
  → Verb claims enemy (exclusive ownership)

Dunk verb (src/verbs/dunk.ts):
  rising → float → grab → slam → impact

Framework responsibilities:
  - Launch registry (add/remove/query)
  - Claim protocol (one verb per enemy)
  - Gravity override utility (per-enemy multiplier)
  - Death/pit auto-cancel
  - Verb registration

Verb responsibilities:
  - State machine + update logic
  - Position sync (attachToPlayer utility for grab verbs)
  - Interrupt policy
  - Damage/resolution
  - Visual effects (decal, trail)
```

Design doc: `docs/plans/2026-02-17-aerial-verb-framework-design.md`
Implementation plan: `docs/plans/2026-02-17-aerial-verb-framework-plan.md`

## Key Files

| File | Purpose |
|------|---------|
| `src/engine/aerialVerbs.ts` | Framework: registry, verb interface, claim protocol, gravity override |
| `src/verbs/dunk.ts` | Dunk verb module: rising→float→grab→slam state machine |
| `src/entities/player.ts` | Player: launch trigger, gravity integration, animation hooks |
| `src/engine/game.ts` | Game loop: initAerialVerbs, updateAerialVerbs, resetAerialVerbs |
| `src/engine/physics.ts` | Physics: uses getLaunchedEntry for gravity multiplier |
| `src/config/player.ts` | Config: DUNK, LAUNCH, SELF_SLAM, AERIAL_STRIKE, JUMP |

## Tests
- `tests/aerial-verbs.test.ts` — 25 tests: registry CRUD, verb dispatch, gravity override
- `tests/dunk-verb.test.ts` — 22 tests: config, state, interface, drift fix math
- `tests/launch.test.ts` — 7 tests: launch config, physics math
- **Total: 666 tests (all passing)**

## What Feels Good
- Force push bowling — pushing a goblin into another goblin is satisfying
- Wall slam feedback — screen shake + damage number + particles + sound
- Launch → dunk flow — launching, catching, and slamming feels like a combo

## What Doesn't Work Yet
- **Needs playtesting** — the aerial verb framework was just built; dunk needs feel validation on the new system
- Dunk float convergence timing may need tuning (floatConvergeDist, floatDuration)
- No second aerial verb yet to validate the framework's extensibility in practice

## Key Config Values
- `DUNK.floatDuration: 600` — ms of zero-gravity float (aim window)
- `DUNK.floatConvergeDist: 3.5` — Y distance to trigger float
- `DUNK.floatDriftSpeed: 3` — XZ convergence speed (exponential lerp factor: 12)
- `DUNK.slamVelocity: -25` — downward speed during slam
- `DUNK.homing: 60` — XZ speed toward landing target
- `DUNK.damage: 35` — primary damage on impact
- `DUNK.aoeRadius: 1.5` — splash radius
- `LAUNCH.enemyVelMult: 1.3` — enemy launch velocity = JUMP.initialVelocity * this
- `LAUNCH.playerVelMult: 1.15` — player hop velocity multiplier

## Open Questions
- Does the dunk feel right on the new system? Float timing, convergence distance, drift speed all tunable.
- **Set & Spike** — next verb to build? Player launches enemy, jumps up, hits enemy as projectile toward aimed location. Would validate the framework's extensibility.
- Should verbs chain? (e.g., enemy survives dunk → re-launch → juggle)
- Camera behavior during aerial verbs — should it follow the action differently?
- Co-op toss — how would the claim system handle another player grabbing a launched enemy?

## What To Do Next
1. **Playtest dunk on new framework** — verify feel matches pre-refactor, tune if needed
2. **Build Set & Spike verb** — validates framework extensibility, adds a second aerial combat option
3. **Tune aerial combat feel** — float duration, convergence, slam speed, AoE radius
4. **Evaluate vertical combat** — does the launch→verb pattern feel good as a core loop?

## Merge Candidates
- **Aerial verb framework** (`aerialVerbs.ts`) — general-purpose for any prototype with aerial combat
- **Physics gravity override** — per-enemy gravity multiplier, useful for slow-mo effects, floating, etc.
- Room system, melee, physics (from hades branch, already on explore/vertical)

## Session Log
- **2026-02-17** — Built aerial verb framework (9-task plan). Extracted dunk from player.ts (~460 lines removed) into extensible system: launch registry + verb modules. Fixed drift bug (exponential lerp). Added rising phase after finding dunk was auto-grabbing before entities gained height. 666 tests, clean build. Design: `docs/plans/2026-02-17-aerial-verb-framework-design.md`. Key decision: Launch is shared infrastructure, everything after launch is verb-specific. Framework is thin (registry + utilities), verbs own their state machines.
