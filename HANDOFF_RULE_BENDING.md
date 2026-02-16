# Rule-Bending Prototype Handoff

> Physics-based rule-bending as a first-class gameplay verb on top of the isometric battler scaffolding.

---

## The Twist

**Rule-bending:** The player can modify properties of objects, enemies, and their own abilities mid-encounter. Rule-bending is a scarce creative resource (max 3 per encounter), not a god tool. The game rewards elegant, indirect solutions over brute force. Physics provides the legibility — when you make a rock heavier, you can predict what happens when it falls.

## Design Hypothesis

If players can modify the rules/properties of objects and entities in a physics-based encounter, and the encounter is designed with a possibility space of solutions at varying elegance, then players will experience creative authorship that feels categorically different from both puzzle-solving and traditional action combat.

## What Makes This Novel

- **D&D** — creative within fixed rules, but you can't change rules themselves
- **Baba Is You** — change rules during play, but prescribed solutions, no action layer
- **BotW/TotK** — systemic physics sandbox, but rules are fixed (fire always burns wood)
- **Scribblenauts** — open-ended expression changes the world, but no opinion about elegance, trivially easy

This prototype combines: **systemic physics (BotW) + rule modification (Baba) + open-ended expression (Scribblenauts) + elegance opinion + real-time action combat.**

## Key Design Constraints

1. **Max ~3 rule bends per encounter.** Scarcity forces creativity.
2. **Rule-bending and combat must feel married.** Bends apply to player abilities AND environment — not two separate games.
3. **Elegance over brute force.** The game should have an opinion about solution quality. Direct solutions work but are less rewarding.
4. **Physics as legibility.** Players reason about consequences through intuitive physical principles (weight, momentum, structural integrity).
5. **Heist structure: Setup → Execute.** Observation phase (apply bends) → Combat phase (play through consequences). The bend is the "aha," the combat is the "let's go."

## Reference Games

- **Breath of the Wild / Tears of the Kingdom** — systemic physics consistency, emergent chains
- **Baba Is You** — rule modification as core verb, but prescribed solutions
- **Scribblenauts** — open-ended expression, but no elegance opinion (cautionary tale)
- **Noita** — pixel-level physics simulation, emergent chain reactions
- **Divinity: Original Sin 2** — elemental surface interactions in tactical combat
- **Hades** — melee feel, room pacing (existing reference for base combat)

---

## Branch Info

- **Branch:** `explore/rule-bending` (create from `explore/hades`)
- **Forked from:** `explore/hades`
- **Base state:** Phase 1 complete — melee combat, force push, dash, 4 enemy types, 5 rooms, physics system with velocity knockback, wall slam, enemy collision, pit falls. 552 tests passing.

---

## Architecture Overview (What Exists)

### Systems to Build On
- **Physics** (`src/engine/physics.ts`) — velocity-based knockback, wall slam, enemy-enemy collision, pit falls. All configurable.
- **Config-driven parameters** — PHYSICS, PLAYER, MELEE, ABILITIES, ENEMY_TYPES, MOB_GLOBAL all live in `src/config/`. Tuning panel exposes everything with live sliders.
- **Arena system** (`src/config/arena.ts`) — `setArenaConfig()` swaps obstacles, pits, and arena dimensions per room. `getCollisionBounds()` and `getPitBounds()` compute AABBs.
- **Room system** (`src/config/rooms.ts`, `src/engine/roomManager.ts`) — 5 rooms with incremental pack spawning, room clear detection, auto-transition.
- **Enemy system** (`src/entities/enemy.ts`, `src/config/enemies.ts`) — 4 types (goblin, archer, imp, golem) with telegraph→attack→recovery state machines. Per-type configs with mass, knockbackResist, behavior modes.
- **Force push** (`src/entities/player.ts`) — chargeable push wave with wave occlusion. Already the best tool for physics interactions.
- **Effect/zone system** (`src/types/index.ts`) — EffectZone with shapes, durations, modifiers. Not heavily used yet but infrastructure exists.

### Key Config Values (Current)
```
PHYSICS.friction: 25          — deceleration rate
PHYSICS.wallSlamDamage: 8     — per unit of speed above threshold
PHYSICS.wallSlamMinSpeed: 3   — threshold for wall damage
PHYSICS.enemyBounce: 0.4      — enemy-enemy restitution
Enemy masses: goblin 1.0, archer 0.8, imp 0.9, golem 3.0
Force push knockback: 4 (min) to 12 (max, fully charged)
Melee: 10 damage, 2.2 range, 2.4rad arc, 380ms cooldown
Dash: 5u distance, 200ms duration, 3s cooldown, full i-frames
```

---

## Build Plan

### Phase 0: Destructible Terrain & Physics Objects (Foundation)
**Goal:** Before rule-bending can work, the world needs objects whose properties can be meaningfully changed. Currently obstacles are indestructible AABB blocks. We need physics objects that interact with the existing velocity/collision system.

#### Step 0.1: Destructible Obstacles
**What:** Obstacles gain a `health` property and can be destroyed by force push impacts, enemy collisions, or player attacks. When destroyed, they break into visual debris and are removed from the collision bounds.

**Implementation:**
- Extend `Obstacle` type in `src/types/index.ts`:
  ```typescript
  export interface Obstacle {
    x: number; z: number; w: number; h: number; d: number;
    // New properties:
    destructible?: boolean;     // can be destroyed (default false for walls)
    health?: number;            // hit points (undefined = indestructible)
    mass?: number;              // physics mass for push interactions (default Infinity = immovable)
    material?: ObstacleMaterial; // affects physics + visual + what rule bends are valid
  }

  export type ObstacleMaterial = 'stone' | 'wood' | 'metal' | 'ice';
  ```
- Add `obstacleHealth: Map<number, number>` tracking to game state (keyed by obstacle index)
- When an enemy with active velocity hits an obstacle AND obstacle is destructible: deal impact damage to obstacle (reuse `PHYSICS.impactDamage` formula)
- When obstacle health ≤ 0: remove from OBSTACLES array, call `invalidateCollisionBounds()`, spawn debris particles, play break sound
- Force push hitting a destructible obstacle deals knockback-proportional damage
- **Visual:** Destructible obstacles get a different material/color than indestructible walls. Add crack overlay when health < 50%.

**Files to modify:**
- `src/types/index.ts` — extend Obstacle interface
- `src/config/arena.ts` — update OBSTACLES handling
- `src/config/rooms.ts` — tag obstacles as destructible in room definitions
- `src/engine/physics.ts` — add obstacle damage from enemy impact + force push
- `src/engine/renderer.ts` — destructible visual distinction, crack overlay, debris on break

**Tests:**
- Obstacle takes damage from force push impact
- Obstacle takes damage from enemy collision at speed
- Obstacle removed from collision bounds on destruction
- Indestructible obstacles (walls) unaffected

#### Step 0.2: Moveable Physics Objects (Rocks, Crates)
**What:** New object type — physics objects that can be pushed by force push, moved by enemy collisions, and interact with pits and walls. These are the "nouns" that rule bends modify.

**Implementation:**
- New type `PhysicsObject`:
  ```typescript
  export interface PhysicsObject {
    id: number;
    x: number; z: number;
    radius: number;            // collision circle (simpler than AABB for moveable objects)
    mass: number;              // determines push resistance
    vel: { x: number; z: number }; // reuse enemy velocity model
    material: ObstacleMaterial;
    health?: number;           // if destructible
    // Visual
    meshType: 'rock' | 'crate' | 'barrel' | 'pillar';
    scale: number;             // size multiplier (rule bends can change this)
    // Rule-bend state (added in Phase 1, but reserve the fields)
    modifiers: Record<string, number>; // active rule bend modifiers
  }
  ```
- Store in game state as `physicsObjects: PhysicsObject[]`
- Physics update (`applyVelocities`): process PhysicsObject velocity identically to enemy velocity (friction, wall collision, pit falling)
- Force push affects PhysicsObjects: same wave detection as enemies, knockback inversely proportional to mass
- Enemy-PhysicsObject collision: mass-weighted separation (reuse enemy-enemy collision math)
- PhysicsObject-PhysicsObject collision: same elastic collision model
- PhysicsObject-Enemy collision when object has velocity: deal impact damage to enemy (same formula as enemy-enemy)
- Pit fall: PhysicsObject with active velocity over a pit falls in (same as enemy pit fall)
- Wall slam: PhysicsObject hitting a wall at speed creates visual/audio feedback

**Files to create:**
- `src/config/physicsObjects.ts` — PhysicsObject type definitions and default configs
- `src/entities/physicsObject.ts` — creation, mesh setup, update loop

**Files to modify:**
- `src/types/index.ts` — add PhysicsObject interface
- `src/engine/physics.ts` — add PhysicsObject to velocity processing, collision detection (enemy↔object, object↔object, object↔wall, object↔pit)
- `src/engine/game.ts` — add PhysicsObject update to game loop
- `src/engine/renderer.ts` — PhysicsObject mesh creation and cleanup
- `src/config/rooms.ts` — add PhysicsObject placement to room definitions

**Tests:**
- PhysicsObject pushed by force push (velocity proportional to force/mass)
- PhysicsObject-enemy collision (damage, separation, mass-weighted)
- PhysicsObject-wall slam (visual feedback)
- PhysicsObject-pit fall
- PhysicsObject-PhysicsObject collision (elastic)
- Heavy object resists push, light object flies

#### Step 0.3: Room Redesign for Rule-Bending
**What:** Redesign Room 1 as the rule-bending test room. The room should have a clear objective with multiple solution paths, physics objects placed to enable chains, and spatial relationships that reward indirect thinking.

**Room concept — "The Workshop":**
- Arena: 12u × 20u (medium, manageable)
- **Objective:** Reach the exit. The direct path is blocked by a heavy barricade (indestructible via normal means). There's also an optional "elegant" objective — clear the room without triggering the alarm (an enemy that reaches a bell object).
- **Objects:**
  - 2 rocks (medium mass, moveable) — on a raised slope area
  - 1 heavy crate (high mass, barely moveable by normal push)
  - 2 destructible pillars (stone, moderate health) — load-bearing positions near the barricade
  - 1 barrel (light, rollable)
- **Enemies:**
  - 3 goblins (rush) — standard melee pressure
  - 1 archer (kite) — ranged threat to keep player moving
  - 1 goblin near an "alarm bell" object (if this goblin reaches the bell, reinforcements spawn — the brute force penalty)
- **Spatial layout:**
  - Rocks uphill from destructible pillars
  - Pillars positioned so that toppling them could clear a path or crush enemies below
  - Barrel near pit edge (easy to knock in, or rule-bend to make useful)
  - Alarm bell on far side — goblin patrolling toward it

**Solution space (examples, not exhaustive):**
1. **Shatter path:** Fragile on pillar → push rock into pillar → pillar shatters, clearing a path and crushing enemies below (1 bend)
2. **Bowling path:** Enlarge rock → force push enlarged rock into enemy cluster → massive collision radius + mass = multi-kill (1 bend)
3. **Pit trap:** Sticky on barrel → push barrel toward goblin → goblin sticks to barrel → push combined mass into pit (1 bend)
4. **Pinball path:** Bouncy on rock + Shrink on rock → force push creates a tiny pinball that ricochets off walls hitting multiple enemies (2 bends)
5. **Blockade path:** Enlarge crate + Sturdy on crate → creates an immovable wall that blocks the alarm goblin's patrol route (2 bends, defensive)
6. **Combo:** Fragile on pillar + Enlarge on barrel → pillar shatter clears path, enlarged barrel bowled through gap hits enemies on other side (2 bends, offense + traversal)
7. **Brute force:** Kill everything with melee + push, ignore bends entirely. Works but alarm triggers, reinforcements spawn, harder fight

**Files to modify:**
- `src/config/rooms.ts` — replace Room 1 definition with "The Workshop"
- May need elevation/slope system (simplified: objects on a slope get a constant velocity in the slope direction when their constraint is removed)

---

### Phase 1: The Rule-Bending System (Core Mechanic)
**Goal:** Implement the observation phase + rule-bend selection + parameter modification pipeline.

#### Step 1.1: Encounter Phases (Observation → Combat)
**What:** Each room now has two phases. In Observation phase, time is frozen, the player can look around and inspect objects/enemies. In Combat phase, enemies activate and combat plays normally. The transition should feel like a heist movie's "go time."

**Implementation:**
- New state in GameState: `encounterPhase: 'observation' | 'combat'`
- On room load: set `encounterPhase: 'observation'`
  - Enemies visible but frozen (spawned in position, AI disabled)
  - Player can move freely (no dash/attack)
  - Camera slightly zoomed out (increase orthographic frustum by ~20% for better overview)
  - HUD shows "OBSERVE" indicator + rule bend count remaining
  - Objects and enemies have hover-inspect labels (name, key properties)
- Transition to combat:
  - Player presses a key (e.g., Enter or dedicated "GO" key) or a timer starts after first bend is applied
  - Brief cinematic beat: camera snaps to normal zoom, enemies "wake up" with a visual pulse, audio sting
  - `encounterPhase: 'combat'` — normal game loop resumes
  - Rule bends are locked — no more modifications during combat
- Optional: short auto-observation on room enter (2-3 second pan) before player gets control

**Files to modify:**
- `src/types/index.ts` — add `encounterPhase` to GameState
- `src/engine/game.ts` — gate enemy AI, player combat abilities, and physics behind `encounterPhase === 'combat'`
- `src/engine/roomManager.ts` — set phase to 'observation' on room load
- `src/engine/input.ts` — add 'go' / 'startCombat' input binding
- `src/engine/renderer.ts` — observation phase camera zoom, visual treatment
- `src/ui/hud.ts` — observation phase indicators

**Tests:**
- Enemies don't move in observation phase
- Player can't attack/dash in observation phase
- Transition to combat activates enemy AI
- Rule bends locked after combat starts

#### Step 1.2: Rule Bend Selection UI
**What:** During observation phase, the player can select a rule bend from a curated menu and apply it to a target (object, enemy, or self).

**Rule Bend Definitions:**
```typescript
export interface RuleBend {
  id: string;
  name: string;
  description: string;
  icon: string;                    // emoji or symbol for now
  property: 'size' | 'adhesion' | 'durability';  // which axis this bend modifies
  pole: 'positive' | 'negative';                  // which direction on that axis
  applicableTo: ('physicsObject' | 'enemy' | 'player' | 'obstacle')[];
  parameterChanges: BendEffect[];
}

export interface BendEffect {
  param: string;      // e.g., 'mass', 'scale', 'speed', 'health'
  operation: 'multiply' | 'add' | 'set';
  value: number;
}
```

**The 6 Rule Bends — 3 Properties × 2 Poles:**

Each property is an axis with two opposing bends. Players pick from 6 options, apply max 3 per encounter.

| Property | + Pole | - Pole |
|----------|--------|--------|
| **Size** | **Enlarge** — scale × 2.5, mass × 2, collision radius × 2. Bigger, heavier, more impact. | **Shrink** — scale × 0.3, mass × 0.3, collision radius × 0.3. Tiny, light, flies on any push. |
| **Adhesion** | **Sticky** — on contact, attaches to enemy or object (combined mass, moves as unit). Can stick enemies to objects then push into pits. | **Bouncy** — restitution = 0.95 (near-perfect bounce). Ricochets off walls, objects, enemies. Pinball physics. |
| **Durability** | **Sturdy** — health × 5, knockbackResist + 0.8. Nearly immovable, barely destructible. Turns an object into a wall. | **Fragile** — health = 1. One impact shatters it. Destructible pillars instantly break, clearing paths or creating debris. |

**Why pairs work:** Each pair creates a clear mental model. "Do I want this thing bigger or smaller? Stickier or bouncier? Tougher or breakable?" Opposites are intuitive — players learn one pole and immediately understand the other. And combining across axes is where creativity lives: Enlarge + Fragile = giant object that shatters spectacularly on first impact. Shrink + Bouncy = tiny pinball that ricochets everywhere.

**UI Layout:**
- Compact panel: 3 rows (one per property), 2 buttons per row (+ and - pole)
- Click bend → cursor changes to targeting mode → click target in game world → bend applied
- Visual feedback on target: glow outline + icon indicator for active bend
- Counter: "Bends remaining: 3/3" — decrements on apply
- Undo button (can remove a bend and get it back during observation phase)

**Implementation:**
- New file: `src/config/bends.ts` — RULE_BENDS array with all 8 definitions
- New file: `src/engine/bendSystem.ts` — manages bend state, applies parameter changes to targets
- New file: `src/ui/bendPanel.ts` — observation phase UI, click-to-target flow
- Active bends stored per-room: `activeBends: { bendId: string, targetType: string, targetId: number }[]`
- On bend apply: modify the target's runtime config values (e.g., `physicsObject.mass *= 2` for "Enlarge", `physicsObject.health = 1` for "Fragile")
- On room reset: clear all bends, restore original values
- **Opposite enforcement:** Can't apply both poles of the same property to the same target (Enlarge + Shrink on same rock = invalid). Can apply different properties to the same target (Enlarge + Fragile = valid and interesting).

**Files to create:**
- `src/config/bends.ts` — 6 bend definitions (3 properties × 2 poles)
- `src/engine/bendSystem.ts` — manages bend state, applies parameter changes, handles undo
- `src/ui/bendPanel.ts` — compact 3×2 grid UI, click-to-target flow

**Files to modify:**
- `src/engine/game.ts` — integrate bendSystem into game loop
- `src/engine/input.ts` — bend targeting input (click-on-object during observation)
- `src/engine/renderer.ts` — bend visual indicators on objects
- `src/ui/hud.ts` — bend counter display

**Tests:**
- Each of the 6 bends correctly modifies target parameters
- Opposite poles can't be applied to same target
- Different properties CAN be applied to same target
- Max 3 bends enforced
- Bends can be undone during observation
- Bends locked after combat starts
- Parameter restoration on room reset

#### Step 1.3: Object Inspection (Hover + Inspect)
**What:** During observation phase, hovering over objects and enemies shows their key properties. This teaches the player what's bendable and helps them reason about chains.

**Implementation:**
- Mouse hover during observation phase → raycast to identify target
- Tooltip shows: name, material, mass, health, current velocity, and any active bends
- For enemies: name, health, speed, behavior type, knockback resist
- For player: current push force, melee damage, dash distance
- Visual: floating label above target + property list. Clean, minimal, doesn't block the view.

**Files to modify:**
- `src/engine/input.ts` — raycast on hover during observation
- `src/ui/hud.ts` or new `src/ui/inspectTooltip.ts` — tooltip rendering
- `src/engine/renderer.ts` — hover highlight on inspectable objects

#### Step 1.4: Bend Consequence Feedback (During Combat)
**What:** When a rule bend activates during combat (object gets pushed, chain reaction starts), the game provides clear visual/audio feedback so the player understands what their bend caused.

**Implementation:**
- When a bent object participates in a collision: special particle effect (distinct from normal hits)
- Slow-mo beat on first major chain reaction (200ms at 0.3x speed — similar to existing hit pause but for physics events)
- Damage numbers on bent interactions show the bend icon alongside the number
- If a "fragile" pillar shatters: dust cloud + screen shake + structural collapse sound
- If "fear" triggers: enemy shows fear state (exclamation mark, runs away, different movement animation)
- "Elegant solution" detection (stretch goal): if room clears without alarm triggering AND using ≤2 bends → show "ELEGANT" banner + bonus feedback

**Files to modify:**
- `src/engine/physics.ts` — emit events when bent objects participate in collisions
- `src/engine/particles.ts` — new particle types for bend interactions
- `src/engine/audio.ts` — new sounds for bend consequences (shatter, fear trigger, chain reaction)
- `src/engine/game.ts` — chain reaction slow-mo beat
- `src/ui/hud.ts` — elegant solution detection and display

---

### Phase 2: Second Room + Player-Action Bends
**Goal:** Validate that rule-bending transfers to new layouts and that player-ability bends integrate with environmental bends.

#### Step 2.1: Player-Action Bends
Extend the bend system to modify player abilities:
- **Long Push** — force push range × 2 (costs a bend slot on raw power)
- **Heavy Strikes** — melee knockback enabled (currently disabled), knockback = 3.0. Melee becomes a physics tool.
- **High Jump** — dash distance × 1.5, adds vertical arc (can clear low obstacles/gaps)
- **Magnetic Pull** — new ability: pull a physics object toward you (reverse force push, single target, short range)

These use the same bend slot economy. Choosing to buff yourself means one fewer environmental bend.

#### Step 2.2: Second Room — "The Foundry"
A different spatial layout that remixes the same objects and bends. Tests whether players transfer learning. Ideas:
- Elevated platforms connected by narrow bridges (pillar destruction = bridge collapse)
- Multiple enemy patrol routes converging on a central alarm
- Physics objects arranged for ricochet chains (bouncy + narrow corridor = pinball)

#### Step 2.3: Replay Incentive
Track per-room stats: bends used, alarm triggered, time to clear, enemies killed by physics vs. combat. Show a results screen after each room. "Can you clear it with only 1 bend?"

---

### Phase 3: Free-Form Expression (Future — Not This Sprint)
Replace curated bend menu with text input. LLM interprets player language and maps to parameter changes from the curated set. "Make the rock enormous" → Enlarge bend applied to rock. "The goblins are terrified of fire" → Fear bend + visual fire effect on barrel. This is an engineering phase, not a design phase — only start after Phase 1-2 validate the verb.

### Phase 4: Knowledge Economy (Future)
Quest objects from completed encounters gate which bends are available. Discovery feeds expression.

---

## Vertical Slice Target (End of Phase 1)

- **Duration:** ~3-5 minutes per room attempt
- **What you'd experience:**
  1. Enter "The Workshop" — room visible, enemies frozen in place, objects highlighted
  2. Move around during observation, hover over objects to see properties
  3. Open bend panel, select "Make Fragile", click a destructible pillar
  4. Select "Make Heavy", click a rock uphill from the pillar
  5. Select "Fear", click the alarm goblin, link it to the heavy rock
  6. Press GO — combat starts
  7. Force push the heavy rock into the fragile pillar — pillar shatters, debris blocks a lane
  8. The alarm goblin sees the rock (feared) and runs away from the alarm bell
  9. Fight remaining enemies with melee + dash while physics consequences play out
  10. Room clears — "ELEGANT" banner if alarm wasn't triggered

---

## Implementation Priority & Sprint Plan

### Sprint 1 (aim: ~2 days)
1. **Step 0.1** — Destructible obstacles
2. **Step 0.2** — Moveable physics objects
3. **Milestone:** A rock can be pushed into a pillar and the pillar breaks. Physics chain works.

### Sprint 2 (aim: ~2 days)
4. **Step 1.1** — Observation/combat phase split
5. **Step 1.2** — Rule bend selection UI + all 6 bends (3 properties × 2 poles)
6. **Step 1.3** — Object inspection on hover
7. **Milestone:** Bends work — you can make a rock enlarged, make a pillar fragile, start combat, push rock into pillar, pillar shatters.

### Sprint 3 (aim: ~2-3 days)
8. **Step 0.3** — Room redesign ("The Workshop") with spatial puzzle
9. **Step 1.4** — Bend consequence feedback (particles, slow-mo, audio)
10. **Milestone: Full playtestable vertical slice.** One room, full bend loop, feedback polish.

### Sprint 4 (if Phase 1 validates)
11. **Step 2.1** — Player-action bends
12. **Step 2.2** — Second room
13. **Step 2.3** — Replay tracking + results screen

---

## What Doesn't Change (Preserve from Hades Branch)

- Melee combat system (damage, arc, auto-targeting, hit pause) — untouched
- Dash (i-frames, afterimages) — untouched
- Force push core mechanic — enhanced (interacts with physics objects) but not redesigned
- Enemy state machines (telegraph → attack → recovery) — untouched, but enemies need to respond to Fear bend
- Velocity-based knockback model — extended to physics objects, same formula
- Tuning panel — extended with new sections for bends and physics objects
- All existing tests should continue passing

## What Changes

- **Obstacles:** Gain health, material type, destructibility
- **New entity type:** PhysicsObject (rocks, crates, barrels) with velocity, mass, collision
- **Room structure:** Observation → Combat phase split
- **New UI:** Bend panel (3×2 grid — 3 properties × 2 poles), inspection tooltips, bend counter
- **New physics:** Object-object, object-enemy, object-wall collisions (extending existing enemy-enemy model)
- **Room 1 redesign:** From "The Approach" (pure combat) to "The Workshop" (rule-bending puzzle + combat)
- **Feedback additions:** Chain reaction slow-mo, bend-specific particles/audio, elegant solution detection

---

## Open Questions for Playtesting

1. Does the observation → combat split feel like a natural rhythm or a jarring pause?
2. How long should the observation phase be? Timed? Untimed? Does it matter?
3. Is 3 bends the right number? Too few feels restrictive, too many removes scarcity.
4. Do players try creative solutions or default to brute force (Enlarge everything + push)?
5. Does the alarm mechanic create enough pressure to discourage brute force?
6. Is object inspection sufficient for players to reason about chains, or do they need more guidance?
7. Does the "elegant" detection feel fair or arbitrary?
8. Are 6 bends (3 properties × 2 poles) the right set? Are some bends never used? Are combinations too dominant?
9. Do the paired opposites help learnability? Can players predict what the other pole does after seeing one?

---

## Key Technical Risks

1. **PhysicsObject collision performance** — Adding objects to the O(n²) collision loop increases computation. With ~5 objects and ~6 enemies, that's manageable (11 entities = 55 pairs). Monitor if we add more.
2. **Destructible obstacle removal mid-frame** — Removing an obstacle from OBSTACLES during physics processing could cause index issues. Use deferred removal (mark for removal, process at end of frame).
3. **"Sticky" bend implementation** — Attaching an object to an enemy requires constraint-like behavior. Simplest: when sticky object contacts enemy, set object position to track enemy position + offset each frame. Combined mass affects subsequent collisions.
4. **Slope/elevation** — The current system is flat (y=0). If we want rocks to roll downhill, we need either: (a) a simplified gravity field per-region (constant velocity in slope direction), or (b) a height map. Option (a) is much simpler and sufficient for Phase 1.

---

## Session Log

- **2026-02-15** — Created HANDOFF_RULE_BENDING.md. Concept solidified through design discussion (captured in game-design-brain vault). Core decisions: physics-first rule-bending, heist structure (observation → combat), curated bends before free-form, elegance over brute force.

---

*Design context: See /Users/jzhang/Workspace/game-design-brain/prototypes/rule-bending/overview.md for full concept documentation, design patterns, and connection to larger vision.*
