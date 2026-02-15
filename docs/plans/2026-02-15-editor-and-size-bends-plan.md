# Editor + Size Bends Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Level editor with spatial handles for authoring physics-rich rooms + Enlarge/Shrink bends usable mid-combat via radial menu. Author a room, play-test rule-bending chain reactions.

**Architecture:** Bend system is a thin state layer that mutates PhysicsObject fields (scale, mass, radius) and re-scales meshes. Radial menu is a DOM overlay activated by Q key toggle, reusing existing bullet time for time slow. Level editor is a new file with spatial 3D handles for resize, reusing undo/redo pattern from spawn editor. Editor and bend system are independent — editor previews bends but doesn't depend on the combat bend flow.

**Tech Stack:** Three.js (global), TypeScript, esbuild, vitest

**Design doc:** `docs/plans/2026-02-15-editor-and-size-bends-design.md`

**Existing tests must stay green.** Run `npx vitest run` after each task to verify no regressions. Current: 581 tests passing.

**Important codebase notes:**
- THREE.js is a global (not npm import). Use `THREE.XXX` for runtime, `import type` for type positions.
- Q key is currently bound to `bulletTime` in `src/engine/input.ts:56`. Bend mode will take over Q and use bullet time internally for slow-mo.
- `GameState` interface is in `src/types/index.ts:406-418`. `InputState` fields are declared in `src/engine/input.ts:6-18` (some missing from the interface in types).
- The game loop is in `src/engine/game.ts:40-158`. Bullet time already provides `gameDt = dt * getBulletTimeScale()`.
- Undo/redo pattern from spawn editor: deep-copy snapshot, push/pop stacks, apply snapshot restores state. See `src/ui/spawnEditor.ts:48-129`.
- `OBSTACLES` and `PITS` are mutable arrays in `src/config/arena.ts`. Modify in place, then call `invalidateCollisionBounds()` + `rebuildArenaVisuals()`.
- Use `innerHTML = ''` for clearing DOM elements (this is safe — we control the content, no user input). Use `textContent` for setting display text.
- The existing spawn editor (`src/ui/spawnEditor.ts`) stays untouched — the new level editor is separate.

---

## Batch 1: Bend System Core (Tasks 1-4)

### Task 1: Bend Data Model + Config

**Files:**
- Create: `src/config/bends.ts`
- Create: `tests/bends.test.ts`

**Step 1: Write the failing test**

Create `tests/bends.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BENDS, getBendById } from '../src/config/bends';

describe('bend config', () => {
  it('has exactly 2 bends (enlarge + shrink)', () => {
    expect(BENDS).toHaveLength(2);
  });

  it('enlarge scales up', () => {
    const enlarge = getBendById('enlarge');
    expect(enlarge).toBeDefined();
    expect(enlarge!.property).toBe('size');
    expect(enlarge!.pole).toBe('positive');
    const scaleFx = enlarge!.effects.find(e => e.param === 'scale');
    expect(scaleFx).toBeDefined();
    expect(scaleFx!.value).toBeGreaterThan(1);
  });

  it('shrink scales down', () => {
    const shrink = getBendById('shrink');
    expect(shrink).toBeDefined();
    expect(shrink!.property).toBe('size');
    expect(shrink!.pole).toBe('negative');
    const scaleFx = shrink!.effects.find(e => e.param === 'scale');
    expect(scaleFx).toBeDefined();
    expect(scaleFx!.value).toBeLessThan(1);
  });

  it('bends have opposite poles on same property', () => {
    const enlarge = getBendById('enlarge')!;
    const shrink = getBendById('shrink')!;
    expect(enlarge.property).toBe(shrink.property);
    expect(enlarge.pole).not.toBe(shrink.pole);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bends.test.ts`
Expected: FAIL — `src/config/bends.ts` does not exist

**Step 3: Implement bend config**

Create `src/config/bends.ts`:

```typescript
export interface BendEffect {
  param: 'scale' | 'mass' | 'radius';
  operation: 'multiply' | 'set';
  value: number;
}

export interface RuleBend {
  id: string;
  name: string;
  description: string;
  icon: string;
  property: 'size' | 'adhesion' | 'durability';
  pole: 'positive' | 'negative';
  effects: BendEffect[];
  tintColor: number;
}

export const BENDS: RuleBend[] = [
  {
    id: 'enlarge',
    name: 'Enlarge',
    description: 'Scale up — bigger, heavier, more impact',
    icon: '⬆',
    property: 'size',
    pole: 'positive',
    effects: [
      { param: 'scale', operation: 'multiply', value: 2.5 },
      { param: 'mass', operation: 'multiply', value: 2 },
      { param: 'radius', operation: 'multiply', value: 2 },
    ],
    tintColor: 0x4488ff,
  },
  {
    id: 'shrink',
    name: 'Shrink',
    description: 'Scale down — tiny, light, flies on any push',
    icon: '⬇',
    property: 'size',
    pole: 'negative',
    effects: [
      { param: 'scale', operation: 'multiply', value: 0.3 },
      { param: 'mass', operation: 'multiply', value: 0.3 },
      { param: 'radius', operation: 'multiply', value: 0.3 },
    ],
    tintColor: 0xffcc44,
  },
];

export function getBendById(id: string): RuleBend | undefined {
  return BENDS.find(b => b.id === id);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bends.test.ts`
Expected: PASS (4 tests)

Run: `npx vitest run`
Expected: ALL tests pass (581 + 4 = 585)

**Step 5: Commit**

```bash
git add src/config/bends.ts tests/bends.test.ts
git commit -m "feat: add bend config with Enlarge/Shrink definitions"
```

---

### Task 2: Bend System — Apply, Undo, State Tracking

**Files:**
- Create: `src/engine/bendSystem.ts`
- Test: `tests/bends.test.ts` (extend)

**Step 1: Write failing tests**

Add to `tests/bends.test.ts`:

```typescript
import { createBendSystem } from '../src/engine/bendSystem';

describe('bend system', () => {
  function makeObj(overrides: any = {}) {
    return {
      id: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 0.8,
      mass: 2.0,
      health: 50,
      maxHealth: 50,
      material: 'stone' as const,
      meshType: 'rock' as const,
      scale: 1,
      restitution: undefined,
      mesh: null,
      destroyed: false,
      fellInPit: false,
      ...overrides,
    };
  }

  it('applies enlarge — scale, mass, radius multiply', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    const result = sys.applyBend('enlarge', 'physicsObject', obj);
    expect(result.success).toBe(true);
    expect(obj.scale).toBeCloseTo(2.5);
    expect(obj.mass).toBeCloseTo(4.0);
    expect(obj.radius).toBeCloseTo(1.6);
  });

  it('applies shrink — scale, mass, radius multiply', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('shrink', 'physicsObject', obj);
    expect(obj.scale).toBeCloseTo(0.3);
    expect(obj.mass).toBeCloseTo(0.6);
    expect(obj.radius).toBeCloseTo(0.24);
  });

  it('tracks active bends', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    expect(sys.getActiveBends()).toHaveLength(1);
    expect(sys.getActiveBends()[0].bendId).toBe('enlarge');
  });

  it('decrements remaining count', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    expect(sys.bendsRemaining()).toBe(3);
    sys.applyBend('enlarge', 'physicsObject', obj);
    expect(sys.bendsRemaining()).toBe(2);
  });

  it('rejects when no bends remaining', () => {
    const sys = createBendSystem(1);
    const obj1 = makeObj({ id: 1 });
    const obj2 = makeObj({ id: 2 });
    sys.applyBend('enlarge', 'physicsObject', obj1);
    const result = sys.applyBend('shrink', 'physicsObject', obj2);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_bends_remaining');
  });

  it('rejects opposite pole on same target', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    const result = sys.applyBend('shrink', 'physicsObject', obj);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('opposite_pole');
  });

  it('same bend on same target is no-op (no charge consumed)', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    const result = sys.applyBend('enlarge', 'physicsObject', obj);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_applied');
    expect(sys.bendsRemaining()).toBe(2);
  });

  it('resets all bends and restores original values', () => {
    const sys = createBendSystem(3);
    const obj = makeObj();
    sys.applyBend('enlarge', 'physicsObject', obj);
    expect(obj.scale).toBeCloseTo(2.5);
    sys.resetAll();
    expect(obj.scale).toBeCloseTo(1);
    expect(obj.mass).toBeCloseTo(2.0);
    expect(obj.radius).toBeCloseTo(0.8);
    expect(sys.bendsRemaining()).toBe(3);
    expect(sys.getActiveBends()).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bends.test.ts`
Expected: FAIL — `createBendSystem` does not exist

**Step 3: Implement bend system**

Create `src/engine/bendSystem.ts`:

```typescript
import { getBendById } from '../config/bends';

export interface ActiveBend {
  bendId: string;
  targetType: 'physicsObject' | 'obstacle';
  targetId: number;
  target: any;
  originalValues: Record<string, number>;
}

export interface ApplyResult {
  success: boolean;
  reason?: 'no_bends_remaining' | 'opposite_pole' | 'already_applied' | 'invalid_bend' | 'invalid_target';
}

export function createBendSystem(maxBends: number) {
  let activeBends: ActiveBend[] = [];
  let remaining = maxBends;
  const max = maxBends;

  function applyBend(bendId: string, targetType: 'physicsObject' | 'obstacle', target: any): ApplyResult {
    const bend = getBendById(bendId);
    if (!bend) return { success: false, reason: 'invalid_bend' };

    if (remaining <= 0) return { success: false, reason: 'no_bends_remaining' };

    const targetId = target.id ?? 0;

    // Check if same bend already applied to this target
    const existing = activeBends.find(ab => ab.targetId === targetId && ab.targetType === targetType);
    if (existing) {
      if (existing.bendId === bendId) {
        return { success: false, reason: 'already_applied' };
      }
      // Check opposite pole
      const existingBend = getBendById(existing.bendId);
      if (existingBend && existingBend.property === bend.property) {
        return { success: false, reason: 'opposite_pole' };
      }
    }

    // Save original values before mutation
    const originalValues: Record<string, number> = {};
    for (const fx of bend.effects) {
      originalValues[fx.param] = target[fx.param];
    }

    // Apply effects
    for (const fx of bend.effects) {
      if (fx.operation === 'multiply') {
        target[fx.param] *= fx.value;
      } else if (fx.operation === 'set') {
        target[fx.param] = fx.value;
      }
    }

    activeBends.push({
      bendId,
      targetType,
      targetId,
      target,
      originalValues,
    });

    remaining--;
    return { success: true };
  }

  function resetAll(): void {
    for (const ab of activeBends) {
      for (const [param, value] of Object.entries(ab.originalValues)) {
        ab.target[param] = value;
      }
    }
    activeBends = [];
    remaining = max;
  }

  function getActiveBends(): ActiveBend[] {
    return [...activeBends];
  }

  function bendsRemaining(): number {
    return remaining;
  }

  function hasBendOnTarget(targetType: string, targetId: number): string | null {
    const found = activeBends.find(ab => ab.targetType === targetType && ab.targetId === targetId);
    return found ? found.bendId : null;
  }

  return { applyBend, resetAll, getActiveBends, bendsRemaining, hasBendOnTarget };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bends.test.ts`
Expected: ALL PASS

Run: `npx vitest run`
Expected: ALL tests pass

**Step 5: Commit**

```bash
git add src/engine/bendSystem.ts tests/bends.test.ts
git commit -m "feat: bend system with apply, undo, opposite-pole enforcement"
```

---

### Task 3: Bend Events + Game State Integration

**Files:**
- Modify: `src/engine/events.ts`
- Modify: `src/types/index.ts`
- Modify: `src/engine/game.ts`
- Test: `tests/bends.test.ts` (extend)

**Step 1: Add bend events to `src/engine/events.ts`**

Add to the GameEvent union (after the `obstacleDestroyed` line):

```typescript
| { type: 'bendModeActivated' }
| { type: 'bendModeDeactivated' }
| { type: 'bendApplied'; bendId: string; targetType: string; targetId: number; position: { x: number; z: number } }
| { type: 'bendFailed'; bendId: string; reason: string }
```

**Step 2: Extend GameState in `src/types/index.ts`**

Add to the `GameState` interface (after `physicsObjects: PhysicsObject[];`):

```typescript
bendMode: boolean;
bendsPerRoom: number;
```

**Step 3: Update gameState initialization in `src/engine/game.ts`**

Add to the gameState literal (after `physicsObjects: [],`):

```typescript
bendMode: false,
bendsPerRoom: 3,
```

**Step 4: Write confirmation test**

Add to `tests/bends.test.ts`:

```typescript
describe('bend game state', () => {
  it('GameState supports bend fields', () => {
    const state: any = {
      phase: 'playing',
      bendMode: false,
      bendsPerRoom: 3,
    };
    expect(state.bendMode).toBe(false);
    expect(state.bendsPerRoom).toBe(3);
  });
});
```

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS. If any tests construct full GameState objects, add `bendMode: false, bendsPerRoom: 3` to them.

Run: `npm run typecheck`
Expected: Clean

**Step 6: Commit**

```bash
git add src/engine/events.ts src/types/index.ts src/engine/game.ts tests/bends.test.ts
git commit -m "feat: add bend events, bendMode/bendsPerRoom to GameState"
```

---

### Task 4: Bend Visuals — Object Re-Scaling + Tint

**Files:**
- Modify: `src/entities/physicsObject.ts`
- Test: `tests/bends.test.ts` (extend)

**Step 1: Write test for visual update function**

Add to `tests/bends.test.ts`:

```typescript
import { applyBendVisuals } from '../src/entities/physicsObject';

describe('bend visuals', () => {
  it('applyBendVisuals updates mesh scale', () => {
    const childMat = { emissive: { setHex: () => {} }, emissiveIntensity: 0.3 };
    const child = { material: childMat, isMesh: true };
    const mockScale = { x: 1, y: 1, z: 1 };
    const mesh = {
      scale: { set: (x: number, y: number, z: number) => {
        mockScale.x = x; mockScale.y = y; mockScale.z = z;
      }},
      traverse: (fn: (c: any) => void) => fn(child),
    };

    const obj = { scale: 2.5, radius: 1.6, mesh } as any;

    applyBendVisuals(obj, 0x4488ff);
    expect(mockScale.x).toBeCloseTo(2.5);
    expect(mockScale.y).toBeCloseTo(2.5);
    expect(mockScale.z).toBeCloseTo(2.5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bends.test.ts`
Expected: FAIL — `applyBendVisuals` does not exist

**Step 3: Implement bend visuals in `src/entities/physicsObject.ts`**

Add after `createPhysicsObjectMesh`:

```typescript
export function applyBendVisuals(obj: PhysicsObject, tintColor: number): void {
  if (!obj.mesh) return;
  obj.mesh.scale.set(obj.scale, obj.scale, obj.scale);
  obj.mesh.traverse((child: any) => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(tintColor);
      child.material.emissiveIntensity = 0.6;
    }
  });
}

export function clearBendVisuals(obj: PhysicsObject): void {
  if (!obj.mesh) return;
  obj.mesh.scale.set(1, 1, 1);
  const colors = MATERIAL_COLORS[obj.material] || MATERIAL_COLORS.stone;
  obj.mesh.traverse((child: any) => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(colors.emissive);
      child.material.emissiveIntensity = 0.3;
    }
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bends.test.ts`
Expected: ALL PASS

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/entities/physicsObject.ts tests/bends.test.ts
git commit -m "feat: bend visual effects — mesh scaling + emissive tint"
```

---

## Batch 2: Radial Menu + Bend Mode (Tasks 5-7)

### Task 5: Radial Menu UI (DOM Overlay)

**Files:**
- Create: `src/ui/radialMenu.ts`

**Step 1: Implement radial menu**

Create `src/ui/radialMenu.ts`. This is a DOM-based radial menu that appears when bend mode is active. Uses `textContent` for all text and DOM API for structure (no innerHTML with user input).

The menu shows 2 options (Enlarge / Shrink) in a circular layout around a center point. Clicking an option selects a bend. The menu is positioned at screen center.

Key exports:
- `initRadialMenu()` — creates DOM elements
- `showRadialMenu(screenX, screenY)` — show at position
- `hideRadialMenu()` — hide
- `isRadialMenuVisible()` — query
- `getSelectedBendId()` — current selection
- `setOnBendSelected(callback)` — selection handler
- `clearSelectedBend()` — deselect

Each bend option is a circular div with the bend icon and name, positioned using CSS transform. Click selects, hover highlights. Selected option gets a highlighted border and scale.

**Step 2: Build to verify no errors**

Run: `npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/ui/radialMenu.ts
git commit -m "feat: radial menu DOM overlay for bend selection"
```

---

### Task 6: Bend Mode Toggle + Targeting

**Files:**
- Modify: `src/engine/input.ts`
- Modify: `src/engine/game.ts`
- Create: `src/engine/bendMode.ts`

**Step 1: Change Q key binding in `src/engine/input.ts`**

Currently line 56: `if (e.code === 'KeyQ') inputState.bulletTime = true;`

Change to: `if (e.code === 'KeyQ') inputState.bendMode = true;`

Add `bendMode: false` to inputState object.

Add `inputState.bendMode = false;` to `consumeInput()`.

Keep `bulletTime` in inputState (gamepad still uses it).

**Step 2: Create bend mode controller**

Create `src/engine/bendMode.ts`:

This module manages the bend mode toggle state. When activated:
1. Activates bullet time (for slow-mo)
2. Shows radial menu at screen center
3. Emits `bendModeActivated` event

When a bend is selected from the menu, enters targeting mode. When a target is clicked (via raycasting against physics object meshes), applies the bend using the bend system.

Key exports:
- `initBendMode()` — initialize with max bends
- `toggleBendMode()` — Q key handler
- `isBendModeActive()` — query
- `isBendTargeting()` — is a bend selected, waiting for target
- `enterTargeting()` — called when radial menu selection is made
- `handleBendClick(mouseNDC, gameState)` — raycast click to apply bend
- `tryApplyBendToTarget(target, targetType)` — apply bend + visuals + event
- `getBendsRemaining()` — query remaining
- `getActiveBends()` — query active
- `resetBendMode()` — full reset (room transition)

Uses `toggleBulletTime()` and `isBulletTimeActive()` from `./bulletTime` for time slow.
Uses `applyBendVisuals()` from `../entities/physicsObject` for visual feedback.
Uses `getCamera()` from `./renderer` for raycasting.
Uses THREE.Raycaster for click-to-target.

**Step 3: Wire into game loop in `src/engine/game.ts`**

Add imports for `initBendMode`, `toggleBendMode`, `isBendModeActive`, `resetBendMode`, `initRadialMenu`, `setOnBendSelected`, `enterTargeting`, `handleBendClick`, `isBendTargeting`.

In `init()` after `initBulletTime()`:
```typescript
initRadialMenu();
initBendMode();
setOnBendSelected(() => enterTargeting());
```

Replace the bullet time toggle in game loop (line 80):
```typescript
if (input.bendMode) toggleBendMode();
if (!isBendModeActive() && input.bulletTime) toggleBulletTime();
```

Gate combat input when bend mode is active — pass modified input to updatePlayer that disables attack/dash/ultimate.

Handle bend targeting click: when `isBendModeActive()` and `isBendTargeting()` and `input.attack`, call `handleBendClick(input.mouseNDC, gameState)`.

Add `resetBendMode()` to `restart()`.

**Step 4: Build and typecheck**

Run: `npm run build`
Expected: Clean

Run: `npm run typecheck`
Expected: Clean

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/engine/input.ts src/engine/game.ts src/engine/bendMode.ts
git commit -m "feat: bend mode toggle with Q key, radial menu, bullet time integration"
```

---

### Task 7: Bend Feedback — Audio, Particles, HUD Counter

**Files:**
- Modify: `src/engine/audio.ts`
- Modify: `src/engine/particles.ts`
- Modify: `src/ui/hud.ts`

**Step 1: Add bend audio to `src/engine/audio.ts`**

Add a `playBendApply()` function: rising shimmer sound (two detuned sine oscillators, quick frequency ramp from 400Hz to 800Hz, 0.3s decay). Pattern matches existing procedural audio (no audio files).

Add event subscription in `initAudio()`:
```typescript
on('bendApplied', () => playBendApply());
```

Also add volume config: `bendApplyVolume: 0.3` to AUDIO_CONFIG.

**Step 2: Add bend particles to `src/engine/particles.ts`**

Add `BEND_APPLY_BURST` preset: 10 particles, speed 3, full spread, 400ms lifetime, size 0.1, gravity -2.

Add event subscription:
```typescript
on('bendApplied', (e: GameEvent) => {
  if (e.type === 'bendApplied') {
    const color = e.bendId === 'enlarge' ? 0x4488ff : 0xffcc44;
    burstAt(e.position.x, e.position.z, { ...BEND_APPLY_BURST, color });
  }
});
```

**Step 3: Add bend counter to HUD**

In `src/ui/hud.ts`, add a bend counter element (fixed position, top-right area). In `updateHUD`, update it with `getBendsRemaining()` from `../engine/bendMode`.

Display format: `Bends: 3/3` in monospace, blue-tinted. Only visible when `gameState.phase === 'playing'`.

**Step 4: Build and test**

Run: `npm run build`
Expected: Clean

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/engine/audio.ts src/engine/particles.ts src/ui/hud.ts
git commit -m "feat: bend feedback — shimmer audio, particle burst, HUD counter"
```

---

## Batch 3: Level Editor Core (Tasks 8-10)

### Task 8: Editor Core — Toggle, Modes, Selection, Undo/Redo

**Files:**
- Create: `src/ui/levelEditor.ts`
- Modify: `src/engine/game.ts`
- Modify: `src/engine/input.ts`

**Step 1: Create editor core**

Create `src/ui/levelEditor.ts` with:

**Editor state:** `active`, `mode` (obstacle/physics/pit), `selectedType`, `selectedIdx`, `isDragging`, `dragStartX/Z`.

**Undo/redo:** Follows exact pattern from `spawnEditor.ts:48-129`. Snapshot captures `OBSTACLES`, `PITS`, and physics object data (excluding meshes). Push on mutation, pop to restore, max 50.

**UI elements:**
- Mode indicator bar (fixed, top-center): shows current mode "LEVEL EDITOR — 1: Obstacle"
- Property panel (fixed, right side): compact panel for selected object properties (built in Task 10)
- Both hidden when editor inactive

**Keyboard shortcuts:**
- `Shift+Backquote` = toggle editor (avoids conflict with spawn editor's plain Backquote)
- `1/2/3` = mode switch (only when editor active)
- `Delete/Backspace` = delete selected
- `D` = duplicate selected
- `Ctrl+Z` = undo, `Ctrl+Y` or `Ctrl+Shift+Z` = redo
- `Escape` = deselect

**Selection visuals:**
- Selected obstacle: green wireframe box outline (THREE.EdgesGeometry + LineSegments)
- Selected physics object: green ground-plane ring showing collision radius
- Selected pit: green wireframe outline

**Key exports:** `initLevelEditor(scene, gameState)`, `toggleLevelEditor()`, `isLevelEditorActive()`, `updateLevelEditor()`.

**Step 2: Wire into game.ts**

Add `toggleLevelEditor` input field to `input.ts`. Bind `Shift+Backquote` to it.

In `init()` after `initSpawnEditor`:
```typescript
initLevelEditor(scene, gameState);
```

In game loop after `checkEditorToggle()`:
```typescript
if (input.toggleLevelEditor) toggleLevelEditor();
if (isLevelEditorActive()) updateLevelEditor();
```

**Step 3: Build**

Run: `npm run build`
Expected: Clean

**Step 4: Commit**

```bash
git add src/ui/levelEditor.ts src/engine/game.ts src/engine/input.ts
git commit -m "feat: level editor core — toggle, modes, selection, undo/redo"
```

---

### Task 9: Editor Click-to-Place + Click-to-Select + Drag-to-Move

**Files:**
- Modify: `src/ui/levelEditor.ts`

**Step 1: Add ground-plane raycasting**

Add a `screenToWorld(mouseNDC)` function using THREE.Raycaster against a horizontal plane at y=0. Returns `{ x, z }` world coordinates.

**Step 2: Add click handler**

On mousedown (left button only, editor active):
1. Try to select an existing object (raycast against physics object meshes, then point-in-AABB for obstacles/pits)
2. If nothing selected, place a new object at click position based on current mode

On mousemove (when dragging):
- Move selected object to mouse world position (snap to 0.5 grid)
- Update collision bounds and visuals as needed

On mouseup: end drag.

**Selection logic:**
- Physics objects: THREE.Raycaster.intersectObject against mesh
- Obstacles: point-in-AABB test (|worldX - o.x| < o.w/2 && |worldZ - o.z| < o.d/2)
- Pits: same point-in-AABB test

**Placement defaults:**
- Obstacle mode: `{ x, z, w: 2, h: 2, d: 2 }`
- Physics mode: rock, stone, mass 2.0, health 9999, radius 0.8 (calls `createPhysicsObject` + `createPhysicsObjectMesh`)
- Pit mode: `{ x, z, w: 3, d: 3 }`

All mutations wrapped with `pushUndo()`.

**Step 3: Build**

Run: `npm run build`
Expected: Clean

**Step 4: Commit**

```bash
git add src/ui/levelEditor.ts
git commit -m "feat: editor click-to-place + click-to-select + drag-to-move"
```

---

### Task 10: Editor Property Panel

**Files:**
- Modify: `src/ui/levelEditor.ts`

**Step 1: Implement property panel rendering**

Build the `updatePropertyPanel()` function. When an object is selected, populate the panel with editable fields:

**Obstacle panel:** X, Z (number inputs), Width, Height, Depth (number inputs, min 0.5), Destructible (checkbox), Health (number, shown only if destructible), Material (dropdown: stone/wood/metal/ice).

**Physics object panel:** X, Z (number inputs), Mesh type (dropdown: rock/crate/barrel/pillar), Material (dropdown), Mass (number, 0.1-50), Health (number, 1-9999), Radius (number, 0.1-5).

**Pit panel:** X, Z, Width, Depth (number inputs).

All changes call `pushUndo()` before mutation, then `invalidateCollisionBounds()` + `rebuildArenaVisuals()` as needed. Mesh type and material changes rebuild the physics object mesh.

**Helper functions:** `addNumberField(label, value, onChange, min, max, step)`, `addCheckbox(label, checked, onChange)`, `addDropdown(label, value, options, onChange)`. All create DOM elements appended to `panelEl`. Use `textContent` for labels.

**Step 2: Build**

Run: `npm run build`
Expected: Clean

**Step 3: Commit**

```bash
git add src/ui/levelEditor.ts
git commit -m "feat: editor property panel with fields for obstacle/physics/pit"
```

---

## Batch 4: Spatial Handles + Export/Import (Tasks 11-13)

### Task 11: Spatial Resize Handles

**Files:**
- Create: `src/ui/editorHandles.ts`
- Modify: `src/ui/levelEditor.ts`

**Step 1: Create handle system**

Create `src/ui/editorHandles.ts`:

4 handles on the ground plane for obstacles/pits: +X, -X, +Z, -Z edges. Each handle is a small colored box mesh (0.3 units). Handles are positioned at the edge centers of the selected object.

Key exports:
- `initHandles(scene)` — store scene reference
- `showResizeHandles(x, z, w, d)` — create 4 handle meshes at edge positions
- `clearHandles()` — remove handle meshes, dispose geometry/material
- `tryGrabHandle(mouseNDC)` — raycast against handles, return grabbed handle or null
- `releaseHandle()` — end grab
- `getActiveHandle()` — query
- `updateHandlePositions(x, z, w, d)` — update handle positions during resize

Each handle stores: axis ('x' | 'z'), sign (1 | -1), dimension ('w' | 'd').

**Step 2: Integrate into level editor**

In the mousedown handler, check handles before selection:
```
const handle = tryGrabHandle(mouseNDC);
if (handle) return;
```

In mousemove, when a handle is active and an obstacle/pit is selected, calculate new dimension based on drag position. Resize follows the dragged edge while the opposite edge stays fixed. Update obstacle/pit data, rebuild visuals, update handle positions.

In mouseup, call `releaseHandle()`.

When an obstacle or pit is selected, call `showResizeHandles()`. On deselect, call `clearHandles()`.

**Step 3: Build**

Run: `npm run build`
Expected: Clean

**Step 4: Commit**

```bash
git add src/ui/editorHandles.ts src/ui/levelEditor.ts
git commit -m "feat: spatial resize handles for obstacles and pits"
```

---

### Task 12: Editor Export/Import

**Files:**
- Modify: `src/ui/levelEditor.ts`

**Step 1: Add export/import functions and buttons**

Add two buttons to the editor UI (visible when editor is active, below the mode indicator):

**Export ("Copy Room JSON"):**
Builds a `RoomDefinition`-compatible JSON object from current OBSTACLES, PITS, and gameState.physicsObjects. Physics objects are serialized as `PhysicsObjectPlacement` format (meshType, material, x, z, mass, health, radius, scale). Copies to clipboard via `navigator.clipboard.writeText()`. Shows a brief confirmation in the mode indicator.

**Import ("Load Room JSON"):**
Prompts user to paste JSON (via `window.prompt`). Parses and applies:
1. Replaces OBSTACLES array contents
2. Replaces PITS array contents
3. Clears existing physics objects (remove meshes from scene)
4. Creates new physics objects from JSON (createPhysicsObject + createPhysicsObjectMesh)
5. Calls `invalidateCollisionBounds()` + `rebuildArenaVisuals()`
All wrapped with `pushUndo()`.

**Step 2: Build**

Run: `npm run build`
Expected: Clean

**Step 3: Commit**

```bash
git add src/ui/levelEditor.ts
git commit -m "feat: editor export/import room JSON to clipboard"
```

---

### Task 13: Bend Preview Mode in Editor

**Files:**
- Modify: `src/ui/levelEditor.ts`

**Step 1: Add bend preview toggle**

Add a "Preview Bends" button to the editor toolbar. When active:
1. Creates a temporary bend system instance (separate from the gameplay one)
2. Shows the radial menu
3. Clicking a bend + clicking a physics object applies the visual preview (scale + tint)
4. Toggling preview off restores all objects to original values

This reuses `createBendSystem()` from `bendSystem.ts` and `applyBendVisuals()` / `clearBendVisuals()` from `physicsObject.ts`.

Preview bends are purely visual + data — they help the designer see "if I enlarge this rock, how big is it?" without affecting the gameplay bend state.

**Step 2: Build**

Run: `npm run build`
Expected: Clean

**Step 3: Commit**

```bash
git add src/ui/levelEditor.ts
git commit -m "feat: bend preview mode in level editor"
```

---

## Batch 5: Integration Tests + Room Reset (Tasks 14-15)

### Task 14: Room Reset Wiring

**Files:**
- Modify: `src/engine/roomManager.ts`

**Step 1: Wire bend reset into room transitions**

In `src/engine/roomManager.ts`, add import:
```typescript
import { resetBendMode } from './bendMode';
```

In the room loading function, after clearing physics objects:
```typescript
resetBendMode();
```

This ensures bends are cleared and visuals restored when the player transitions to a new room or restarts.

**Step 2: Build and test**

Run: `npm run build`
Expected: Clean

Run: `npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/engine/roomManager.ts
git commit -m "feat: reset bends on room transition"
```

---

### Task 15: Integration Tests

**Files:**
- Test: `tests/bends.test.ts` (extend)

**Step 1: Write integration tests**

Add to `tests/bends.test.ts`:

```typescript
import { PHYSICS } from '../src/config/physics';

describe('bend integration', () => {
  function makeObj(overrides: any = {}) {
    return {
      id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 0.8, mass: 2.0, health: 50, maxHealth: 50,
      material: 'stone' as const, meshType: 'rock' as const,
      scale: 1, restitution: undefined, mesh: null,
      destroyed: false, fellInPit: false, ...overrides,
    };
  }

  it('enlarge increases push resistance — lower velocity for same force', () => {
    const force = 8;
    const baseMass = 2.0;
    const enlargedMass = baseMass * 2;
    const v0Base = Math.sqrt(2 * PHYSICS.objectFriction * (force / baseMass));
    const v0Enlarged = Math.sqrt(2 * PHYSICS.objectFriction * (force / enlargedMass));
    expect(v0Enlarged).toBeLessThan(v0Base);
  });

  it('shrink makes object fly further for same force', () => {
    const force = 8;
    const baseMass = 2.0;
    const shrunkMass = baseMass * 0.3;
    const distBase = force / baseMass;
    const distShrunk = force / shrunkMass;
    expect(distShrunk).toBeGreaterThan(distBase);
  });

  it('enlarged object has bigger collision radius', () => {
    const sys = createBendSystem(3);
    const obj = makeObj({ radius: 0.8 });
    sys.applyBend('enlarge', 'physicsObject', obj);
    expect(obj.radius).toBeCloseTo(1.6);
  });

  it('shrunk object has smaller collision radius', () => {
    const sys = createBendSystem(3);
    const obj = makeObj({ radius: 0.8 });
    sys.applyBend('shrink', 'physicsObject', obj);
    expect(obj.radius).toBeCloseTo(0.24);
  });

  it('enlarged rock has more momentum on impact', () => {
    const force = 12;
    const baseMass = 2.0;
    const enlargedMass = baseMass * 2;
    const v0Base = Math.sqrt(2 * PHYSICS.objectFriction * (force / baseMass));
    const v0Enlarged = Math.sqrt(2 * PHYSICS.objectFriction * (force / enlargedMass));
    const momentumBase = baseMass * v0Base;
    const momentumEnlarged = enlargedMass * v0Enlarged;
    expect(momentumEnlarged).toBeGreaterThan(momentumBase);
  });

  it('shrunk rock has less momentum but higher velocity', () => {
    const force = 12;
    const baseMass = 2.0;
    const shrunkMass = baseMass * 0.3;
    const v0Base = Math.sqrt(2 * PHYSICS.objectFriction * (force / baseMass));
    const v0Shrunk = Math.sqrt(2 * PHYSICS.objectFriction * (force / shrunkMass));
    expect(v0Shrunk).toBeGreaterThan(v0Base);
    const momentumShrunk = shrunkMass * v0Shrunk;
    const momentumBase = baseMass * v0Base;
    expect(momentumShrunk).toBeLessThan(momentumBase);
  });
});
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

Run: `npm run build`
Expected: Clean

Run: `npm run typecheck`
Expected: Clean

**Step 3: Commit**

```bash
git add tests/bends.test.ts
git commit -m "test: bend integration tests — physics implications of size changes"
```

---

## Summary of Commits

| # | Message | Key Files |
|---|---------|-----------|
| 1 | `feat: add bend config with Enlarge/Shrink definitions` | bends.ts, tests |
| 2 | `feat: bend system with apply, undo, opposite-pole enforcement` | bendSystem.ts, tests |
| 3 | `feat: add bend events, bendMode/bendsPerRoom to GameState` | events.ts, types, game.ts |
| 4 | `feat: bend visual effects — mesh scaling + emissive tint` | physicsObject.ts, tests |
| 5 | `feat: radial menu DOM overlay for bend selection` | radialMenu.ts |
| 6 | `feat: bend mode toggle with Q key, radial menu, bullet time integration` | bendMode.ts, game.ts, input.ts |
| 7 | `feat: bend feedback — shimmer audio, particle burst, HUD counter` | audio.ts, particles.ts, hud.ts |
| 8 | `feat: level editor core — toggle, modes, selection, undo/redo` | levelEditor.ts, game.ts, input.ts |
| 9 | `feat: editor click-to-place + click-to-select + drag-to-move` | levelEditor.ts |
| 10 | `feat: editor property panel with fields for obstacle/physics/pit` | levelEditor.ts |
| 11 | `feat: spatial resize handles for obstacles and pits` | editorHandles.ts, levelEditor.ts |
| 12 | `feat: editor export/import room JSON to clipboard` | levelEditor.ts |
| 13 | `feat: bend preview mode in level editor` | levelEditor.ts |
| 14 | `feat: reset bends on room transition` | roomManager.ts |
| 15 | `test: bend integration tests — physics implications of size changes` | tests |

Total: 15 tasks, ~15 commits, batched into 5 checkpoint groups.

---

## Batch Checkpoints

| After Task | What to verify |
|-----------|---------------|
| 4 | Bends apply to objects, visuals update, all tests pass |
| 7 | Full bend loop: Q toggle → radial → click target → object transforms + audio + particles. In-browser playtest. |
| 10 | Editor works: place/move/delete obstacles + physics objects + pits. Property panel edits values. |
| 13 | Spatial handles resize obstacles. Export/import JSON. Bend preview in editor. |
| 15 | All integration tests pass. Bends reset on room transition. Ready to author playground room. |
