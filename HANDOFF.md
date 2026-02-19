# Vertical Combat Prototype Handoff

> Exploring vertical combat — launch, aerial verbs (dunk, spike), gameplay tags, and 3D movement as core gameplay.

---

## Branch Info
- **Branch:** `explore/vertical`
- **Forked from:** `explore/hades` (which forked from `main`)
- **Last updated:** 2026-02-18

## Current State
**Spike + Dunk both working. Gameplay tag system live. Float selector resolves tap (spike) vs hold (dunk). Stun integration prevents grabbed enemies from attacking.**

The vertical combat system adds a third axis to the Hades prototype:
- **Launch** (E grounded) — launch nearest enemy upward, player hops to follow
- **Float Selector** — shared rising + float phase after launch. During float:
  - **Tap LMB** → spike (enemy becomes homing carrier projectile)
  - **Hold LMB** (180ms) → dunk (grab → slam to aimed landing target)
  - **No input** → float expires, cancel
- **Dunk** (hold LMB during float) — grab launched enemy, slam to aimed landing target with arc trajectory + AoE
- **Spike** (tap LMB during float) — windup → strike → enemy becomes carrier projectile with through-hits and AoE impact
- **Self-slam** (E airborne, no target) — fast ground pound with AoE
- Martial arts punches, jump, all existing melee/dash/force push

### Gameplay Tag System (new)
Lightweight hierarchical tag system inspired by Unreal GAS Gameplay Tags:
- Per-owner storage, dot-separated tags (`State.Aerial.Float`)
- Hierarchical matching: `hasTag(owner, 'State.Aerial')` matches `State.Aerial.Float`
- Player convenience API (no owner arg needed for single-player)
- Single source of truth for aerial state and enemy stun
- Tags: `State.Aerial`, `State.Aerial.Rising`, `State.Aerial.Float`, `State.Aerial.Dunk`, `State.Aerial.Spike`, `State.Stunned`

### Float Selector Architecture
The monolithic dunk was split: Float Selector owns rising + float phases, then transfers to the chosen verb:
```
Launch → Float Selector claims enemy
  rising: both entities rise, decal tracks aim
  float: zero gravity, drift enemy toward player
    tap LMB → transferClaim('spike') → Spike verb takes over
    hold LMB → transferClaim('dunk') → Dunk verb takes over
    timeout → cancel
```

### Entity Carrier System
Spike creates a "carrier" — the enemy mesh becomes a physics projectile:
- Homing toward aimed direction with through-hit damage
- AoE impact at final position
- Carrier is a separate object from the enemy (enemy is "consumed")

## Architecture

```
Gameplay Tags (src/engine/tags.ts):
  - Per-owner hierarchical labels for state management
  - Single source of truth: aerial verbs add/remove tags, systems query them
  - State.Aerial.* = player aerial state, State.Stunned = enemy grab stun

Aerial Verb Framework (src/engine/aerialVerbs.ts):
  Launch → Float Selector → Dunk or Spike (via transferClaim)

  Framework responsibilities:
  - Launch registry, claim protocol, gravity override
  - Tag lifecycle: adds State.Aerial + verb tag on activate, cleans up on end
  - Enemy stun: adds State.Stunned on grab, removes on release
  - Transfer flow: old verb completes, new verb takes over seamlessly
  - Death/pit auto-cancel

Float Selector (src/verbs/floatSelector.ts):
  rising → float → transfer to dunk or spike

Dunk (src/verbs/dunk.ts):
  grab → slam → impact (AoE + damage)

Spike (src/verbs/spike.ts):
  windup → strike → carrier creation → recovery

Entity Carrier (src/engine/entityCarrier.ts):
  Physics projectile with through-hits and AoE impact
```

Design doc: `docs/plans/2026-02-17-aerial-verb-framework-design.md`

## Key Files

| File | Purpose |
|------|---------|
| `src/engine/tags.ts` | Gameplay tag system: hierarchical labels, player convenience API |
| `src/engine/aerialVerbs.ts` | Framework: registry, verb interface, claim protocol, tag lifecycle, stun |
| `src/verbs/floatSelector.ts` | Float selector verb: rising + float + tap/hold input resolution |
| `src/verbs/dunk.ts` | Dunk verb: grab → slam with AoE |
| `src/verbs/spike.ts` | Spike verb: windup → strike → carrier creation |
| `src/engine/entityCarrier.ts` | Entity carrier: physics projectile with through-hits |
| `src/entities/player.ts` | Player: launch trigger, tag-based guards, action lockout, Y physics |
| `src/engine/game.ts` | Game loop: init/update/reset for aerial verbs, carriers, tags |
| `src/engine/physics.ts` | Physics: gravity multiplier from launched entries |
| `src/config/player.ts` | Config: DUNK, LAUNCH, SPIKE, FLOAT_SELECTOR, SELF_SLAM, JUMP |

## Tests
- `tests/tags.test.ts` — 25 tests: core API, hierarchical matching, player API, TAG constants
- `tests/aerial-verbs.test.ts` — 25 tests: registry CRUD, verb dispatch, gravity override
- `tests/dunk-verb.test.ts` — 22 tests: config, state, interface, drift fix math
- `tests/launch.test.ts` — 7 tests: launch config, physics math
- `tests/float-selector.test.ts` — float selector phases, input resolution, BT activation
- `tests/spike-verb.test.ts` — spike verb phases, carrier creation
- **Total: 798 tests (all passing)**

## What Feels Good
- **Spike tap → enemy projectile** — fast and responsive, good complement to dunk's deliberateness
- **Float selector choice** — tap vs hold during float creates a meaningful split-second decision
- **Dunk slam** — launching, catching, and slamming feels like a combo
- **Grabbed enemies don't attack** — State.Stunned on grab makes the aerial sequence feel safe and intentional
- **BT exit ramp** — smooth 250ms ease-in transition from bullet time back to normal speed
- **Seamless decal handoff** — orange selector decal recolors to magenta dunk decal without pop
- Force push bowling, wall slam feedback (from Hades base)

## What Doesn't Work Yet
- **Carrier visual feedback** — enemy-as-projectile needs more juice (trail, spin, impact VFX)
- **No chaining** — can't re-launch enemies that survive aerial verbs
- **Camera** — doesn't adapt during aerial sequences (could track the action better)
- **Mobile movement speed** — may change based on aim direction (unconfirmed, possibly isometric visual illusion)

## Key Config Values
- `BULLET_TIME.exitRampDuration: 250` — ms to ease from BT scale → 1.0 on deactivation
- `FLOAT_SELECTOR.holdThreshold: 180` — ms to distinguish tap (spike) vs hold (dunk)
- `FLOAT_SELECTOR.floatDriftRate: 6` — exponential decay rate for XZ drift during float
- `DUNK.arcRiseVelocity: 8` — upward velocity at grab start (wind-up arc)
- `DUNK.arcXzFraction: 0.3` — fraction of XZ distance covered during rise phase
- `DUNK.floatDuration: 600` — ms of zero-gravity float (aim window)
- `DUNK.floatConvergeDist: 3.5` — Y distance to trigger float
- `DUNK.slamVelocity: -25` — downward speed during slam
- `DUNK.damage: 35` — primary damage on impact
- `DUNK.aoeRadius: 1.5` — splash radius
- `SPIKE.windupDuration: 150` — ms before strike
- `SPIKE.strikeDuration: 100` — ms of strike animation
- `SPIKE.carrierSpeed: 18` — carrier projectile speed
- `SPIKE.carrierDamage: 20` — through-hit damage
- `SPIKE.impactDamage: 30` — AoE impact damage
- `LAUNCH.enemyVelMult: 1.3` — enemy launch velocity multiplier
- `LAUNCH.playerVelMult: 1.15` — player hop velocity multiplier
- `ACTION_LOCKOUT_MS: 300` — post-dunk lockout preventing accidental force push

## Open Questions
- **Carrier juice** — spike carrier needs more visual feedback (trail particles, spin, impact burst)
- **Aerial chaining** — should enemies that survive dunk/spike be re-launchable for combos?
- **Camera during aerials** — should camera pull out or track differently during vertical combat?
- **Tag system extensions** — what other states should get tags? (dashing, charging, blocking, invincible)
- **Effect system + tags** — effect system could add/remove tags for timed stuns, slows, etc.

## What To Do Next
1. **Juice the spike carrier** — trail particles, spin animation, impact VFX
2. **Tune aerial combat feel** — float duration, spike speed, dunk timing
3. **Evaluate vertical combat** — does the launch → choose → execute pattern feel good as a core loop?
4. **Consider chaining** — if enemy survives, can they be re-launched?
5. **Tag system extensions** — add tags for other states as systems need them

## Merge Candidates
- **Gameplay tag system** (`tags.ts`) — general-purpose for any prototype, no dependencies
- **Aerial verb framework** (`aerialVerbs.ts`) — general-purpose for aerial combat prototypes
- **Entity carrier** (`entityCarrier.ts`) — reusable physics projectile system
- Room system, melee, physics (from hades branch, already on explore/vertical)

## Session Log
- **2026-02-18 (session 3)** — Mobile controls polish + dunk targeting fixes. Fixed spike auto-aim (exclude grabbed enemy via `getActiveEnemy()`, not all stunned). BT now slows aerial verbs (changed `dt` → `gameDt`). Added smooth BT exit ramp (250ms ease-in quadratic). BT auto-engages only on confirmed dunk hold (not spike tap). Seamless decal handoff: floatSelector exports `handoffDecal()`, dunk steals Three.js objects during `onClaim`, recolors orange→magenta, skips expand animation. Locked slam targeting at apex — `updateTargeting()` removed from `updateSlam()` so auto-aim no longer drifts landing mid-flight. Removed CATCH! text. Key insight: dunk had no auto-aim of its own but inherited it by reading shared `aimWorldPos` which `autoAimClosestEnemy()` updates every frame on mobile. Next: test feel of locked slam, investigate mobile movement speed issue.
- **2026-02-18 (session 2)** — Mobile 5-button radial fan layout, mobile input wiring, spike/dunk mobile bugs. See commits e45e0e2 through 424c5b6.
- **2026-02-17 (session 3)** — Gameplay tag system + bug fixes + stun integration. Built `src/engine/tags.ts` — hierarchical dot-separated labels (inspired by Unreal GAS). Wired tags into aerial verb framework: verbs declare their tag, framework manages lifecycle. Fixed 4 bugs: stuck floating (gravity vs velocity override ordering), force push in air (unified tag guard replaces scattered per-verb checks), dunk unreachable (float selector now checks `attackHeld` for pre-held LMB), force push on landing (300ms action lockout). Fixed transfer flow bug where framework called wrong verb's onComplete after transferClaim. Added State.Stunned to grabbed enemies so they don't attack during aerial verbs. 782 tests passing. Key decisions: tags are single source of truth for aerial state; multiple systems can add the same tag; enemy AI checks one thing (`hasTag(enemy, TAG.STUNNED)`).
- **2026-02-17 (session 2)** — Built spike verb, float selector, entity carrier system. Float selector owns rising+float, resolves tap (spike) vs hold (dunk) via transferClaim. Spike creates carrier projectile with through-hits and AoE. Fixed spike integration bugs (event bus, two-phase carrier creation). Key decision: selector pattern lets new verbs plug in without touching input code.
- **2026-02-17 (session 1)** — Built aerial verb framework (9-task plan). Extracted dunk from player.ts (~460 lines removed) into extensible system: launch registry + verb modules. Fixed drift bug (exponential lerp). Added rising phase after finding dunk was auto-grabbing before entities gained height. 666 tests, clean build. Design: `docs/plans/2026-02-17-aerial-verb-framework-design.md`. Key decision: Launch is shared infrastructure, everything after launch is verb-specific. Framework is thin (registry + utilities), verbs own their state machines.
