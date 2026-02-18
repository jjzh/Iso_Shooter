# Spike Verb + Multi-Verb Selection Design

> Add a spike aerial verb and restructure launch flow so players choose between dunk and spike during the float window.

## Core Flow

```
E (grounded) → launch enemy
  → registerLaunch(enemy)
  → claim for 'floatSelector'
  → activateVerb('floatSelector', enemy)

Rising phase (both entities rise under normal gravity)
  → wait for convergence (same logic as previous dunk rising phase)

Float phase (zero-G, drift convergence)
  → charge UI appears, player aims
  → LMB press starts hold timer

  ┌─ Tap LMB (release < holdThreshold) ──→ transfer claim to 'spike' verb
  │
  ├─ Hold LMB (hold ≥ holdThreshold) ────→ transfer claim to 'dunk' verb
  │
  └─ Float expires (no input) ───────────→ cancel, normal physics resume
```

Launch no longer auto-claims for dunk. It claims for the `floatSelector`, which owns the float phase and resolves to a specific verb based on player input.

## Architecture: Selector Verb Pattern

The float selector is a legitimate verb that owns the "deciding what to do" phase. This pattern generalizes beyond aerial verbs — any context where player input resolves between multiple abilities (ground combo finishers, stance-switching, context-sensitive interactions) could use a selector.

### Framework Addition

`transferClaim(enemy, toVerbName)` — selector calls this to hand off claim ownership and activate the resolved verb. Small addition to `aerialVerbs.ts`.

## Float Selector Verb

File: `src/verbs/floatSelector.ts`

Implements `AerialVerb` interface.

### Phases: rising → float → resolved

| Phase | What happens | Transition |
|-------|-------------|------------|
| Rising | Both entities rise under normal gravity. Faded targeting decal appears. Convergence check. | Enemy descends within `floatConvergeDist` of player → float |
| Float | Zero-G for both. Enemy drifts to hover above player (exponential lerp). LMB input detection. Charge ring on hold. | Tap LMB → spike. Hold past threshold → dunk. Timer expires → cancel. |
| Resolved | Transfer claim via `transferClaim()`, deactivate self. | Framework activates chosen verb. |

### What the selector owns
- Rising phase (extracted from dunk.ts — shared logic)
- Float phase (gravity override, drift convergence, input detection)
- Charge ring visual (fills during LMB hold)
- Faded dunk landing decal (prominent only if dunk chosen)
- Spike aim indicator (faint directional line)

### What the selector does NOT own
- Anything after verb selection — that's the verb's job

## Spike Verb

File: `src/verbs/spike.ts`

Implements `AerialVerb` interface.

### Phases: windup → strike → recovery

| Phase | What happens | Duration |
|-------|-------------|----------|
| Windup | Brief animation beat, small screen shake telegraph | ~80ms |
| Strike | Player hits enemy. Creates EntityCarrier, attaches enemy as payload. Carrier launches toward aimed ground position with angled-downward trajectory. Big shake. "SPIKE!" damage number. | Instant |
| Recovery | Player hangs briefly (follow-through), then enhanced-gravity fast fall. Verb returns `complete`. | ~150ms hang |

### Spike fantasy
- Launch enemy → float → tap LMB → volleyball spike
- Enemy flies as angled-downward projectile toward aim position
- Damages enemies along flight path (through-hits)
- AoE burst on ground impact
- Player does a brief hang then fast-falls back to the action

## Entity Carrier System

File: `src/engine/entityCarrier.ts`

General-purpose system for turning any entity into a physics projectile with a payload.

### What a carrier is
- Position + velocity vector (affected by gravity)
- Collision shape (sphere, using payload entity's radius)
- Reference to payload entity (mesh rides along)
- Callbacks: `onHitEntity(hitEnemy)`, `onGroundImpact(position)`

### Lifecycle
1. Created by a verb (spike creates one with angled-downward velocity)
2. Updated each frame — move by velocity, apply gravity, check collisions
3. Through-hits — on enemy collision: deal damage + knockback, carrier keeps flying
4. Ground impact — AoE burst, detach payload, carrier destroyed
5. Payload detaches — enemy returns to normal state at impact position (or dies)

### Why general-purpose
- Future "toss" verb → carrier with arc trajectory
- Future "tornado" verb → carrier with spiral path
- Co-op toss → same carrier, different instigator
- Props/destructibles as payloads, not just enemies

### Carrier config (set per-instance by creating verb)

```typescript
interface CarrierConfig {
  speed: number;
  gravityMult: number;
  throughDamage: number;
  throughKnockback: number;
  impactDamage: number;
  impactRadius: number;
  impactKnockback: number;
  impactShake: number;
}
```

### Integration
`updateCarriers(dt, gameState)` called from game loop alongside `updateAerialVerbs`. Carriers tracked in a simple array — created on spike, removed on impact.

## Dunk Verb Changes

Dunk (`src/verbs/dunk.ts`) gets simpler — loses rising and float phases since the selector owns those.

- **Current phases:** rising → float → grab → slam
- **New phases:** grab → slam

Selector transfers claim to dunk after hold threshold. Dunk's `onClaim` immediately enters grab. Everything from grab onward unchanged.

## Config

```typescript
// Float selector — shared aerial verb selection
export const FLOAT_SELECTOR = {
  holdThreshold: 180,        // ms to differentiate tap (spike) vs hold (dunk)
  chargeVisualDelay: 50,     // ms before charge ring starts filling
};

// Spike verb
export const SPIKE = {
  damage: 15,                // hit damage to spiked enemy
  projectileSpeed: 25,       // enemy flight speed (units/sec)
  projectileAngle: 35,       // degrees below horizontal
  throughDamage: 20,         // damage to enemies hit along path
  throughKnockback: 8,       // knockback to path-hit enemies
  impactDamage: 15,          // AoE damage on ground impact
  impactRadius: 2.0,         // AoE radius on ground impact
  impactKnockback: 10,       // knockback on ground impact
  windupDuration: 80,        // ms windup before strike
  hangDuration: 150,         // ms hang after strike (follow-through)
  fastFallGravityMult: 2.5,  // enhanced gravity during post-spike fall
  screenShake: 3.0,          // shake on strike
  impactShake: 2.5,          // shake on enemy ground impact
};
```

## Controls

| Context | Input | Action |
|---------|-------|--------|
| Grounded near enemy | E | Launch enemy + enter floatSelector |
| Float (selector active) | Tap LMB (< 180ms) | Spike |
| Float (selector active) | Hold LMB (>= 180ms) | Dunk |
| Float (selector active) | No input, timer expires | Cancel, resume physics |
| Airborne (no float active) | LMB | Aerial strike (unchanged) |
| Airborne (no float active) | E | Self-slam (unchanged) |

## Visual Feedback During Float

- **Charge ring** — circle around player, fills clockwise over holdThreshold ms while LMB held. Resets if released early.
- **Dunk landing decal** — appears faded during float. Full opacity after hold confirms dunk.
- **Spike aim indicator** — faint directional line during float showing spike trajectory. Disappears when hold threshold passes.

## File Map

| File | Purpose |
|------|---------|
| `src/verbs/floatSelector.ts` | Selector verb: rising → float → input resolution → transfer |
| `src/verbs/spike.ts` | Spike verb: windup → strike (create carrier) → recovery |
| `src/verbs/dunk.ts` | Dunk verb: grab → slam (simplified) |
| `src/engine/entityCarrier.ts` | Carrier system: physics projectile with payload |
| `src/engine/aerialVerbs.ts` | Framework: add `transferClaim()` |
| `src/config/player.ts` | Add `FLOAT_SELECTOR` and `SPIKE` configs |
| `src/entities/player.ts` | Launch claims `floatSelector` instead of `dunk` |
| `src/engine/game.ts` | Add `updateCarriers()` to game loop |
