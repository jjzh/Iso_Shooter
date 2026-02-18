# Aerial Verb Framework Design

> Extensible system for aerial combat verbs that share a common Launch entry point.

**Date:** 2026-02-17
**Branch:** explore/vertical

---

## Problem

The current dunk system is a monolithic state machine in `player.ts` (~300 lines) that handles launch, float, grab, slam, and impact as one tightly coupled flow. This causes:

1. **Drift bug** — during float phase, the enemy drifts toward the player at 3 units/sec but can't keep up if the player moves, causing visual disconnection
2. **No extensibility** — adding a new aerial verb (spike, juggle, toss) means duplicating launch logic and managing state conflicts

## Design

### Terminology

- **Launched** — an enemy the player intentionally put in the air, available for verb consumption
- **Airborne** — any entity in the air (player, enemy mid-jump, knocked up by physics)

"Launched" is a subset of "airborne." The verb framework operates on **launched** enemies specifically.

### Architecture: Launch Registry + Verb Modules

```
Launch (shared, in framework)
  → Enemy enters "launched" state, added to registry
  → Claim window opens

Verb modules (plug-in):
  → Check claim condition (input + context)
  → Claim enemy from registry (exclusive ownership)
  → Run verb-specific update loop
  → Resolve (damage, projectile, hand-off, etc.)
  → Release enemy back to normal state
```

### Framework Responsibilities

The framework is a **thin registry + lifecycle manager with opt-in utilities**:

| Framework owns | Verbs own |
|---|---|
| Launch physics (upward velocity) | Claim conditions |
| Launched enemy registry (add/remove/query) | Position sync (via `attachToPlayer` utility) |
| "Launched" flag lifecycle | Gravity overrides (via `setGravityOverride` utility) |
| Claim/release protocol | Interrupt policy (per-verb) |
| Verb registration | Update logic |
| Cancel/cleanup on death or pit | Resolution (damage, projectile, etc.) |
| Landing-without-claim behavior (stun) | Camera hints |

### Launched Enemy Registry

```typescript
interface LaunchedEnemy {
  enemy: Enemy;
  launchTime: number;
  claimedBy: string | null;  // verb name or null
  gravityMult: number;       // default 1.0, verb can override
}

// Core operations:
// registerLaunch(enemy) — add to registry
// claimLaunched(enemy, verbName) — exclusive claim
// releaseLaunched(enemy) — return to normal
// getLaunched() — query all launched enemies
// getUnclaimed() — query claimable enemies
```

Supports N launched enemies. Current verbs only use 1, but juggle needs multiple.

### Verb Interface

Each verb is a module that registers with the framework:

```typescript
interface AerialVerb {
  name: string;
  canClaim(enemy: LaunchedEnemy, player: PlayerState): boolean;
  onClaim(enemy: LaunchedEnemy): void;
  update(dt: number, enemy: LaunchedEnemy): void;
  onCancel(enemy: LaunchedEnemy): void;   // enemy died, pit, interrupt
  onComplete(enemy: LaunchedEnemy): void; // verb finished normally
  interruptible: boolean;                 // can player damage cancel this?
}
```

### Opt-In Utilities

**`attachToPlayer(enemy, offset)`** — Force-syncs enemy position to player + offset every frame. Solves the drift bug. Used by dunk (grab phase) and toss. NOT used by spike or juggle.

**`setGravityOverride(enemy, multiplier)`** — Overrides gravity for a launched enemy. Zero for dunk float, reduced for spike timing window, normal for juggle between hits.

### Dunk Reimplemented as Verb

The current dunk becomes the first verb on the new framework:

1. **Launch** (framework) — player presses E, enemy gets upward velocity, enters registry
2. **Float** (dunk verb, claimed) — gravity override to 0, drift enemy toward player, decal appears
3. **Grab** (dunk verb) — player presses E again, `attachToPlayer` locks enemy to player
4. **Slam** (dunk verb) — arc trajectory toward landing target, enemy carried
5. **Impact** (dunk verb, onComplete) — damage, AoE, release enemy from registry

### Edge Cases

**Unclaimed landing:** Enemy falls back down, gets brief stun on landing. Launch is useful standalone.

**Death mid-verb:** Framework detects death, calls `verb.onCancel()`. Verb handles cleanup (remove decal, stop trail, etc.).

**Player hit during verb:** Checked against `verb.interruptible`. Dunk slam = not interruptible. Dunk float = interruptible.

**Verb chaining:** Enemy survives resolution → can be re-launched or a new verb can claim the bounce. No automatic chaining in v1.

**Pit during claim:** Framework allows pit death even during claim. Launching into pits is a valid strategy.

### Future Verbs (Not Implemented Now)

**Set & Spike:** Player launches enemy, jumps up, timed hit window at apex. On hit, enemy becomes a projectile toward aimed location. Uses `setGravityOverride(0.3)` for slow-mo timing window. Does NOT use `attachToPlayer`.

**Juggle:** Repeated hits from ground keep enemy airborne. Each hit re-registers a fresh launch. Multiple enemies can be launched simultaneously.

**Co-op Toss:** Grab + throw toward another player. Uses `attachToPlayer` briefly, then releases with directional velocity.

### File Structure

```
src/engine/aerialVerbs.ts    — framework: registry, claim protocol, utilities
src/verbs/dunk.ts            — dunk verb module
src/verbs/                   — future verb modules (spike.ts, juggle.ts, etc.)
```

## Drift Fix

The root cause: during float, the enemy drifts toward the player at a fixed speed (3 units/sec) but the player can move freely with WASD. If the player moves away, the gap widens.

The fix is in the `attachToPlayer` utility: when a verb enters an "attached" phase, position sync is absolute (enemy.pos = player.pos + offset), not velocity-based drift. For dunk's float phase (before grab), the verb should either:
- Disable player XZ movement during float, OR
- Increase drift speed to always converge within 1-2 frames, OR
- Use `attachToPlayer` with a larger offset during float (soft-attach)

Recommendation: soft-attach during float with fast lerp (converge in ~100ms regardless of distance), hard-attach on grab.
