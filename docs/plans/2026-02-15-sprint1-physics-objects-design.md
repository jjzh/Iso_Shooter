# Sprint 1 Design: Destructible Terrain + Moveable Physics Objects

> Sprint 1 milestone: "A rock can be pushed into a pillar and the pillar breaks."

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Collision primitive for PhysicsObjects | **Circle** (radius-based) | Reuses enemy collision math (circle-vs-circle, circle-vs-AABB). Smoother push/bounce feel than AABB. The existing system already mixes circles (enemies) with AABBs (obstacles). |
| Integration architecture | **Parallel entity system** | Separate `physicsObjects[]` array + processing loops that mirror the enemy system. Lower risk of breaking existing enemy physics. Some velocity/collision code duplication (~50 lines), but clean separation. Refactor to shared PhysicsBody interface later if we add more entity types. |
| Push resistance model | **Mass-only** (no knockbackResist) | For PhysicsObjects, mass alone determines how far a push moves them. More physically intuitive — heavier = harder to push. Simpler than duplicating the knockbackResist concept. |
| Obstacle health storage | **On the Obstacle interface** (not a Map) | Obstacles are runtime state rebuilt per room. A Map keyed by array index breaks when obstacles are spliced out. Co-located data is simpler. |
| Editor tooling | **Deferred to Sprint 1.5/2** | Physics code first with hardcoded test room. Editor designed after we understand what behaviors need visualization. Editor will be a merge candidate for main (all prototypes benefit). |

---

## Data Model

### Obstacle (Extended)

```typescript
export interface Obstacle {
  x: number; z: number; w: number; h: number; d: number;
  // New fields:
  destructible?: boolean;     // default false (walls, solid pillars)
  health?: number;            // current HP (only meaningful if destructible)
  maxHealth?: number;         // original HP (for crack overlay at <50%)
  material?: 'stone' | 'wood' | 'metal' | 'ice';
}
```

### PhysicsObject (New)

```typescript
export interface PhysicsObject {
  id: number;
  pos: { x: number; z: number };
  vel: { x: number; z: number };
  radius: number;
  mass: number;
  health: number;
  maxHealth: number;
  material: 'stone' | 'wood' | 'metal' | 'ice';
  meshType: 'rock' | 'crate' | 'barrel' | 'pillar';
  scale: number;
  restitution?: number;      // per-object override; undefined = use PHYSICS.enemyBounce
  mesh: any;                 // THREE.Group
  destroyed: boolean;        // true when health <= 0 or fell in pit
  fellInPit: boolean;        // true specifically for pit fall (sinking animation)
}
```

Design notes:
- `destroyed` + `fellInPit` follow the enemy pattern: objects stay in the array when destroyed (for death animations), skipped in physics loops, cleaned up on room transition.
- `restitution` reserved for Sprint 2 "Bouncy" bend. Defaults to global `PHYSICS.enemyBounce` when undefined. Costs nothing now.
- No `modifiers` field — bends are Sprint 2. The bend system will mutate fields directly + store a snapshot for undo.
- `health` is non-optional. "Indestructible" objects use high health (9999).

### PhysicsObjectPlacement (Room Config)

```typescript
export interface PhysicsObjectPlacement {
  meshType: 'rock' | 'crate' | 'barrel' | 'pillar';
  material: 'stone' | 'wood' | 'metal' | 'ice';
  x: number;
  z: number;
  mass: number;
  health: number;
  radius: number;
  scale?: number;  // default 1
}
```

Separates static room config from runtime PhysicsObject state (vel, destroyed, mesh).

### GameState Extension

```typescript
export interface GameState {
  // ... existing fields ...
  physicsObjects: PhysicsObject[];
}
```

### RoomDefinition Extension

```typescript
export interface RoomDefinition {
  // ... existing fields ...
  physicsObjects?: PhysicsObjectPlacement[];
}
```

---

## Collision Design

### Interaction Matrix

| A <-> B | Method | Behavior |
|---------|--------|----------|
| Object <-> Wall | `circleVsAABB` (existing) | Bounce + wall slam feedback if speed > threshold |
| Object <-> Obstacle | `circleVsAABB` (existing) | Bounce + damage to destructible obstacles proportional to impact speed |
| Object <-> Enemy | circle-vs-circle (reuse enemy-enemy math) | Mass-weighted separation + elastic collision + impact damage to enemy |
| Object <-> Object | circle-vs-circle (same) | Elastic collision |
| Object <-> Pit | `pointInPit` (existing) | Fall in, play sinking animation |
| Object <-> Force push | `isInRotatedRect` (existing) | Velocity impulse: `v0 = sqrt(2 * friction * (force / mass))`. Same wave occlusion as enemies. |
| Enemy <-> Destructible obstacle | separate check on velocity | When enemy with active velocity hits a destructible obstacle, deal impact damage to the obstacle |

### Obstacle Damage Identification

The current `getCollisionBounds()` returns anonymous AABBs — no way to trace which obstacle was hit. For destructible obstacles, we need to know WHICH obstacle was hit.

Solution: A separate obstacle-specific collision check that runs only for entities (enemies/objects) with active velocity above the slam threshold. Iterates `OBSTACLES` directly rather than through the bounds cache. Only runs on the velocity-active subset, so no hot-path impact.

### Deferred Removal

Following the enemy pattern: destroyed objects/obstacles are marked (not spliced) during physics processing. Removal happens at end of frame or on room transition. This avoids index-shift bugs during iteration.

For obstacles specifically: when `health <= 0`, mark as destroyed, remove from OBSTACLES array at end of frame, call `invalidateCollisionBounds()`.

---

## New Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `objectPushed` | Force push hits a physics object | `{ object, position }` |
| `objectWallSlam` | Object hits wall above speed threshold | `{ object, speed, damage, position }` |
| `objectImpact` | Object-enemy or object-object collision above speed threshold | `{ objectA, objectB/enemy, speed, damage, position }` |
| `objectDestroyed` | Object health reaches 0 | `{ object, position }` |
| `objectPitFall` | Object falls into pit | `{ object, position }` |
| `obstacleDestroyed` | Destructible obstacle breaks | `{ obstacleIndex, position }` |

These wire into the existing audio + particles systems via event bus subscriptions.

---

## Physics Processing Order

In the game loop, PhysicsObject processing slots in alongside existing systems:

1. `applyVelocities()` — enemy velocity integration (existing)
2. **`applyObjectVelocities()`** — PhysicsObject velocity integration (new, mirrors #1)
3. `resolveEnemyCollisions()` — enemy-enemy collision (existing)
4. **`resolveObjectCollisions()`** — object-object, object-enemy collision (new)
5. **`resolveObjectObstacleCollisions()`** — object vs destructible obstacles (new)
6. `checkCollisions()` — player, projectiles, force push (existing, extended for objects)
7. `checkPitFalls()` — existing (extended to check objects too)
8. **`processDestroyedObstacles()`** — deferred obstacle removal (new)

Force push detection in `checkCollisions()` is extended to include PhysicsObjects alongside enemies in the candidate list.

---

## Test Room (Hardcoded for Sprint 1)

Room 1 ("The Approach") gets modified with physics objects for testing:

- **1 destructible stone pillar** — moderate health (~50), positioned mid-room
- **1 pushable stone rock** — medium mass (2.0), radius 0.8, positioned near the pillar
- **1 light barrel** — low mass (0.5), radius 0.5, near the pit
- Existing pit stays for pit-fall testing

This validates the milestone chain: force push rock -> rock collides with pillar -> pillar takes damage -> pillar breaks.

---

## Visual Feedback

### PhysicsObjects
- Mesh creation: simple Three.js geometry per meshType (sphere for rock, box for crate, cylinder for barrel)
- Color based on material (stone=gray, wood=brown, metal=silver, ice=light blue)
- Flash on impact (same emissive flash pattern as enemies)

### Destructible Obstacles
- Different color/material than indestructible obstacles (slightly desaturated, subtle crack texture possible later)
- When health < 50%: emissive tint or color shift to indicate damage
- On destruction: debris particles (reuse DEATH_PUFF-style burst), break sound, screen shake, `invalidateCollisionBounds()`

### Object Physics
- Wall slam: impact ring (reuse `createAoeRing`), screen shake, bounce
- Pit fall: sinking ghost animation (reuse `spawnPitFallGhost` pattern)
- Push: flash + "PUSH" damage number (same as enemy push feedback)

---

## New Config

### PHYSICS extensions

```typescript
// Add to existing PHYSICS config:
objectFriction: 25,           // same as enemy friction (can diverge later)
objectWallSlamMinSpeed: 3,    // same thresholds as enemies
objectWallSlamDamage: 8,
objectImpactMinSpeed: 2,
objectImpactDamage: 5,
```

Initially mirroring enemy values. Exposed in tuning panel for independent adjustment.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/entities/physicsObject.ts` | PhysicsObject creation, mesh setup, cleanup |
| `src/config/physicsObjects.ts` | Default configs, material presets |

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Extend Obstacle, add PhysicsObject + PhysicsObjectPlacement, extend GameState |
| `src/engine/physics.ts` | Add object velocity integration, object-object/object-enemy/object-obstacle collision, extend force push for objects, extend pit falls |
| `src/config/arena.ts` | Handle destructible obstacle removal + bounds invalidation |
| `src/config/rooms.ts` | Add physicsObjects to RoomDefinition, add test objects to Room 1 |
| `src/engine/game.ts` | Add PhysicsObject update calls to game loop |
| `src/engine/roomManager.ts` | Spawn/clear PhysicsObjects on room load/unload |
| `src/engine/renderer.ts` | PhysicsObject mesh creation, destructible obstacle visuals |
| `src/engine/events.ts` | Add new event types |
| `src/engine/audio.ts` | Subscribe to new events for impact/break sounds |
| `src/engine/particles.ts` | Add debris burst preset, subscribe to new events |
| `src/ui/tuning.ts` | Add Physics Objects tuning section |
| `src/config/physics.ts` | Add object-specific physics constants |

## Tests to Write

| Test file | Coverage |
|-----------|----------|
| `tests/physics-objects.test.ts` | Object pushed by force push (velocity proportional to force/mass), object-wall slam, object-pit fall, object-object elastic collision, object-enemy collision with damage, heavy vs light mass behavior |
| `tests/destructible-obstacles.test.ts` | Obstacle takes damage from object impact, obstacle takes damage from enemy collision, obstacle removed from collision bounds on destruction, indestructible obstacles unaffected, deferred removal doesn't corrupt indices |

---

## Follow-up: Room Editor (Sprint 1.5/2)

The current spawn/level editor (2570 lines) handles obstacles and pits with slider-based property editing. Rule-bending needs a more capable editor because spatial relationships between objects ARE the gameplay.

Planned editor improvements (designed after Sprint 1 physics implementation):
- PhysicsObject placement, selection, drag-to-move
- Axis-aligned resize handles (drag edges to resize obstacles)
- Material/health/mass property editing
- Circle collision radius visualization for PhysicsObjects
- Enemy + object visualization together (see spatial relationships)
- Physics preview (destruction direction, trajectory hints) — stretch goal
- Merge candidate for main (all prototypes benefit)

Editor scope deferred intentionally: need to understand physics object behaviors before designing the tool that authors them.

---

## Open Questions (for playtesting)

1. Should object-wall slam damage the object, the wall, or both?
2. Do objects need a "minimum push speed" below which they don't take/deal damage? (Prevents micro-collisions from slowly depleting health.)
3. Should destroyed obstacles leave behind a "rubble" physics object (debris you can push)?
4. How should object-on-object stacking work? (A rock on top of a crate — is this even needed for Sprint 1?)
