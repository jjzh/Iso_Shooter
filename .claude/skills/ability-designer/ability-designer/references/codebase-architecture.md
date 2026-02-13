# Iso_Shooter Codebase Architecture

Reference for the ability-designer skill. Read this when you need to map
a design to specific files and patterns.

## Project Structure

```
Iso_Shooter/
├── config/           # Data-driven game configuration
│   ├── abilities.js  # Player ability definitions (dash, force push)
│   ├── effectTypes.js # Effect system definitions (ice, fire, slow, stun, etc.)
│   ├── enemies.js    # Enemy type configs (stats, behaviors)
│   ├── player.js     # Player stats
│   ├── waves.js      # Wave spawn definitions
│   ├── arena.js      # Arena layout (obstacles, pits, walls)
│   └── boss.js       # Boss config
├── engine/           # Core game systems
│   ├── game.js       # Main game loop & update order
│   ├── physics.js    # Collision, pit detection, knockback (AABB raycasting)
│   ├── effectSystem.js # Effect management, stacking, modifiers
│   ├── aoeTelegraph.js # Visual AoE shapes (rings, rectangles)
│   ├── input.js      # Keyboard, gamepad, touch input
│   ├── renderer.js   # Three.js scene setup
│   ├── waveRunner.js # Wave timing & spawning
│   └── pools.js      # Object pooling for projectiles
├── entities/         # Game objects
│   ├── player.js     # Player with dash & force push (545 lines)
│   ├── enemy.js      # Enemy AI & behaviors (1220 lines)
│   ├── projectile.js # Pooled projectiles
│   └── mortarProjectile.js # Arc projectiles + ice patches
└── ui/               # HUD, damage numbers, tuning panel, spawn editor
```

## Existing Player Abilities

### Shadow Dash (Space)
```javascript
// config/abilities.js
dash: {
  duration: 200,      // ms
  distance: 5,        // units
  cooldown: 3000,     // ms
  endLag: 50,         // ms
  afterimageCount: 3,
  // Full i-frames during dash, can't shoot
}
```

### Force Push (E) — Chargeable
```javascript
// config/abilities.js
forcePush: {
  chargeTime: 1500,        // ms to max charge
  minLength: 3, maxLength: 12,  // rectangle scales with charge
  width: 3,                // constant width
  knockbackMin: 1.5, knockbackMax: 5,  // scales with charge
  moveSpeedWhileCharging: 0.4,  // 40% speed
  cooldown: 5000,
}
```

## Pattern: Adding a New Player Ability

### Step 1: Config entry in `config/abilities.js`
```javascript
newAbility: {
  name: 'New Ability',
  key: 'Q',           // input key
  cooldown: 4000,     // ms
  // ability-specific params...
}
```

### Step 2: State variables in `entities/player.js`
```javascript
let isUsingAbility = false;
let abilityTimer = 0;
// Add to cooldownRemaining tracking
```

### Step 3: Input handling in `updatePlayer()`
- Check key press in input system
- Gate behind cooldown check
- Set state variables, start timers

### Step 4: Update logic in `updatePlayer()`
- Tick timers each frame
- Apply effects (damage, knockback, etc.)
- Clean up on completion

### Step 5: Add to `gameState.abilities` cooldown tracking

## Pattern: Adding a New Effect Type

Define in `config/effectTypes.js`:
```javascript
'myEffect': {
  name: 'My Effect',
  modifiers: {
    speedMult: 0.5,      // multiplicative (0-10x)
    knockbackMult: 1.5,  // multiplicative
    canAct: false,       // boolean (stun)
    damagePerSec: 10,    // additive DoT
  },
  stacking: {
    maxStacks: 1,
    rule: 'replace' | 'multiplicative' | 'additive' | 'longest'
  },
  duration: 2000,        // ms
  targets: { player: true, enemies: true },
  visual: { zone: {...}, entity: {...} },
}
```

Variants use parent inheritance: `'myEffect.major': { parent: 'myEffect', ... }`

Apply via: `applyEffect(entity, 'myEffect', { source })`

## Pattern: Adding a New Enemy Behavior

1. Config in `config/enemies.js` with `behavior: 'newBehavior'`
2. Function `behaviorNewBehavior(enemy, playerPos, dt, gameState)` in `entities/enemy.js`
3. Dispatch case in `updateEnemies()`

## Existing Enemy Types

| Type | Behavior | Key Trait |
|------|----------|-----------|
| Goblin | rush | Melee charge, pit leap |
| Skeleton Archer | kite | Sniper shot, slow on hit, friendly fire |
| Ice Mortar Imp | mortar | Arc projectiles, ice patches, AoE slow |
| Crystal Golem | tank | Shield, charge attack, death explosion |

## Physics System (`engine/physics.js`)

- AABB collision with slab-method raycasting
- Arena boundary clamping (±19-19.5 on X and Z)
- Obstacle collision via raycasting
- Pit edge-sliding (deflects movement sideways near pits)
- Knockback system based on `knockbackMult` modifier
- Pit fall = instant death

## AoE Telegraph System (`engine/aoeTelegraph.js`)

Two shape functions available:
- `applyAoeEffect({ x, z, radius, durationMs, color, effectFn, gameState })` — ring
- `applyAoeRectEffect({ x, z, width, height, rotation, telegraphDurationMs, ... })` — rectangle

## Game Loop Update Order

1. Input → 2. Player → 3. Projectiles → 4. Wave spawns →
5. Enemies → 6. Collisions → 7. Pit falls → 8. Effect ghosts →
9. AoE telegraphs → 10. Mortar projectiles → 11. Ice patches →
12. Game over check → 13. Render

## Live Tuning

- Right-side slider panel (`ui/tuning.js`) for runtime parameter adjustment
- URL parameters for test scenarios (`engine/urlParams.js`)
- Spawn editor (backtick key) for wave testing
