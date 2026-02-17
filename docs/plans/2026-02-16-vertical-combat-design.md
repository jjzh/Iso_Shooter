# Vertical Combat Design — `explore/vertical`

> Launch, juggle, grab, dunk — DMC-style aerial combat from an isometric camera.

## Vision

Extend the existing 2D XZ physics with a full Y-axis to create a combat sandbox where verticality is a core verb. The player can launch enemies into the air, jump up after them, grab them mid-air, and spike them into the ground, walls, other enemies, or pits. Same inputs, different verbs depending on grounded vs. airborne.

## Reference Games

| Game | What we take from it |
|------|---------------------|
| **Ys vs. Trails in the Sky: Alternative Saga** | Proof that top-down camera + jump + aerial combos works. Ground vs. air moveset split. |
| **Devil May Cry** | Feel target for launch → juggle → slam. Player chooses whether to chase airborne enemies. Ground juggle, aerial chase, and re-launch are all valid follow-ups. |
| **Supervive** | Isometric camera + meaningful terrain height (multiple tiers, not just 2 levels). Airborne as a distinct combat state. |
| **Existing force push system** | Launch is "force push but the vector points up." Physics foundation carries over. |

## Core Loop

```
Launch (E) → Jump (Space) → Aerial strike or Grab (E) → Dunk (aim + release) → Impact
```

Duration target: under 1 second for the full sequence. The dunk payoff should feel explosive.

## Input Mapping

| Input | Grounded | Airborne |
|-------|----------|----------|
| **LMB tap** | Melee swing (horizontal arc, generous vertical hitbox) | Aerial strike (downward-angled, hits airborne + below) |
| **LMB hold** | Force push (charge + release, horizontal) | Force push (horizontal, from the air) |
| **E** (no airborne enemy nearby) | Launch (instant tap, upward force in cone) | Self-slam (fast drop, AoE on landing) |
| **E** (near airborne enemy) | N/A (grab is exclusively aerial) | Grab → hold → aim → dunk |
| **Space** | Jump | No-op (future: double jump) |
| **Left Shift** | Dash (ground) | Air dash (horizontal) |

### Grab/Dunk Mechanic

1. Press E near an airborne enemy while airborne yourself
2. Brief hold window (200-400ms) — gravity pauses for both player and grabbed enemy
3. Aim with cursor during the hold to pick dunk angle/target
4. Release (or timer expires) — enemy gets spiked toward aim point
5. **Fallback:** if no aim input during hold, default is straight down slam

### Dunk Outcomes (all intended)

| Target | Result |
|--------|--------|
| Ground | Impact damage + AoE shockwave |
| Wall | Wall slam (existing system) — bonus damage from chosen angle |
| Another enemy | Enemy-enemy collision — dunked enemy becomes projectile, bowling |
| Pit | Instant kill — the ultimate positioning payoff |
| Physics object | Object gets launched from impact, chain reaction |

## Y-Axis Physics

### New Components

Every entity gets:
- `posY: number` — height above ground (0 = on ground surface)
- `velY: number` — vertical velocity (positive = up)
- Gravity: constant downward acceleration (~20-30 u/s², tunable)
- `isAirborne: boolean` — derived from `posY > groundHeightAt(x,z) + epsilon`

### Rules

- **Gravity** applies every frame to all entities with `posY > groundHeight`
- **Friction** only applies to XZ velocity while grounded. Airborne = full air control (100% ground movement speed while airborne, tunable slider)
- **Landing detection:** when `posY` would go below `groundHeightAt(x,z)` during a substep, clamp to ground height. Apply landing impact (squash visual, potential landing lag proportional to fall speed)
- **Launch velocity:** tap E applies a fixed upward `velY` to enemies in cone (tunable). No charge needed.

### What Stays the Same

- XZ collision (circle vs AABB walls, circle vs circle entities)
- Wall slam (XZ impacts, existing system)
- Enemy-enemy collision (XZ, mass-weighted, elastic)
- Pit detection (XZ position check)
- Force push wave (XZ, hold-to-charge on LMB)

## Terrain System

### AABB Height Zones

Each room defines height regions:

```typescript
{ x: number, z: number, width: number, depth: number, height: number }
```

- Default ground height: 0
- Platforms: height 2, 4, etc. (multiple tiers, Supervive-style)
- `getGroundHeight(x, z)` returns the highest zone containing that XZ point
- Walking off a high zone into empty space → gravity takes over, you fall
- Walking onto a higher zone from below requires jumping
- Ledge edges render as vertical cliff faces (box geometry, darker material)

### Level Editor Extension

The existing level editor (cherry-picked from rule-bending) gets a height field on zones/platforms. Place a zone, set its height with a slider or drag handle.

## Hitbox Approach

All attacks use **vertically generous hitboxes** (tall capsules). A ground melee swing's hitbox extends upward enough to catch low-airborne enemies. A launched enemy at peak height is out of reach of ground attacks — but the transition zone is forgiving. No hard state-gating threshold needed; the hitbox geometry handles it naturally.

## Visual Readability

### Ground Shadows (critical)

Every entity gets a dark circle projected onto the ground height below them. As they rise:
- Shadow stays on the ground
- Shadow shrinks slightly with altitude
- Shadow is the #1 depth cue — non-negotiable for isometric vertical

### Terrain Rendering

Height zones render as:
- Flat colored surface on top
- Vertical cliff face on exposed edges (darker material)
- Clear visual distinction between height tiers

### Motion Feedback

- **Launch:** upward particle streak on enemy, dust burst from ground
- **Grab hold:** time-freeze visual beat (gravity pause), subtle glow/pulse on grabbed enemy
- **Dunk:** downward streak trail, explosive dust/spark burst on impact
- **Landing:** squash visual (Y compress, XZ expand) proportional to fall speed

## Animation States

### Player (new states for procedural animator)

| State | Trigger | Pose |
|-------|---------|------|
| **jump** (ascent) | Space pressed, posY rising | Legs tuck, arms rise, slight forward lean |
| **fall** (descent) | posY falling, not from slam | Legs extend downward, arms spread for balance |
| **land** | Airborne → grounded transition | Squash on impact, quick recovery. Scale proportional to fall speed. |
| **aerial strike** | LMB tap while airborne | Arm sweeps downward, body tilts into strike |
| **launch** | E while grounded | Arm thrusts upward, body extends upward |
| **grab hold** | E near airborne enemy while airborne | Both arms forward, gripping pose. Enemy locked near player. |
| **dunk** | Release from grab | Body tucks, arm drives downward. Fast descent. Explosive pose on impact. |
| **self-slam** | E while airborne, no enemy nearby | Similar to dunk but solo — tuck and drop |
| **air dash** | Shift while airborne | Horizontal stretch pose, afterimages (like ground dash) |

### Enemies (minimal — extend existing static rigs)

| State | Pose |
|-------|------|
| **launched** | Body tilted back, limbs splayed (helpless) |
| **grabbed** | Compressed, locked near player |
| **falling** | Slight rotation, limbs loose |
| **landing recovery** | Squash + stagger back to AI state |

These are simple rotation/scale transforms on existing enemy meshes — no full animation system needed yet.

## Branch Setup

### Approach: Fork from `explore/hades`, cherry-pick from `explore/rule-bending`

**From hades (base):**
- Melee combat (click-to-attack, auto-targeting, hit pause)
- Force push (hold-to-charge, wave occlusion)
- Dash (space, i-frames)
- 4 enemy types with state machines
- 5 rooms with pack spawning, doors, progression
- Physics (velocity knockback, wall slam, enemy collision, pit falls)
- All supporting systems (events, audio, particles, tuning panel)

**Cherry-pick from rule-bending (QoL):**

Batch 1 — Collision fixes (9 commits):
- Wall sliding, wall nudge, visual/collision sync, push-through prevention, ghost object fix

Batch 2 — Physics objects + level editor (~12 commits):
- PhysicsObject system (moveable crates/barrels/rocks with mass, velocity, collision)
- Destructible obstacles
- Level editor with spatial handles (extends to support height zones)

**Leave behind:** Bend system, radial menu, bullet time as bend-mode, bend-specific events/types.

## Open Questions (to resolve during implementation)

- Jump height and gravity values — find through playtesting
- Grab hold window duration — 200ms vs 400ms, tune for feel
- Self-slam: should it deal damage to enemies on landing, or just reposition?
- Air dash: maintain height briefly, or start falling immediately after?
- Should enemies be able to grab/launch the player? (probably not in v1)
- Double jump: future verb or not needed?

## What Success Looks Like

A 30-second playtest where you:
1. Walk into a room with goblins
2. Launch one with E — it pops into the air
3. Jump up after it (Space)
4. Grab it (E) — gravity pauses, you aim
5. Spike it into another goblin (aim + release) — bowling, both take damage
6. Land, force push (LMB hold) a third goblin into a pit
7. Feel like you're playing a physics sandbox with combat verbs
