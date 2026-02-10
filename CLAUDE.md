# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Isometric wave-based action game (Three.js r128, vanilla ES6 modules, no build tools or bundler). Player fights through 3 waves of enemies in a dark neon dungeon arena. Built for the Supercell Global AI Game Hack.

## Running the Project

```bash
node server.js
# Serves at http://localhost:3000
```

No npm install needed — Three.js and nipplejs are loaded via CDN. The dev server also exposes `POST /save` for persisting config changes from the in-game editor.

## Architecture

### Directory Roles (strict separation)

- **`config/`** — All tunable gameplay parameters (player stats, enemy types, waves, abilities, arena layout). Designer-facing; the engine reads from these and never hardcodes gameplay values.
- **`engine/`** — Core systems: game loop, renderer, input, physics, object pooling, wave runner. Do not put gameplay tuning values here.
- **`entities/`** — Game objects: player, enemies, projectiles, mortar projectiles.
- **`ui/`** — HUD updates, screen overlays, damage numbers, live tuning panel, spawn editor.
- **`ai/`** — Reserved for Mistral AI integration (currently empty).

### Game Loop (`engine/game.js`)

Single `update()` function orchestrates per-frame: input → player → projectiles → wave runner → enemies → collisions → pit falls → AoE effects → mortars → camera → HUD → render. Delta time capped at 50ms.

### Key Patterns

- **Object pooling** (`engine/pools.js`): Projectiles pre-allocated (80 player, 40 enemy). Meshes reused, never created/destroyed at runtime.
- **Distance-based physics**: All collision is `distance(a, b) < a.radius + b.radius`. No physics engine, no pathfinding.
- **Behavior functions** (not state machines): Enemy AI is simple functions (`rush`, `kite`, `tank`, `mortar`) selected by config value.
- **Wave state machine** (`engine/waveRunner.js`): `idle → announce → running → cleared → next wave or victory`. Groups spawn with telegraph warnings.
- **Isometric input mapping**: Screen input rotated to world space. Camera at `(20, 20, 20)`, orthographic. Constants: `ISO_RIGHT_X = 1/√2`, `ISO_UP_X = -1/√2`.
- **HUD is HTML overlay** (`index.html` + `style.css`), not Three.js.

### Enemy Types (4)

Goblin (rush), Skeleton Archer (kite + sniper shot), Mortar Imp (lobbed AoE projectile), Crystal Golem (tank + shield + charge + death explosion). Each has status effects: stun, slow, shield.

### Abilities (2)

Dash (Space) — invincible dash with easing, afterimages, i-frames. Force Push (hold E) — charge-up rectangle telegraph with scaling knockback.

### Developer Tools

- **Tuning panel** (`ui/tuning.js`): Right-side UI for real-time parameter adjustment.
- **Spawn editor** (`ui/spawnEditor.js`): Toggle with backtick key. Visual wave/enemy placement editor.
- **URL param overrides** (`engine/urlParams.js`): Pass `?paramName=value` to override config at load.

## Multi-Input Support

Keyboard (WASD), mouse aim, gamepad (analog sticks with deadzone), touch joysticks (nipplejs). Input abstracted through `engine/input.js` state object.

## Important Conventions

- All gameplay values must live in `config/` files — engine code reads config, never hardcodes.
- No build step — ES6 modules loaded natively by the browser.
- No pathfinding by design — enemies move directly toward targets.
- Rendering uses `MeshStandardMaterial` with emissive colors for the dark neon aesthetic.
- Damage numbers rendered via 2D canvas overlay after the 3D scene.
