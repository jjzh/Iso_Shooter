# Room 5: "The Shadows" — Design Document

> Detection puzzle room for the portfolio demo. Enemies have visible awareness (vision cones, patrol patterns), and the player reads timing to navigate a maze. Bullet time provides a reaction window when spotted. Pits allow force push kills.

## Portfolio Narrative

Rooms 1-4 told the story of *dealing damage* — from pure movement to melee to physics to vertical combat. Room 5 shifts to *information*: enemies have visible awareness, and the player's job is to read patrol patterns, break line-of-sight with walls, and exploit timing windows. Pits in the maze connect back to the spatial physics from rooms 2-3.

**Design question this room answers:** "What happens when you shift the design challenge from damage to detection?"

## Source Branch

`explore/assassin` — stealth/vision-aware action prototype. ~620 tests, clean typecheck. Mechanics are working-to-polished maturity.

## Layout: Patrol Maze

- Grid-like wall segments creating 2-3 lanes/corridors
- ~4-5 wall obstacles defining the maze structure
- 2-3 pits at corridor intersections or dead ends (opportunistic force push spots)
- Cover pillars at key positions for LOS breaks
- Enemies patrol along lanes with pauses at endpoints
- Some stationary enemies scan side-to-side

### Enemy Placement

- **Patrolling goblins** (3-4): Walk lanes with configurable distance, speed, and pause timing. Create timing windows.
- **Stationary scanners** (1-2): Idle enemies that sweep ±60° from initial facing. Block corridors with sweeping cones.
- All enemies use vision cone + detection timer — no instant aggro.

## Mechanics

### From `explore/assassin` (new to portfolio)

| Mechanic | File | Description |
|----------|------|-------------|
| Vision cones | `src/engine/visionCone.ts` | Flat wedge on ground per enemy. Color ramp: green→yellow→orange→red. Opacity increases with detection progress. |
| LOS occlusion | `src/engine/visionCone.ts` | Cone vertices clip inward where walls block sight. Cover is visually readable. |
| Detection timer | `src/entities/enemy.ts` | Player must be in cone + LOS for 350ms before aggro. Timer resets on LOS break. |
| Patrol system | `src/entities/enemy.ts` | Enemies walk back-and-forth along facing axis. Configurable distance (6), speed (1.2), pause (500-1500ms). Terrain collision reversal. |
| Idle scan | `src/engine/visionCone.ts` + `enemy.ts` | Non-patrol enemies sweep ±60° sinusoidally at 0.4 rad/s. |
| Aggro indicator | `src/entities/enemy.ts` | Red "!" pop above enemy: scale 0→1.4 (120ms) → hold (600ms) → fade (400ms). |
| Bullet time | `src/engine/bulletTime.ts` | 0.25x time scale. Auto-triggers on `enemyAggroed` event. Q key manual toggle. Resource: 3000ms max, drains 1000ms/s, refills 600ms per kill. HUD meter. |

### Inherited from existing profiles

- Melee (LMB) — same as 'base' profile
- Dash (Shift) — always available
- Force push (E) — key for pit kills in the maze

### NOT included

- Dynamic hazard spawning (prototype quality)
- Assassination/backstab mechanics (don't exist)
- Archers (muddles detection focus)
- Vertical mechanics (different profile)

## Profile: `'assassin'`

- **Gates:** vision cones, detection timer, patrol behavior, bullet time, idle scan
- **Inherits:** melee, dash, force push (same ability set as `'base'`)
- **New HUD:** bullet time resource meter
- **New input:** Q = toggle bullet time

### HUD Changes

- Bullet time meter (top-left or similar) showing resource level
- Vignette overlay during slow-mo
- Ability slots: dash + ultimate (force push) — same as base
- Room name: "The Shadows"

## Room Definition

```typescript
{
  name: 'The Shadows',
  profile: 'assassin',
  sandboxMode: true,
  commentary: 'Detection as design challenge — vision cones, patrol timing, bullet time.',
  arenaHalfX: 14,
  arenaHalfZ: 14,
  obstacles: [
    // Maze walls — 4-5 wall segments creating lanes
    // Cover pillars at key intersections
  ],
  pits: [
    // 2-3 pits at corridor intersections/dead ends
  ],
  spawnBudget: {
    // 3-4 patrolling goblins + 1-2 stationary scanners
    // Lower budget than combat rooms — quality of placement over quantity
  },
  playerStart: { x: -10, z: -10 },  // Corner of maze
  enableWallSlamDamage: false,
  enableEnemyCollisionDamage: false,
  highlights: [
    // Optional: highlight pits on room entry
  ],
}
```

## Integration Approach

Same pattern as Phase 2 (vertical combat) — profile-gated superset:

1. **Copy unique files** from `explore/assassin`: `visionCone.ts`, `bulletTime.ts`
2. **Extend config** with assassin-specific values (detection threshold, cone angle, bullet time params)
3. **Extend types/events** for assassin mechanics (`enemyAggroed`, `bulletTimeActivated`, `bulletTimeDeactivated`)
4. **Gate mechanics** behind `getActiveProfile() === 'assassin'` in enemy.ts, game.ts, hud.ts
5. **Modify enemy.ts** to add patrol/detection/vision cone integration (profile-gated)
6. **Add Room 5 definition** with maze layout, pits, patrol enemies
7. **Register profile hooks** for cleanup (clear vision cones, reset bullet time on room switch)
8. **Copy relevant tests** from explore/assassin, update room tests

## Key Architecture Decisions

- **Patrol/detection in enemy.ts** — gated by profile, not a separate enemy type. Existing goblins gain patrol behavior in assassin rooms.
- **Vision cones as a rendering system** — separate from enemy logic. Reads enemy facing/position, renders cones independently.
- **Bullet time as global time scale** — affects all systems via `dt * timeScale`. Clean integration with existing physics/animation.
- **Force push + pits** — reuses existing mechanics, no new implementation needed. Just place pits strategically in the maze layout.
