# Iso Battler — Parameter Reference

All tunable parameters, what they do, default values, and units. Use the Spawn Editor (backtick key) and Tuning Panel (right side) to adjust these live during gameplay.

---

## Wave Timing

These control when and how groups of enemies spawn within a wave. Adjusted via the spawn editor's timing sliders.

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `triggerDelay` | Time after wave enters "running" before this group's telegraph begins. Use this to stagger multiple groups within a wave (e.g., goblins first, archers 3s later). | Varies per group | ms | Trigger Delay |
| `telegraphDuration` | How long the pulsing warning circles appear on the ground before enemies materialize. This is the player's reaction window. Shorter = harder. | 1500 | ms | Telegraph Time |
| `stagger` | Time between each individual enemy spawning within a group. 0 = all spawn simultaneously. | 200 | ms | Spawn Stagger |

### Timeline Example

For a group with `triggerDelay: 3000`, `telegraphDuration: 1500`, `stagger: 200`, and 3 goblins:

- **T=0.0s** — Wave starts, "running" phase begins
- **T=3.0s** — Telegraph circles appear on ground (trigger delay elapsed)
- **T=4.5s** — First goblin spawns (telegraph duration elapsed)
- **T=4.7s** — Second goblin spawns (+200ms stagger)
- **T=4.9s** — Third goblin spawns (+200ms stagger)

---

## Player Parameters

Adjusted via the Tuning Panel (right side of screen).

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `PLAYER.speed` | Player movement speed | 5 | units/s | Move Speed |
| `PLAYER.fireRate` | Time between player shots | 410 | ms | Fire Rate |
| `PLAYER.projectile.speed` | Player projectile travel speed | 16 | units/s | Proj Speed |
| `PLAYER.projectile.size` | Player projectile radius | 0.2 | units | Proj Size |
| `PLAYER.projectile.damage` | Damage per player projectile | 10 | HP | — |
| `PLAYER.maxHealth` | Player maximum health | 100 | HP | — |

---

## Goblin

Fast melee rusher. Charges directly at the player, stops at close range and attacks repeatedly.

**Behavior:** `rush` — Move directly toward player at full speed, stop within `stopDistance`.

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `health` | Hit points before death | 30 | HP | Health |
| `speed` | Movement speed | 2.45 | units/s | Speed |
| `damage` | Melee damage per hit | 10 | HP | Damage |
| `attackRate` | Minimum time between melee attacks | 800 | ms | Attack Rate |
| `attackRange` | Distance at which melee attack triggers | 1.5 | units | — |
| `knockbackResist` | Resistance to knockback from player projectiles. 0 = full knockback, 1 = immune. | 0 | 0-1 | KB Resist |
| `rush.stopDistance` | How close to the player before the goblin stops moving | 0.5 | units | Stop Dist |

**Drops:** 1-3 currency, 10% chance of health drop.

---

## Skeleton Archer

Fragile ranged sniper. Maintains distance from player, retreats if too close, advances if too far. Fires a long-range AoE corridor shot that damages **everything** in its path — including the player and other enemies (friendly fire).

**Behavior:** `kite` — Maintains `attackRange * preferredRangeMult` distance. When attack is ready, locks aim toward player, shows a pulsing purple rectangle telegraph on the ground ("laser sight"), then fires. Archer freezes during the telegraph (lining up the shot).

### Core Stats

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `health` | Hit points before death | 20 | HP | Health |
| `speed` | Movement speed | 1.4 | units/s | Speed |
| `damage` | Base damage value | 15 | HP | Damage |
| `attackRate` | Time between shots (including telegraph) | 2500 | ms | Attack Rate |
| `attackRange` | Maximum distance to initiate a shot | 12 | units | Attack Range |
| `knockbackResist` | Knockback resistance | 0.1 | 0-1 | KB Resist |

### Sniper Shot

When the attack cooldown is ready and player is within `attackRange`, the archer:
1. **Locks aim** at the player's current position
2. **Raycasts terrain** — the corridor is clipped at the first obstacle or wall in the aim direction (shot stops at terrain)
3. **Shows rectangle telegraph** on the ground (purple pulsing corridor, clipped to terrain)
4. **Freezes in place** for `telegraphDuration` ms (lining up the shot)
5. **Telegraph flashes bright** in the last 100ms — fill and border ramp to high opacity, color shifts toward white (warning that the shot is about to fire)
6. **Fires** — everything in the corridor takes `damage` and is **slowed** (player, goblins, golems, other archers)
7. **Linger rect** shows briefly at full brightness, then fades

**Friendly fire:** The shot damages ALL enemies in the corridor (not just the player) — goblins, golems, and other archers. The only enemy excluded is the archer that fired the shot.

**Terrain interaction:** The corridor is clipped by obstacle collision — if an obstacle is between the archer and the maximum shot range, the corridor stops at the obstacle. This means players can use cover to block sniper shots.

Enemies hit by the sniper shot are slowed for `slowDuration` ms, moving at `slowMult` of their normal speed. A "SLOWED" label appears above each affected enemy.

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `sniper.telegraphDuration` | How long the laser sight shows before firing. This is the player's dodge window. Shorter = harder. | 800 | ms | Sniper Telegraph |
| `sniper.shotWidth` | Width of the damage corridor (perpendicular to aim) | 1.2 | units | Shot Width |
| `sniper.shotLength` | Length of the damage corridor (along aim direction) | 14 | units | Shot Length |
| `sniper.damage` | Damage dealt to everything in the corridor | 15 | HP | Sniper Dmg |
| `sniper.slowDuration` | How long enemies hit by sniper are slowed | 1000 | ms | Slow Dur |
| `sniper.slowMult` | Speed multiplier while slowed. 0.5 = half speed | 0.5 | multiplier | Slow Mult |
| `sniper.color` | Telegraph + flash color | 0xaa44ff | hex | — |
| `sniper.lingerDuration` | How long the fired shot rect stays visible | 200 | ms | — |

### Kite Movement

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `kite.preferredRangeMult` | Multiplier on `attackRange` for ideal distance. Lower = fights closer. | 0.7 | multiplier | Pref Range % |
| `kite.retreatBuffer` | How far inside preferred range before retreating. Higher = more aggressive retreat. | 1 | units | Retreat Buf |
| `kite.advanceBuffer` | How far outside preferred range before advancing. Higher = more tolerant of distance. | 3 | units | Advance Buf |

**Drops:** 2-4 currency, 5% chance of health drop.

### Kite Behavior Diagram

```
<─ RETREAT ─> <── IDLE ZONE ──> <── ADVANCE ──>
0 ............|.preferred range.|.................. player
              ^                 ^
    preferred - retreatBuffer   preferred + advanceBuffer
```

### Sniper Shot Diagram

```
Archer                    Player
  ■ ═══════════════════════ ○
  │<── shotLength (14u) ──>│
  │   shotWidth (1.2u)     │
  │   ┌──────────────┐     │
  │   │  DAMAGE ZONE │     │  ← everything here takes sniper.damage
  │   └──────────────┘     │
```

---

## Mortar Imp

Ranged AoE lobber. Maintains distance from the player (kite behavior), then aims a lobbed projectile at a point near the player. The projectile travels along a visible parabolic arc, then explodes on impact, dealing AoE damage and slowing everything in the blast radius — including other enemies (friendly fire).

**Behavior:** `mortar` — Uses kite movement (same as archer). When attack is ready, picks a target near the player (with random inaccuracy offset), shows an aim arc line + ground circle telegraph, then fires a lobbed projectile.

### Core Stats

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `health` | Hit points before death | 25 | HP | Health |
| `speed` | Movement speed | 1.6 | units/s | Speed |
| `damage` | Base damage value | 12 | HP | Damage |
| `attackRate` | Cooldown between mortar shots (includes aim time) | 3000 | ms | Attack Rate |
| `attackRange` | Maximum distance to initiate a mortar shot | 14 | units | Attack Range |
| `knockbackResist` | Knockback resistance | 0.1 | 0-1 | KB Resist |

### Mortar Shot

When the attack cooldown is ready and player is within `attackRange`, the mortar imp:
1. **Picks target** — Player position + random offset within `inaccuracy` radius
2. **Shows telegraph** — Pulsing aim arc line from imp to target + expanding ground circle at landing zone
3. **Freezes in place** for `aimDuration` ms (aiming the shot)
4. **Fires** — Glowing orange projectile launches along the parabolic arc with a trailing line
5. **Impact** — AoE explosion at landing point damages and slows everything in `blastRadius`

**Friendly fire:** The explosion damages ALL enemies in the blast radius (not just the player). Only the mortar imp that fired is excluded.

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `mortar.aimDuration` | How long the aim telegraph shows. This is the player's dodge window. | 1200 | ms | Aim Duration |
| `mortar.projectileSpeed` | Projectile travel speed along the arc | 8 | units/s | Proj Speed |
| `mortar.arcHeight` | Peak height of the parabolic arc | 6 | units | Arc Height |
| `mortar.blastRadius` | AoE damage radius on impact | 2.5 | units | Blast Radius |
| `mortar.damage` | Damage dealt to everything in the blast | 18 | HP | Mortar Dmg |
| `mortar.inaccuracy` | Random offset from player position. Higher = less accurate. | 1.5 | units | Inaccuracy |
| `mortar.slowDuration` | How long targets are slowed on hit | 800 | ms | Slow Dur |
| `mortar.slowMult` | Speed multiplier while slowed | 0.6 | multiplier | Slow Mult |
| `mortar.color` | Telegraph + explosion color | 0xff6622 | hex | — |
| `mortar.explosionDuration` | How long the impact ring visual lasts | 300 | ms | — |

### Kite Movement

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `kite.preferredRangeMult` | Multiplier on `attackRange` for ideal distance | 0.65 | multiplier | Pref Range % |
| `kite.retreatBuffer` | How far inside preferred range before retreating | 1.5 | units | Retreat Buf |
| `kite.advanceBuffer` | How far outside preferred range before advancing | 3 | units | Advance Buf |

**Drops:** 2-5 currency, 8% chance of health drop.

---

## Crystal Golem

Slow, tanky melee fighter with a charge attack and a shield. Shield must be broken before HP damage is dealt. Shield break stuns the golem and nearby enemies.

**Behavior:** `tank` — Moves slowly toward player. Periodically charges at triple speed for a burst of damage. Has a shield that absorbs damage.

### Core Stats

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `health` | Hit points (after shield is broken) | 80 | HP | Health |
| `speed` | Base movement speed | 1.05 | units/s | Speed |
| `damage` | Base melee damage | 25 | HP | Damage |
| `attackRate` | Minimum time between melee hits | 1200 | ms | Attack Rate |
| `attackRange` | Melee attack trigger distance | 2.0 | units | — |
| `knockbackResist` | Knockback resistance. Golem barely moves when hit. | 0.6 | 0-1 | KB Resist |

### Charge Attack

When off cooldown and player is within range, the golem flashes white and charges at `speed * chargeSpeedMult` for `chargeDuration` ms. Charge deals `damage * chargeDamageMult`.

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `tank.chargeSpeedMult` | Speed multiplier during charge | 3 | multiplier | Charge Speed |
| `tank.chargeDuration` | How long the charge lasts | 500 | ms | Charge Dur |
| `tank.chargeCooldownMin` | Minimum time between charges | 3000 | ms | Charge CD Min |
| `tank.chargeCooldownMax` | Maximum time between charges (random within range) | 5000 | ms | Charge CD Max |
| `tank.chargeMinDist` | Minimum distance to player to initiate charge | 2 | units | — |
| `tank.chargeMaxDist` | Maximum distance to player to initiate charge | 10 | units | — |
| `tank.chargeDamageMult` | Damage multiplier when hitting player during charge | 1.5 | multiplier | Charge Dmg |
| `tank.telegraphDuration` | White flash duration before charge begins | 300 | ms | — |

### Shield

The golem spawns with a translucent sphere shield. All damage hits the shield first. When shield HP reaches 0:
1. Shield visually shatters (removed from scene)
2. Golem is **stunned** (frozen, can't move or attack) for `stunDuration`
3. Expanding cyan shockwave ring radiates outward over `breakRingDuration` ms
4. Enemies are stunned **as the ring reaches them** (cascade effect — closest first)
5. Screen shake + "BREAK" damage number in cyan on golem, "STUNNED" on each affected enemy

**Shield visual feedback:** Opacity fades and color shifts from cyan to red as shield weakens. Below 25% HP, the shield flickers rapidly.

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `shield.maxHealth` | Shield hit points. Set to 0 to disable shield. | 40 | HP | Shield HP |
| `shield.stunRadius` | AoE stun radius when shield breaks | 5 | units | Stun Radius |
| `shield.stunDuration` | How long the golem + nearby enemies are stunned | 1500 | ms | Stun Dur |
| `shield.breakRingDuration` | How long the shockwave ring takes to expand to stunRadius. Controls cascade timing — longer = more visible ripple. | 400 | ms | — |
| `shield.color` | Shield mesh color | 0x88eeff | hex | — |
| `shield.emissive` | Shield glow color | 0x44ccff | hex | — |
| `shield.opacity` | Shield base opacity (at full HP) | 0.35 | 0-1 | — |

### Death Explosion

When the crystal golem dies, it explodes, dealing AoE damage to everything nearby (enemies + player). Visual: expanding cyan ring + "BOOM" text on the dying golem + damage numbers on each hit target.

| Parameter | Description | Default | Unit | Slider |
|-----------|-------------|---------|------|--------|
| `deathExplosion.radius` | AoE damage radius on death | 4 | units | Explode Rad |
| `deathExplosion.damage` | Damage dealt by the explosion | 20 | HP | Explode Dmg |
| `deathExplosion.stunDuration` | Stun applied to enemies caught in explosion. 0 = no stun. | 0 | ms | Explode Stun |
| `deathExplosion.color` | Explosion ring color | 0x44ddff | hex | — |
| `deathExplosion.ringDuration` | Expanding ring visual duration | 400 | ms | — |

**Drops:** 3-6 currency, 20% chance of health drop.

---

## Stun Mechanic

Any enemy can be stunned. A stunned enemy:
- **Cannot move** (speed effectively 0)
- **Cannot attack** (melee and projectile attacks suppressed)
- **Freezes in place** for the stun duration

Triggered by Crystal Golem shield break (AoE stun) and optionally by Crystal Golem death explosion (if `deathExplosion.stunDuration > 0`). The system is generic and can be applied to any enemy via `stunEnemy(enemy, durationMs)`.

---

## Slow Mechanic

Any enemy can be slowed. A slowed enemy:
- **Moves at reduced speed** (speed multiplied by `slowMult`, e.g., 0.5 = half speed)
- **Can still attack** (only movement is affected)
- **Duration-based** — automatically expires after `slowDuration` ms

Triggered by:
- **Skeleton Archer sniper shots** — enemies in the corridor are slowed
- **Mortar Imp explosions** — enemies in the blast radius are slowed

Applied via `slowEnemy(enemy, durationMs, mult)`.

A "SLOWED" damage number in light purple (`#cc88ff`) appears above each affected enemy.

---

## AoE Telegraph System

The AoE telegraph system provides visual communication for area-of-effect mechanics. It supports two shape types and a generic callback-based effect applicator.

### Shapes

| Shape | Function | Description |
|-------|----------|-------------|
| **Ring** | `createAoeRing(x, z, maxRadius, durationMs, color)` | Expanding circle that radiates outward with easeOutQuad easing. Starts thick + bright, thins + fades. |
| **Rectangle** | `createAoeRect(x, z, width, height, rotation, durationMs, color)` | Expanding rectangle with pulsing border. Fill ramps in over first 30%, then fades. Flashes bright white in last 100ms before completing. Supports rotation for directional effects. |

### Generic AoE Applicator

Use `applyAoeEffect()` to combine a visual telegraph with cascading per-target effects:

```js
applyAoeEffect({
  x, z,           // center position
  radius,          // effect radius
  durationMs,      // ring expansion time
  color,           // hex color (e.g., 0x88eeff)
  label,           // text shown on each target (e.g., 'STUNNED')
  effectFn,        // callback(enemy) — the actual effect
  gameState,       // for iterating enemies
  excludeEnemy,    // optional — skip this enemy
});
```

**Cascade timing:** Each enemy receives the effect when the expanding ring reaches their position. Delay = `(distance / radius) * durationMs`. Closest enemies react first, creating a visible ripple/shockwave.

### Rectangle AoE Applicator

Use `applyAoeRectEffect()` for telegraph-then-fire corridor effects (sniper shots, slam zones):

```js
applyAoeRectEffect({
  x, z,                  // center of rectangle
  width, height,         // dimensions
  rotation,              // Y-axis rotation (radians)
  telegraphDurationMs,   // warning phase duration
  lingerDurationMs,      // bright flash after firing
  color,                 // hex color
  damage,                // damage value
  enemyDamageFn,         // callback(enemy) — damage other enemies
  playerDamageFn,        // callback(cx, cz, w, h, rot) — damage player if inside
  gameState,
  excludeEnemy,
});
```

### Current Usage

| Trigger | Shape | Color | Label | Effect |
|---------|-------|-------|-------|--------|
| Shield break | Ring | Cyan `0x88eeff` | "STUNNED" | AoE stun cascade |
| Skeleton Archer sniper shot | Rectangle | Purple `0xaa44ff` | damage number | Corridor damage + slow to player + enemies |
| Mortar Imp impact | Ring | Orange `0xff6622` | "SLOWED" | AoE damage + slow to player + enemies |
| Crystal Golem death | Ring | Cyan `0x44ddff` | damage number | AoE damage (+ optional stun) on death |

### Future Usage Examples

| Effect | Shape | Color | Example |
|--------|-------|-------|---------|
| Golem ground slam | Rectangle | Red | Narrow rect in charge direction, damages player |
| Player AoE ability | Ring | Green | Blast centered on player |

---

## Damage Number Colors

| Color | Meaning |
|-------|---------|
| Green `#44ff88` | Player projectile hitting enemy HP |
| Cyan `#88eeff` | Player projectile hitting enemy shield |
| Red `#ff4466` | Enemy damage hitting player |
| Cyan "BREAK" text | Shield destroyed |
| Cyan "STUNNED" `#88eeff` | Enemy stunned by shield break |
| Light purple "SLOWED" `#cc88ff` | Enemy slowed by sniper shot |
| Orange "SLOWED" | Enemy slowed by mortar impact |
| Cyan "BOOM" | Crystal Golem death explosion |

---

## Config File Locations

| File | Contains |
|------|----------|
| `config/player.js` | Player stats (speed, fire rate, projectile config) |
| `config/enemies.js` | All enemy type definitions |
| `config/waves.js` | Wave data (groups, timing, spawn positions) |
| `config/arena.js` | Arena size and obstacle layout |
| `engine/aoeTelegraph.js` | AoE telegraph shapes (ring, rectangle) and generic effect applicator |
| `entities/mortarProjectile.js` | Mortar projectile arc flight + impact AoE system |

---

## Editor Controls

| Key/Action | Effect |
|------------|--------|
| `` ` `` (backtick) | Toggle spawn editor on/off |
| Left-click empty space | Place new spawn at cursor |
| Left-click existing spawn | Select it (drag to move) |
| Right-click / Shift-click | Delete nearest spawn |
| `1` / `2` / `3` / `4` | Select enemy type (Goblin / Archer / Mortar / Golem). If a spawn is selected, changes its type. |
| `Delete` / `Backspace` | Remove selected spawn (or clear group if none selected) |
| `Escape` | Deselect current spawn |
| `Cmd/Ctrl + Z` | Undo last action |
| `P` | Play current wave (exits editor, starts wave) |
