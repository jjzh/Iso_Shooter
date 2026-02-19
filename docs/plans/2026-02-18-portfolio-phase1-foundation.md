# Portfolio Demo Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add profile system, sandbox mode, room selector UI, and replace Hades rooms with 2 demo rooms (base profile).

**Architecture:** Extend `RoomDefinition` with `profile` and `sandboxMode` fields. Create a thin `profileManager.ts` skeleton (cleanup/setup hooks for later phases). Sandbox mode = call `unlockDoor()` immediately after `createDoor()`. Room selector is a button list on the start screen. Replace existing 5 Hades rooms with 2 demo rooms.

**Tech Stack:** TypeScript, Three.js (global), vitest for tests, esbuild bundler

---

### Task 1: Extend RoomDefinition with profile and sandbox fields

**Files:**
- Modify: `src/config/rooms.ts:8-18` (RoomDefinition interface)
- Modify: `src/types/index.ts` (add PlayerProfile type)
- Test: `tests/rooms.test.ts`

**Step 1: Write the failing test**

Add to `tests/rooms.test.ts`:

```typescript
describe('Profile system', () => {
  it('every room should have a valid profile', () => {
    const validProfiles = ['base', 'assassin', 'rule-bending', 'vertical'];
    for (const room of ROOMS) {
      expect(validProfiles).toContain(room.profile);
    }
  });

  it('every room should have sandboxMode defined', () => {
    for (const room of ROOMS) {
      expect(typeof room.sandboxMode).toBe('boolean');
    }
  });

  it('every room should have a commentary string', () => {
    for (const room of ROOMS) {
      expect(typeof room.commentary).toBe('string');
      expect(room.commentary.length).toBeGreaterThan(0);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rooms.test.ts`
Expected: FAIL — `room.profile` is undefined

**Step 3: Add PlayerProfile type and extend RoomDefinition**

In `src/types/index.ts`, add near the top (after the Vector3 block):

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════════════════

export type PlayerProfile = 'base' | 'assassin' | 'rule-bending' | 'vertical';
```

In `src/config/rooms.ts`, update the interface:

```typescript
import { Obstacle, Pit, SpawnPack, RoomSpawnBudget, PlayerProfile } from '../types/index';

export interface RoomDefinition {
  name: string;
  profile: PlayerProfile;
  sandboxMode: boolean;
  commentary: string;
  arenaHalfX: number;
  arenaHalfZ: number;
  obstacles: Obstacle[];
  pits: Pit[];
  spawnBudget: RoomSpawnBudget;
  playerStart: { x: number; z: number };
  isRestRoom?: boolean;
  isVictoryRoom?: boolean;
}
```

Then add `profile: 'base'`, `sandboxMode: true`, and `commentary: '...'` to every existing room object in the `ROOMS` array. Use these commentary strings:
- Room 1: `"Starting point: what's the simplest satisfying combat loop?"`
- Room 2: `"What if the arena is the weapon? Physics-first combat."`
- Room 3: `"Full enemy roster — area denial, ranged pressure, melee rush."`
- Room 4 (rest): `"A moment to breathe."`
- Room 5 (victory): `"Victory."`

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rooms.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/index.ts src/config/rooms.ts tests/rooms.test.ts
git commit -m "feat: add profile, sandboxMode, commentary to RoomDefinition"
```

---

### Task 2: Create profileManager.ts skeleton

**Files:**
- Create: `src/engine/profileManager.ts`
- Test: `tests/profile-manager.test.ts`

**Step 1: Write the failing test**

Create `tests/profile-manager.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getActiveProfile, setProfile, type ProfileCleanupFn, type ProfileSetupFn } from '../src/engine/profileManager';

describe('profileManager', () => {
  it('should default to base profile', () => {
    expect(getActiveProfile()).toBe('base');
  });

  it('setProfile should change the active profile', () => {
    setProfile('vertical');
    expect(getActiveProfile()).toBe('vertical');
    setProfile('base'); // reset
  });

  it('setProfile should call cleanup for old profile', () => {
    const calls: string[] = [];
    setProfile('base', {
      cleanup: () => { calls.push('cleanup'); },
      setup: () => { calls.push('setup'); },
    });
    setProfile('vertical');
    expect(calls).toContain('cleanup');
  });

  it('setProfile should call setup for new profile', () => {
    const calls: string[] = [];
    setProfile('assassin', {
      cleanup: () => {},
      setup: () => { calls.push('setup'); },
    });
    expect(calls).toContain('setup');
  });

  it('setProfile to same profile should still run cleanup + setup', () => {
    const calls: string[] = [];
    setProfile('base');
    setProfile('base', {
      cleanup: () => { calls.push('cleanup'); },
      setup: () => { calls.push('setup'); },
    });
    expect(calls).toEqual(['cleanup', 'setup']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/profile-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement profileManager.ts**

Create `src/engine/profileManager.ts`:

```typescript
// Profile Manager — switches active profile between rooms
// Each profile represents a different prototype branch's mechanics.
// Cleanup/setup hooks let future phases register branch-specific teardown.

import type { PlayerProfile } from '../types/index';

export type ProfileCleanupFn = () => void;
export type ProfileSetupFn = () => void;

export interface ProfileHooks {
  cleanup: ProfileCleanupFn;
  setup: ProfileSetupFn;
}

let activeProfile: PlayerProfile = 'base';
let currentHooks: ProfileHooks | null = null;

export function getActiveProfile(): PlayerProfile {
  return activeProfile;
}

export function setProfile(profile: PlayerProfile, hooks?: ProfileHooks): void {
  // Cleanup old profile
  if (currentHooks) {
    currentHooks.cleanup();
  }

  activeProfile = profile;
  currentHooks = hooks ?? null;

  // Setup new profile
  if (currentHooks) {
    currentHooks.setup();
  }
}

export function resetProfile(): void {
  if (currentHooks) {
    currentHooks.cleanup();
  }
  activeProfile = 'base';
  currentHooks = null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/profile-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/engine/profileManager.ts tests/profile-manager.test.ts
git commit -m "feat: profileManager skeleton — setProfile, cleanup/setup hooks"
```

---

### Task 3: Implement sandbox mode in roomManager

**Files:**
- Modify: `src/engine/roomManager.ts:66-141` (loadRoom function)
- Test: `tests/rooms.test.ts` (add sandbox test)

**Step 1: Write the failing test**

Add to `tests/rooms.test.ts`:

```typescript
describe('Sandbox mode', () => {
  it('all demo rooms should have sandboxMode: true', () => {
    for (const room of ROOMS) {
      expect(room.sandboxMode).toBe(true);
    }
  });
});
```

**Step 2: Run test to verify it passes** (it should already pass since Task 1 set all rooms to `sandboxMode: true`)

Run: `npx vitest run tests/rooms.test.ts`
Expected: PASS

**Step 3: Implement sandbox mode in loadRoom**

In `src/engine/roomManager.ts`, import `setProfile`:

```typescript
import { setProfile } from './profileManager';
```

In the `loadRoom` function, after the door is created for combat rooms (after line ~140 `createDoor(...)`), add:

```typescript
  // Profile switch
  setProfile(room.profile);

  // Sandbox mode — door starts unlocked, enemies still spawn
  if (room.sandboxMode) {
    unlockDoor();
  }
```

This goes right after the `createDoor()` call at the bottom of `loadRoom()` (the combat room path, around line 140).

**Step 4: Build and typecheck**

Run: `npm run typecheck && npm run build`
Expected: Clean build, no errors

**Step 5: Commit**

```bash
git add src/engine/roomManager.ts
git commit -m "feat: sandbox mode — door starts unlocked, profile switching on room load"
```

---

### Task 4: Replace room definitions with demo rooms

**Files:**
- Modify: `src/config/rooms.ts` (replace ROOMS array)
- Modify: `tests/rooms.test.ts` (update tests for new room structure)

**Step 1: Update tests for new room structure**

Replace the existing test content in `tests/rooms.test.ts` with tests that match the new 2-room demo layout. Key changes:
- Room count: 2 (not 5)
- No rest room or victory room (for now — those are Hades-specific)
- All rooms are `profile: 'base'` and `sandboxMode: true`
- Room 1: goblins only, 1 pit
- Room 2: goblins, more walls, multiple pits

```typescript
import { describe, it, expect } from 'vitest';
import { ROOMS, RoomDefinition } from '../src/config/rooms';
import { ENEMY_TYPES } from '../src/config/enemies';

describe('Demo room definitions', () => {
  it('should have 2 rooms', () => {
    expect(ROOMS.length).toBe(2);
  });

  ROOMS.forEach((room, i) => {
    describe(`Room ${i + 1}: ${room.name}`, () => {
      it('should have a name', () => {
        expect(room.name.length).toBeGreaterThan(0);
      });

      it('should have profile base', () => {
        expect(room.profile).toBe('base');
      });

      it('should have sandboxMode true', () => {
        expect(room.sandboxMode).toBe(true);
      });

      it('should have commentary', () => {
        expect(room.commentary.length).toBeGreaterThan(0);
      });

      it('should have positive arena dimensions', () => {
        expect(room.arenaHalfX).toBeGreaterThan(5);
        expect(room.arenaHalfZ).toBeGreaterThan(5);
      });

      it('should have a spawnBudget with packs', () => {
        expect(room.spawnBudget.packs.length).toBeGreaterThan(0);
      });

      it('should have valid enemy types', () => {
        for (const pack of room.spawnBudget.packs) {
          for (const enemy of pack.enemies) {
            expect(ENEMY_TYPES).toHaveProperty(enemy.type);
          }
        }
      });

      it('should have valid spawn zones', () => {
        const validZones = ['ahead', 'sides', 'far', 'behind'];
        for (const pack of room.spawnBudget.packs) {
          expect(validZones).toContain(pack.spawnZone);
        }
      });

      it('should have playerStart within arena bounds', () => {
        expect(Math.abs(room.playerStart.x)).toBeLessThan(room.arenaHalfX);
        expect(Math.abs(room.playerStart.z)).toBeLessThan(room.arenaHalfZ);
      });

      it('should not spawn player inside obstacle or pit', () => {
        const px = room.playerStart.x;
        const pz = room.playerStart.z;
        for (const obs of room.obstacles) {
          const inX = px >= obs.x - obs.w / 2 && px <= obs.x + obs.w / 2;
          const inZ = pz >= obs.z - obs.d / 2 && pz <= obs.z + obs.d / 2;
          expect(inX && inZ).toBe(false);
        }
        for (const pit of room.pits) {
          const inX = px >= pit.x - pit.w / 2 && px <= pit.x + pit.w / 2;
          const inZ = pz >= pit.z - pit.d / 2 && pz <= pit.z + pit.d / 2;
          expect(inX && inZ).toBe(false);
        }
      });
    });
  });
});

describe('Profile system', () => {
  it('every room should have a valid profile', () => {
    const validProfiles = ['base', 'assassin', 'rule-bending', 'vertical'];
    for (const room of ROOMS) {
      expect(validProfiles).toContain(room.profile);
    }
  });
});

describe('Sandbox mode', () => {
  it('all demo rooms should have sandboxMode: true', () => {
    for (const room of ROOMS) {
      expect(room.sandboxMode).toBe(true);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/rooms.test.ts`
Expected: FAIL — still 5 rooms

**Step 3: Replace ROOMS array**

Replace the entire `ROOMS` array in `src/config/rooms.ts` with 2 demo rooms. Keep the helper functions (`pack`, `goblins`). Remove `archers` and `imps` helpers since neither demo room uses them yet.

```typescript
export const ROOMS: RoomDefinition[] = [

  // ══════════════════════════════════════════════════════════════════════
  // Room 1: "The Foundation" — goblins only, teach melee + dash + pit kills
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'The Foundation',
    profile: 'base',
    sandboxMode: true,
    commentary: "Starting point: what's the simplest satisfying combat loop?",
    arenaHalfX: 10,
    arenaHalfZ: 20,
    obstacles: [
      { x: -4, z: 5, w: 1.5, h: 2, d: 1.5 },
      { x: 4, z: -5, w: 1.5, h: 2, d: 1.5 },
    ],
    pits: [
      { x: 5, z: -8, w: 3, d: 3 },
    ],
    spawnBudget: {
      maxConcurrent: 4,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'ahead'),
        pack(goblins(3), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 16 },
  },

  // ══════════════════════════════════════════════════════════════════════
  // Room 2: "Physics Playground" — walls + pits, force push as spatial tool
  // ══════════════════════════════════════════════════════════════════════
  {
    name: 'Physics Playground',
    profile: 'base',
    sandboxMode: true,
    commentary: "What if the arena is the weapon? Physics-first combat.",
    arenaHalfX: 11,
    arenaHalfZ: 22,
    obstacles: [
      { x: -6, z: 0, w: 2, h: 2, d: 2 },
      { x: 6, z: 0, w: 2, h: 2, d: 2 },
      { x: 0, z: -10, w: 4, h: 1.5, d: 1 },
      { x: -3, z: 10, w: 1.5, h: 2, d: 1.5 },
    ],
    pits: [
      { x: -8, z: -8, w: 3, d: 4 },
      { x: 8, z: 5, w: 3, d: 3 },
      { x: 0, z: -16, w: 4, d: 3 },
    ],
    spawnBudget: {
      maxConcurrent: 5,
      telegraphDuration: 1500,
      packs: [
        pack(goblins(2), 'ahead'),
        pack(goblins(2), 'far'),
        pack(goblins(3), 'ahead'),
        pack(goblins(3), 'sides'),
      ],
    },
    playerStart: { x: 0, z: 18 },
  },
];
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rooms.test.ts`
Expected: PASS

**Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: Clean — no other file references specific room counts or names

**Step 6: Commit**

```bash
git add src/config/rooms.ts tests/rooms.test.ts
git commit -m "feat: replace Hades rooms with 2 demo rooms (Foundation + Physics Playground)"
```

---

### Task 5: Build room selector UI on start screen

**Files:**
- Create: `src/ui/roomSelector.ts`
- Modify: `index.html` (add room selector container to start screen)
- Modify: `style.css` (room selector styles)
- Modify: `src/ui/screens.ts` (wire room selector into start flow)
- Modify: `src/engine/game.ts` (pass loadRoom callback to screens)
- Test: `tests/room-selector.test.ts`

**Step 1: Write the failing test**

Create `tests/room-selector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ROOMS } from '../src/config/rooms';

describe('Room selector data', () => {
  it('every room has a name for the selector', () => {
    for (const room of ROOMS) {
      expect(room.name.length).toBeGreaterThan(0);
    }
  });

  it('every room has commentary for the selector description', () => {
    for (const room of ROOMS) {
      expect(room.commentary.length).toBeGreaterThan(0);
    }
  });

  it('room indices are valid for loadRoom', () => {
    for (let i = 0; i < ROOMS.length; i++) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(ROOMS.length);
    }
  });
});
```

**Step 2: Run test to verify it passes** (data tests — they validate the contract)

Run: `npx vitest run tests/room-selector.test.ts`
Expected: PASS

**Step 3: Add room selector HTML to start screen**

In `index.html`, replace the start-screen div with:

```html
  <div id="start-screen" class="screen">
    <h1>ISO BATTLER</h1>
    <p>Design exploration — a playable portfolio</p>
    <button id="start-btn">Start</button>
    <div id="room-selector">
      <p class="room-selector-label">Or jump to a room:</p>
      <div id="room-selector-list"></div>
    </div>
  </div>
```

**Step 4: Add room selector CSS**

Add to `style.css`:

```css
/* ── Room Selector ── */
#room-selector {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 400px;
}

.room-selector-label {
  font-size: 11px !important;
  color: rgba(255, 255, 255, 0.3) !important;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 4px !important;
}

.room-selector-btn {
  width: 100%;
  padding: 10px 20px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(20, 20, 40, 0.6);
  border: 1px solid rgba(100, 100, 160, 0.3);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  pointer-events: all;
}

.room-selector-btn:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(40, 40, 80, 0.8);
  border-color: rgba(136, 187, 255, 0.6);
}

.room-selector-btn .room-name {
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.room-selector-btn .room-desc {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 2px;
  font-style: italic;
}
```

**Step 5: Create roomSelector.ts**

Create `src/ui/roomSelector.ts`:

```typescript
// Room Selector — populates start screen with room buttons
// Clicking a room button starts the game at that room index

import { ROOMS } from '../config/rooms';

let onSelectCallback: ((roomIndex: number) => void) | null = null;

export function initRoomSelector(onSelect: (roomIndex: number) => void): void {
  onSelectCallback = onSelect;

  const listEl = document.getElementById('room-selector-list');
  if (!listEl) return;

  // Clear any existing buttons
  while (listEl.firstChild) {
    listEl.removeChild(listEl.firstChild);
  }

  ROOMS.forEach((room, index) => {
    const btn = document.createElement('button');
    btn.className = 'room-selector-btn';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-name';
    nameSpan.textContent = `${index + 1}. ${room.name}`;
    btn.appendChild(nameSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'room-desc';
    descSpan.textContent = room.commentary;
    btn.appendChild(descSpan);

    const handleClick = () => {
      if (onSelectCallback) onSelectCallback(index);
    };

    btn.addEventListener('click', handleClick);
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleClick();
    });

    listEl.appendChild(btn);
  });
}
```

**Step 6: Wire room selector into screens.ts**

Update `src/ui/screens.ts` to accept a `startAtRoom` callback and initialize the room selector:

```typescript
import { initRoomSelector } from './roomSelector';

let startScreen: any, startBtn: any;
let gameOverScreen: any, restartBtn: any, gameOverStats: any;

export function initScreens(
  onRestart: () => void,
  onStart: () => void,
  onStartAtRoom?: (roomIndex: number) => void
) {
  // Start screen
  startScreen = document.getElementById('start-screen');
  startBtn = document.getElementById('start-btn');

  const handleStart = () => {
    hideStartScreen();
    onStart();
  };
  startBtn.addEventListener('click', handleStart);
  startBtn.addEventListener('touchend', (e: any) => {
    e.preventDefault();
    handleStart();
  });

  // Room selector
  if (onStartAtRoom) {
    initRoomSelector((roomIndex) => {
      hideStartScreen();
      onStartAtRoom(roomIndex);
    });
  }

  // Game over screen
  gameOverScreen = document.getElementById('game-over-screen');
  restartBtn = document.getElementById('restart-btn');
  gameOverStats = document.getElementById('game-over-stats');

  restartBtn.addEventListener('click', () => {
    hideScreens();
    onRestart();
  });
}

export function hideStartScreen() {
  startScreen.classList.add('hidden');
}

export function showGameOver(gameState: any) {
  gameOverStats.textContent = `Enemies defeated: ${gameState.currency} gold earned`;
  gameOverScreen.classList.remove('hidden');
}

export function hideScreens() {
  gameOverScreen.classList.add('hidden');
}
```

**Step 7: Wire onStartAtRoom in game.ts**

In `src/engine/game.ts`, update the `initScreens` call to pass a third argument:

```typescript
    initScreens(restart, () => {
      resumeAudio();
      gameState.phase = 'playing';
      document.getElementById('hud')!.style.visibility = 'visible';
      loadRoom(0, gameState);
      lastTime = performance.now();
    }, (roomIndex: number) => {
      resumeAudio();
      gameState.phase = 'playing';
      document.getElementById('hud')!.style.visibility = 'visible';
      loadRoom(roomIndex, gameState);
      lastTime = performance.now();
    });
```

**Step 8: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: Clean build

**Step 9: Commit**

```bash
git add src/ui/roomSelector.ts src/ui/screens.ts src/engine/game.ts index.html style.css tests/room-selector.test.ts
git commit -m "feat: room selector UI on start screen — jump to any room"
```

---

### Task 6: Update HUD for room names instead of wave numbers

**Files:**
- Modify: `src/ui/hud.ts` (show room name instead of "Wave N")
- Modify: `src/engine/roomManager.ts` (export current room name getter)

**Step 1: Add room name getter to roomManager**

In `src/engine/roomManager.ts`, add:

```typescript
export function getCurrentRoomName(): string {
  const room = ROOMS[currentRoomIndex];
  return room ? room.name : '';
}
```

**Step 2: Update HUD to show room name**

In `src/ui/hud.ts`, find where `wave-indicator` is updated and change it to show the room name. Import `getCurrentRoomName` and `getCurrentRoomIndex` from roomManager, then update the wave indicator text:

```typescript
waveEl.textContent = `${getCurrentRoomIndex() + 1}. ${getCurrentRoomName()}`;
```

Exact changes depend on the HUD code — read `src/ui/hud.ts` to find the update line.

**Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: Clean build

**Step 4: Commit**

```bash
git add src/ui/hud.ts src/engine/roomManager.ts
git commit -m "feat: HUD shows room name instead of wave number"
```

---

### Task 7: Update page title

**Files:**
- Modify: `index.html`

**Step 1: Update the title tag**

Change the `<title>` in `index.html`:

```html
<title>Design Exploration — Jeff Zhang</title>
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "chore: update page title for portfolio demo"
```

---

### Task 8: Run full test suite + build verification

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Build**

Run: `npm run build`
Expected: Clean build

**Step 4: Manual playtest**

Open in browser and verify:
- [ ] Start screen shows room selector with 2 rooms
- [ ] "Start" button loads Room 1
- [ ] Room selector buttons load correct rooms
- [ ] Room 1: sandbox mode — door is unlocked immediately, enemies spawn
- [ ] Walk through door → Room 2 loads
- [ ] Room 2: more pits, more walls, enemies spawn
- [ ] Room 2 clear → "VICTORY!"
- [ ] HUD shows room name (e.g., "1. The Foundation")

**Step 5: Fix any issues found during testing**

If issues are found, fix and commit individually.
