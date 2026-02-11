# Effect System Implementation Handoff

This document captures the design decisions and progress on building a generalized effect system for the game, inspired by Unreal's Gameplay Ability System (GAS).

## What We're Building

A unified effect system that replaces scattered one-off implementations (ice patches, slow, stun) with a data-driven, extensible architecture supporting:

- **Effect Types** — Hierarchical definitions (e.g., `fire`, `fire.minor`, `fire.major`)
- **Effect Zones** — Spatial volumes (3D shapes) that apply effects to entities inside them
- **Modifier Aggregation** — Multiple effects combining according to rules
- **Immunities** — Entities can be immune to effect types
- **Periodic Effects** — Damage/heal over time with configurable tick intervals

---

## Design Decisions Made

### Stacking & Aggregation
| Topic | Decision |
|-------|----------|
| Same-type stacking | Multiplicative with per-type stack limits (e.g., max 1 ice stack = max 2x speed) |
| Cross-type stacking | Multiplicative (2x speed + 0.5x slow = 1x, they cancel) |
| Aggregation order | Order of application |
| Boolean conflicts | Last applied wins |

### Hierarchy & Inheritance
| Topic | Decision |
|-------|----------|
| Immunity inheritance | Parent immunity blocks children (`fire` blocks `fire.minor`) |
| Query inheritance | Child satisfies parent query (`fire.minor` matches `hasEffect('fire')`) |
| Hierarchy depth | No hard limit, expect ≤3 in practice |

### Zone Lifecycle
| Topic | Decision |
|-------|----------|
| Zone expiry | Effect-determined (duration can outlive zone) |
| Zone shrink past entity | Instant removal (unless effect has longer duration) |
| Attached zone owner dies | `persistsOnDeath` boolean per effect type |
| Zone entry | Apply on enter, refresh on re-enter |
| Continuous effects | Reapply at fixed interval (not every frame) |
| Periodic tick | First tick on enter if configured, then interval-based |
| Zone effect changes | Live reference |

### Source & Attribution
| Topic | Decision |
|-------|----------|
| Kill credit | Source enemy that created the zone |
| Effect source query | Yes, can ask "what effects is X applying to me" |

### Immunity
| Topic | Decision |
|-------|----------|
| Immunity acquired | Clears all related effects + visuals immediately |
| Resistance | Skip for now, binary immunity only |
| Immunity sources | Can be temporary or permanent |

### Visuals
| Topic | Decision |
|-------|----------|
| Overlapping zones | Render both for now |
| Entity feedback | Color tint + status icon (lightweight) |

### Shapes (3D)
| Topic | Decision |
|-------|----------|
| Primitives | Sphere, cube, rectangular prism, torus (donut), half-sphere |
| Rectangles | Arbitrary rotation supported |
| Cones | 2D angle+distance for now, attachToFacing option |
| 3D support | Build in from start, most zones use full Y range |

### Future Features (designed for, not yet implemented)
- Elemental reactions (fire + ice = shatter)
- Effect blocking (silence prevents abilities)
- Effect chains / overflow effects

### Modifier Bounds
| Modifier | Min | Max |
|----------|-----|-----|
| speedMult | 0 | 10x |
| knockbackMult | 0 (= immune) | 10x |

---

## Files Already Created

### `config/effectTypes.js`
Effect type definitions with:
- Hierarchical inheritance (`ice`, `ice.minor`, `ice.major`)
- Modifier definitions (speedMult, knockbackMult, canAct, etc.)
- Stacking rules per type
- Periodic effect configs (damage/heal intervals)
- Visual configs (zone color, entity tint)
- Target filters (player, enemies)
- `resolveEffectType()` — merges child with parent chain
- `effectTypeMatches()` — checks if type matches query (including parent)

### `engine/effectSystem.js`
Core effect logic with:
- `createEffect()` — instantiate an effect from type
- `initEntityEffects()` — initialize effect tracking on entity
- `applyEffect()` — apply effect with immunity/stacking handling
- `removeEffect()`, `removeEffectsByType()`, `removeEffectsBySource()`, `removeEffectsByZone()`
- `getModifiers()` — aggregated modifiers from all active effects
- `hasEffect()`, `getEffectsOfType()`, `getEffectsFromSource()`
- `isImmuneTo()`, `grantImmunity()`, `revokeImmunity()`
- `updateEntityEffects()` — tick durations and periodic effects
- `onSourceDeath()` — cleanup effects when source dies

---

## What's Left To Build

### 1. `engine/effectZones.js`
Spatial zone system with:
- Zone creation with 3D shapes (sphere, cube, cylinder, torus, cone)
- Zone registry (activeZones array)
- Overlap detection for each shape type
- Zone attachment to entities (moving zones)
- Zone evolution (expand, shrink, pulse)
- Zone lifecycle (duration, fade, cleanup)
- Visual rendering (ground circles, 3D volumes)
- Integration with effectSystem (apply/remove effects on enter/exit)

### 2. Migration Tasks
- **Migrate ice patches** — Move from `mortarProjectile.js` to new zone system
- **Migrate slow/stun** — Replace `slowEnemy()`/`stunEnemy()` with `applyEffect()`
- **Update movement code** — Replace scattered checks with unified `getModifiers()`

### 3. Validation
- Add fire effect zones to prove the system works
- Update unit tests
- Run Puppeteer verification

---

## Current Ice Implementation (to migrate)

The current ice system in `mortarProjectile.js` has:
- `activeIcePatches[]` — tracking array
- `createIcePatch()` — creates visual + adds to array
- `updateIcePatches()` — ticks timers, fades, removes expired
- `getIceEffects(x, z, isPlayer)` — returns `{ speedMult, knockbackMult }`
- `clearIcePatches()` — cleanup on restart

This is called from:
- `entities/player.js` — player movement speed
- `entities/enemy.js` — enemy movement (rush, kite, mortar, tank behaviors)
- `engine/physics.js` — knockback force multiplier

The migration should:
1. Create ice zones via the new system
2. Have zones auto-apply `ice` effect to overlapping entities
3. Replace `getIceEffects()` calls with `getModifiers(entity).speedMult` etc.

---

## Current Slow/Stun Implementation (to migrate)

In `entities/enemy.js`:
```javascript
export function slowEnemy(enemy, durationMs, mult) {
  enemy.slowTimer = durationMs;
  enemy.slowMult = mult;
}

export function stunEnemy(enemy, durationMs) {
  enemy.stunTimer = durationMs;
  // Cancel charges, sniper telegraphs, mortar aims
}
```

Used in behaviors as:
```javascript
const slowFactor = enemy.slowTimer > 0 ? enemy.slowMult : 1;
if (enemy.stunTimer > 0) { /* skip behavior */ }
```

Migration should:
1. Replace with `applyEffect(enemy, 'slow', { duration, modifiers: { speedMult } })`
2. Replace checks with `hasEffect(enemy, 'stun')` and `getModifiers(enemy).speedMult`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    config/effectTypes.js                     │
│  EFFECT_TYPES definitions, inheritance, MODIFIER_AGGREGATION │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   engine/effectSystem.js                     │
│  Entity effects, apply/remove, modifiers, immunity, ticks    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   engine/effectZones.js                      │
│  Spatial zones, shapes, overlap detection, visuals           │
│  (TO BE BUILT)                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Game Systems                             │
│  player.js, enemy.js, physics.js query getModifiers()        │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Strategy

1. **Unit tests** — Verify effect type resolution, stacking math, modifier aggregation
2. **Integration** — Ice zones apply correctly, slow/stun work via new system
3. **Puppeteer E2E** — Game loads, enemies move, effects visible

---

## TypeScript Migration Plan

The project is being converted to TypeScript as part of this work. The effect system's complexity (hierarchical types, modifier aggregation, zone shapes) benefits significantly from static typing.

### Why TypeScript Now

1. **Natural inflection point** — Building a new engine system anyway
2. **Complex interfaces** — Effect types, instances, zones, modifiers all have clear contracts
3. **Refactoring safety** — Migrating slow/stun/ice touches many files; types catch breakage
4. **IDE benefits** — Autocomplete for effect types, modifiers, zone configs

### Build Setup

Use **esbuild** for fast compilation (sub-100ms builds):

```bash
# Install dependencies
npm install --save-dev typescript esbuild @types/three

# Add to package.json scripts
"scripts": {
  "build": "esbuild src/main.ts --bundle --outfile=dist/game.js --format=esm --sourcemap",
  "watch": "esbuild src/main.ts --bundle --outfile=dist/game.js --format=esm --sourcemap --watch",
  "typecheck": "tsc --noEmit"
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": true,
    "types": ["three"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Core Type Definitions

Create `src/types/index.ts` with foundational types:

```typescript
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// VECTOR & POSITION
// ═══════════════════════════════════════════════════════════════════════════

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Position extends Vector3 {}

// ═══════════════════════════════════════════════════════════════════════════
// MODIFIERS
// ═══════════════════════════════════════════════════════════════════════════

export interface ModifierSet {
  speedMult: number;
  knockbackMult: number;
  canAct: boolean;
  canUseAbilities: boolean;
  damageBonus: number;
  damagePerSec: number;
  healPerSec: number;
}

export type ModifierKey = keyof ModifierSet;

export type AggregationRule = 'multiplicative' | 'additive' | 'lastWins' | 'lowest' | 'highest';

export interface ModifierAggregationConfig {
  default: number | boolean;
  aggregation: AggregationRule;
  min?: number;
  max?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type StackingRule = 'replace' | 'multiplicative' | 'additive' | 'longest' | 'lowest' | 'highest';

export interface StackingConfig {
  maxStacks: number;
  rule: StackingRule;
}

export interface PeriodicConfig {
  interval: number;      // ms between ticks
  damage: number;
  heal: number;
  applyOnEnter: boolean; // First tick immediate?
}

export interface EffectVisualConfig {
  zone: {
    color: number;
    opacity: number;
    fadeTime: number;
  } | null;
  entity: {
    tint: number;
    tintIntensity: number;
    icon: string;
  } | null;
}

export interface EffectTargets {
  player: boolean;
  enemies: boolean;
  tags: string[];
}

export interface EffectTypeDefinition {
  name: string;
  description?: string;
  parent?: string;
  modifiers: Partial<ModifierSet>;
  stacking: StackingConfig;
  duration: number;
  periodic: PeriodicConfig | null;
  targets: EffectTargets;
  visual: EffectVisualConfig;
  persistsOnDeath: boolean;
}

export interface ResolvedEffectType extends EffectTypeDefinition {
  id: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT INSTANCES
// ═══════════════════════════════════════════════════════════════════════════

export interface EffectInstance {
  id: number;
  typeId: string;
  type: ResolvedEffectType;

  // Timing
  duration: number;
  elapsed: number;
  periodicTimer: number;

  // Stacking
  stackCount: number;
  maxStacks: number;
  stackRule: StackingRule;

  // Modifiers (can be overridden per-instance)
  modifiers: Partial<ModifierSet>;

  // Periodic
  periodic: PeriodicConfig | null;

  // Source tracking
  source: Entity | null;
  zone: EffectZone | null;

  // Timestamps
  appliedAt: number;
  lastRefreshedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY EFFECTS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityEffectsComponent {
  active: EffectInstance[];
  immunities: string[];
  modifiersCache: ModifierSet | null;
  modifiersOrder: number[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTITIES
// ═══════════════════════════════════════════════════════════════════════════

export interface Entity {
  pos: Vector3;
  health: number;
  maxHealth?: number;
  isPlayer?: boolean;
  effects?: EntityEffectsComponent;
  mesh?: THREE.Group;
  config?: EnemyConfig;
  gameState?: GameState;
}

export interface Enemy extends Entity {
  config: EnemyConfig;
  mesh: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh?: THREE.Mesh;
  behavior: string;
  slowTimer: number;
  slowMult: number;
  stunTimer: number;
  flashTimer: number;
  knockbackResist: number;
  isCharging?: boolean;
  isLeaping?: boolean;
  wasDeflected?: boolean;
  // ... other enemy-specific fields
}

export interface EnemyConfig {
  name: string;
  color: number;
  health: number;
  speed: number;
  damage: number;
  knockbackResist: number;
  behavior: string;
  size: { radius: number; height: number };
  immunities?: string[];
  // ... other config fields
}

// ═══════════════════════════════════════════════════════════════════════════
// EFFECT ZONES
// ═══════════════════════════════════════════════════════════════════════════

export type ZoneShape =
  | { type: 'sphere'; radius: number }
  | { type: 'cube'; size: number }
  | { type: 'box'; width: number; height: number; depth: number; rotation?: number }
  | { type: 'cylinder'; radius: number; height: number }
  | { type: 'cone'; radius: number; height: number; angle: number; direction: number }
  | { type: 'torus'; majorRadius: number; minorRadius: number }
  | { type: 'halfSphere'; radius: number; upper: boolean };

export interface ZoneEvolution {
  type: 'expand' | 'shrink' | 'pulse';
  rate: number;          // units per second
  min?: number;
  max?: number;
}

export interface EffectZone {
  id: number;
  effectTypeId: string;
  effectOverrides?: Partial<EffectInstance>;

  // Position & shape
  position: Vector3;
  shape: ZoneShape;

  // Attachment (for moving zones)
  attachedTo: Entity | null;
  attachOffset: Vector3;

  // Evolution
  evolution: ZoneEvolution | null;

  // Lifecycle
  duration: number;
  elapsed: number;
  persistsOnDeath: boolean;

  // Source
  source: Entity | null;

  // Visual
  mesh: THREE.Object3D | null;

  // Tracking which entities are inside
  entitiesInside: Set<Entity>;

  // Continuous effect reapplication
  reapplyInterval: number;
  reapplyTimers: Map<Entity, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface GameState {
  phase: 'title' | 'playing' | 'waveComplete' | 'gameOver';
  wave: number;
  playerHealth: number;
  enemies: Enemy[];
  // ... other game state fields
}
```

### File Structure After Migration

```
Iso_Shooter/
├── src/
│   ├── types/
│   │   └── index.ts              # All type definitions
│   ├── config/
│   │   ├── effectTypes.ts        # Effect type definitions
│   │   ├── enemies.ts
│   │   ├── player.ts
│   │   ├── waves.ts
│   │   └── arena.ts
│   ├── engine/
│   │   ├── effectSystem.ts       # Core effect logic
│   │   ├── effectZones.ts        # Spatial zones
│   │   ├── game.ts
│   │   ├── physics.ts
│   │   ├── renderer.ts
│   │   └── aoeTelegraph.ts
│   ├── entities/
│   │   ├── player.ts
│   │   ├── enemy.ts
│   │   ├── projectile.ts
│   │   └── mortarProjectile.ts
│   ├── ui/
│   │   ├── hud.ts
│   │   ├── damageNumbers.ts
│   │   └── spawnEditor.ts
│   └── main.ts                   # Entry point
├── dist/                         # Compiled output
│   └── game.js
├── tests/
│   ├── unit-enemies.mjs
│   └── unit-waves.mjs
├── index.html                    # Update script src to dist/game.js
├── tsconfig.json
├── package.json
└── EFFECT_SYSTEM_HANDOFF.md
```

### Migration Order

Execute in this order to minimize breakage:

1. **Setup** (no code changes yet)
   ```bash
   npm install --save-dev typescript esbuild @types/three
   mkdir -p src/types
   ```

2. **Create type definitions** — `src/types/index.ts`

3. **Migrate config files** (no dependencies)
   - `config/player.js` → `src/config/player.ts`
   - `config/arena.js` → `src/config/arena.ts`
   - `config/enemies.js` → `src/config/enemies.ts`
   - `config/waves.js` → `src/config/waves.ts`
   - `config/effectTypes.js` → `src/config/effectTypes.ts`

4. **Migrate engine core** (bottom-up by dependency)
   - `engine/renderer.js` → `src/engine/renderer.ts`
   - `engine/aoeTelegraph.js` → `src/engine/aoeTelegraph.ts`
   - `engine/effectSystem.js` → `src/engine/effectSystem.ts`
   - `engine/effectZones.ts` — **Build new**
   - `engine/physics.js` → `src/engine/physics.ts`
   - `engine/game.js` → `src/engine/game.ts`

5. **Migrate entities**
   - `entities/projectile.js` → `src/entities/projectile.ts`
   - `entities/mortarProjectile.js` → `src/entities/mortarProjectile.ts`
   - `entities/enemy.js` → `src/entities/enemy.ts`
   - `entities/player.js` → `src/entities/player.ts`

6. **Migrate UI**
   - `ui/damageNumbers.js` → `src/ui/damageNumbers.ts`
   - `ui/hud.js` → `src/ui/hud.ts`
   - `ui/spawnEditor.js` → `src/ui/spawnEditor.ts`

7. **Create entry point** — `src/main.ts`

8. **Update index.html** — Change script src to `dist/game.js`

9. **Test build**
   ```bash
   npm run build
   npm run typecheck
   ```

### Three.js Typing Approach

Three.js is loaded globally via CDN. Handle with:

```typescript
// src/types/three-global.d.ts
import * as THREE from 'three';

declare global {
  interface Window {
    THREE: typeof THREE;
  }
}

// Then in code:
const THREE = window.THREE;
```

Or switch to ES module import (recommended):

```typescript
// In each file that uses Three.js
import * as THREE from 'three';
```

And update index.html to use importmap:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
  }
}
</script>
```

### Incremental Type Safety

If full strict mode is too aggressive initially:

```json
// tsconfig.json — start lenient, tighten over time
{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": false,        // Enable later
    "strictNullChecks": false,     // Enable later
    // ...
  }
}
```

Then progressively enable strict checks as you clean up.

---

## Commands to Continue

```bash
cd /path/to/Iso_Shooter
claude
```

Then:

> "I'm converting this project to TypeScript and building an effect system. Read EFFECT_SYSTEM_HANDOFF.md for full context. Start by setting up the TypeScript build (esbuild), then migrate files in the order specified, and build the effect zones system."

Or for a more focused start:

> "Read EFFECT_SYSTEM_HANDOFF.md. Set up TypeScript with esbuild, create the type definitions, then convert config/effectTypes.js and engine/effectSystem.js to TypeScript."
