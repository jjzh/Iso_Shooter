# The Workshop — Room 6 Design (inserted as Room 5)

## Context

Room 6 in the portfolio demo showcases the rule-bending exploration branch. The player can modify physics properties of objects (enlarge/shrink) and then use force push to interact with them. Inserted before the vertical combat room so "The Arena" stays as the finale.

## Room sequence

1. The Origin (origin)
2. The Foundation (base)
3. Physics Playground (base)
4. The Shadows (assassin)
5. **The Workshop (rule-bending)** — NEW
6. The Arena (vertical)

## Core mechanic

Press Q → bullet time activates → radial menu shows Enlarge/Shrink → pick one → click a physics object → bend applied → Q to exit bend mode → force push objects around with altered physics.

- **Enlarge:** scale x2.5, mass x2, collision radius x2. Bigger, heavier, more impact.
- **Shrink:** scale x0.3, mass x0.3, collision radius x0.3. Tiny, light, flies on any push.
- Max 3 bends per room. Opposite poles can't stack on the same object.

## Room layout

Arena: ~14x14 (consistent with other rooms).

### Objects
- **1 rock** (medium mass, stone material) — near center of arena
- **1 crate** (heavy mass, wood material) — blocking a path/chokepoint

### Environment
- **2 pits** — positioned for force push kills (enlarged objects = bigger bowling balls)
- **Pressure plate** (stretch) — floor zone on one side of the arena, triggers ceremony when an object with enough mass sits on it
- **Crate blocks a path** — the crate is too heavy to push at normal mass; shrink it to make it moveable
- Standard wall/obstacle segments for wall slam combos

### Enemies
- 3 goblins — standard melee pressure while player experiments with bends

## Two "aha" moments

| Bend | Use case | Physics intuition |
|------|----------|-------------------|
| **Enlarge** | Rock becomes heavy enough to trigger the pressure plate | Heavier = more weight = activates weight-sensitive things |
| **Shrink** | Crate was too heavy to push; now it's light and small, easy to shove aside | Smaller/lighter = moveable when it wasn't before |

Both are rooted in real-world physics reasoning — no abstract puzzle logic.

## Integration approach

Copy + adapt from `explore/rule-bending` branch (same pattern as vertical and assassin integrations). The branch has ~20 commits of physics object bug fixes (wall sticking, ghost objects, collision mismatches) that we want to preserve.

### Files to copy (5 new files)
1. `src/config/bends.ts` — Enlarge + Shrink definitions
2. `src/engine/bendSystem.ts` — apply/undo/reset, opposite-pole enforcement
3. `src/engine/bendMode.ts` — Q toggle, bullet time integration, raycasted targeting, object highlights
4. `src/entities/physicsObject.ts` — create, mesh, bend visuals, cleanup
5. `src/ui/radialMenu.ts` — DOM overlay for bend selection

### Files to modify (superset integration)
6. `src/types/index.ts` — PhysicsObject, PhysicsObjectPlacement, ObstacleMaterial types; physicsObjects + bendMode + bendsPerRoom on GameState
7. `src/engine/physics.ts` — applyObjectVelocities, resolveObjectCollisions, resolvePhysicsObjectBodyCollisions (profile-gated)
8. `src/engine/game.ts` — wire bend mode toggle + object physics into game loop (profile-gated)
9. `src/engine/input.ts` — bendMode input binding (Q key)
10. `src/engine/roomManager.ts` — spawn physics objects on room load, cleanup on transition
11. `src/config/rooms.ts` — insert Room 5 "The Workshop", renumber Arena to Room 6
12. `src/ui/hud.ts` — bend counter display
13. `src/config/physics.ts` — object physics constants
14. `src/engine/events.ts` — bend/object event types
15. `src/config/mobileControls.ts` — bend toggle button for rule-bending profile

### Profile gating
- All bend mode code gated behind `getActiveProfile() === 'rule-bending'`
- Physics object spawning/updating only when physicsObjects array is non-empty
- Other rooms completely unaffected

### HUD
- Bend counter: "BENDS: X/3" visible in rule-bending room
- Grayed-out bend icon in HUD ability bar for non-rule-bending rooms (progressive reveal)

## Stretch: Pressure plate

A floor zone rendered as a glowing circle/square on the ground. When a physics object with mass above a threshold rests on it (velocity near zero + overlapping the zone), it triggers:
- Visual ceremony (glow pulse, particle burst)
- Audio sting
- Optional: decorative gate opens or room lights change

This is additive — the room works without it, the plate adds a discovery moment.

## Verification

- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- All existing tests pass
- New tests for: physics object creation, bend application, object collision, room definition
- Manual playtest: enter Workshop, press Q, enlarge rock, push it, shrink crate, push it aside
- Room transitions clean: no physics objects leaking to Room 6
