# Room Intro Modal + Start Screen Layout — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a room intro modal that pauses gameplay at the start of each room, restructure the start screen for mobile landscape, and rename the game.

**Architecture:** The intro modal is a new HTML overlay managed by `src/ui/roomIntro.ts`. A new `'intro'` game phase pauses all game logic while the overlay is shown. The game loop already gates on `phase === 'playing'`, so `'intro'` naturally freezes everything while still rendering the scene behind the semi-transparent overlay. The mobile landscape layout is CSS-only (with a small HTML wrapper div).

**Tech Stack:** TypeScript, HTML, CSS. No new dependencies.

**Design doc:** `docs/plans/2026-02-20-room-intro-modal-design.md`

---

### Task 1: Rename + HTML structure changes

**Files:**
- Modify: `index.html:30-38`

**Step 1: Rename title and restructure start screen HTML**

In `index.html`, replace lines 30-38:

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

With:

```html
  <div id="start-screen" class="screen">
    <div class="start-screen-main">
      <h1>GAMEPLAY SANDBOX</h1>
      <p>Design exploration — a playable portfolio</p>
      <button id="start-btn">Start</button>
    </div>
    <div id="room-selector">
      <p class="room-selector-label">Or jump to a room:</p>
      <div id="room-selector-list"></div>
    </div>
  </div>
```

**Step 2: Add room intro overlay HTML**

Add this right after the `#game-over-screen` div (before the mobile action buttons):

```html
  <div id="room-intro" class="hidden">
    <div class="room-intro-content">
      <h2 id="room-intro-name"></h2>
      <p id="room-intro-text"></p>
      <button id="room-intro-continue">Continue</button>
    </div>
  </div>
```

**Step 3: Build and verify no errors**

Run: `npm run build`
Expected: Build succeeds (HTML changes don't affect TS build, but confirm no regressions)

**Step 4: Commit**

```
feat: rename to Gameplay Sandbox, add intro modal HTML shell
```

---

### Task 2: Add intro modal + landscape layout CSS

**Files:**
- Modify: `style.css` (add after the Room Selector section, ~line 321)

**Step 1: Add room intro modal styles**

Insert after the `.room-selector-btn .room-desc` block (after line 321):

```css
/* ── Room Intro Modal ── */
#room-intro {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 15, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

#room-intro.visible {
  opacity: 1;
  pointer-events: all;
}

#room-intro.hidden {
  display: none;
}

.room-intro-content {
  max-width: 500px;
  text-align: center;
  padding: 40px 32px;
}

#room-intro-name {
  font-size: 32px;
  color: #ff4466;
  letter-spacing: 6px;
  text-transform: uppercase;
  margin-bottom: 20px;
  text-shadow: 0 0 20px rgba(255, 68, 102, 0.5);
}

#room-intro-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
  margin-bottom: 30px;
}

#room-intro-continue {
  padding: 12px 40px;
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #44ff88;
  background: rgba(20, 20, 40, 0.8);
  border: 1px solid rgba(68, 255, 136, 0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

#room-intro-continue:hover {
  background: rgba(68, 255, 136, 0.15);
  border-color: rgba(68, 255, 136, 0.8);
  box-shadow: 0 0 15px rgba(68, 255, 136, 0.3);
}
```

**Step 2: Add `.start-screen-main` base styles**

The wrapper div needs no special styling on desktop (it's transparent to the existing flex column layout), but we do need to define it for mobile landscape. Add right before the `/* Wave announcement overlay */` comment:

```css
.start-screen-main {
  display: contents; /* invisible wrapper on desktop — children flow normally */
}
```

**Step 3: Add mobile landscape two-column layout**

Inside the existing `@media (pointer: coarse)` block (around line 436), add a nested media query at the end, before the closing `}`:

```css
  /* ── Mobile Landscape: two-column start screen ── */
  @media (orientation: landscape) {
    #start-screen {
      flex-direction: row;
      align-items: stretch;
      padding: 16px 24px;
      gap: 24px;
    }

    .start-screen-main {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    #room-selector {
      flex: 1;
      max-height: 100%;
      align-self: center;
    }

    /* Smaller text in landscape to fit both columns */
    .screen h1 {
      font-size: 24px;
      letter-spacing: 3px;
    }

    #room-intro-name {
      font-size: 24px;
      letter-spacing: 3px;
    }

    #room-intro-text {
      font-size: 12px;
    }

    .room-intro-content {
      padding: 20px 24px;
    }
  }
```

**Step 4: Add mobile portrait intro modal adjustments**

Still inside the `@media (pointer: coarse)` block, add (before the landscape section):

```css
  #room-intro-name {
    font-size: 24px;
    letter-spacing: 4px;
  }

  #room-intro-text {
    font-size: 12px;
  }

  #room-intro-continue {
    padding: 10px 30px;
    font-size: 12px;
  }

  .room-intro-content {
    padding: 24px 20px;
    max-width: 90vw;
  }
```

**Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```
feat: room intro modal + mobile landscape layout CSS
```

---

### Task 3: Add `'intro'` phase to game types and game loop

**Files:**
- Modify: `src/types/index.ts:420`
- Modify: `src/engine/game.ts:60-68`

**Step 1: Add `'intro'` to the phase union type**

In `src/types/index.ts`, line 420, change:

```ts
  phase: 'waiting' | 'playing' | 'gameOver';
```

To:

```ts
  phase: 'waiting' | 'playing' | 'gameOver' | 'intro';
```

**Step 2: Handle `'intro'` phase in game loop**

In `src/engine/game.ts`, after the `'waiting'` phase check (line 60-63), add:

```ts
  if (gameState.phase === 'intro') {
    getRendererInstance().render(getScene(), getCamera());
    return;
  }
```

This renders the scene (arena visible behind overlay) but skips all game logic.

**Step 3: Typecheck**

Run: `npm run typecheck`
Expected: No errors (the new phase value is now valid everywhere)

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```
feat: add 'intro' game phase — renders scene, skips logic
```

---

### Task 4: Create `roomIntro.ts` UI module

**Files:**
- Create: `src/ui/roomIntro.ts`

**Step 1: Create the room intro UI module**

```ts
// Room Intro Modal — shows room context before gameplay begins
// Semi-transparent overlay with room name, description, and Continue button

import type { RoomDefinition } from '../config/rooms';

let overlayEl: HTMLElement | null = null;
let nameEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let continueBtn: HTMLElement | null = null;
let currentCleanup: (() => void) | null = null;

export function initRoomIntro(): void {
  overlayEl = document.getElementById('room-intro');
  nameEl = document.getElementById('room-intro-name');
  textEl = document.getElementById('room-intro-text');
  continueBtn = document.getElementById('room-intro-continue');
}

export function showRoomIntro(room: RoomDefinition, onContinue: () => void): void {
  if (!overlayEl || !nameEl || !textEl || !continueBtn) return;

  // Clean up any previous listener
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  nameEl.textContent = room.name;
  textEl.textContent = room.intro ?? room.commentary;

  // Show overlay (hidden → visible with fade)
  overlayEl.classList.remove('hidden');
  // Force reflow so the opacity transition triggers
  void overlayEl.offsetWidth;
  overlayEl.classList.add('visible');

  const handleContinue = () => {
    cleanup();
    hideRoomIntro();
    onContinue();
  };

  const handleClick = () => handleContinue();
  const handleTouch = (e: Event) => {
    e.preventDefault();
    handleContinue();
  };

  continueBtn.addEventListener('click', handleClick);
  continueBtn.addEventListener('touchend', handleTouch);

  const cleanup = () => {
    continueBtn!.removeEventListener('click', handleClick);
    continueBtn!.removeEventListener('touchend', handleTouch);
    currentCleanup = null;
  };

  currentCleanup = cleanup;
}

export function hideRoomIntro(): void {
  if (!overlayEl) return;
  overlayEl.classList.remove('visible');
  // After fade-out transition, hide completely
  setTimeout(() => {
    if (overlayEl) overlayEl.classList.add('hidden');
  }, 300);
}
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds (module not imported yet, but esbuild won't error on unused files)

**Step 3: Commit**

```
feat: roomIntro.ts — intro modal show/hide logic
```

---

### Task 5: Add `intro` field to room definitions

**Files:**
- Modify: `src/config/rooms.ts:21` (add field to interface)
- Modify: `src/config/rooms.ts:57-286` (add `intro` to each room)

**Step 1: Add `intro` to `RoomDefinition` interface**

In `src/config/rooms.ts`, after line 21 (`commentary: string;`), add:

```ts
  intro?: string;
```

**Step 2: Add placeholder `intro` text to each room**

For now, use slightly expanded versions of the commentary. Jeff will rewrite these later. Add an `intro` field to each room object:

Room 1 — "The Origin" (line 61):
```ts
    intro: "The very first prototype — February 7th. Auto-fire projectiles, a cylinder-and-sphere player model, and the question: does moving and shooting in isometric feel good? This is where it all started.",
```

Room 2 — "The Foundation" (line 88):
```ts
    intro: "What's the simplest satisfying combat loop? Goblins rush you, you have melee and dash. Pits in the arena let you knock enemies off the edge. The design question: can force push + environmental hazards carry the combat?",
```

Room 3 — "Physics Playground" (line 122):
```ts
    intro: "What if the arena itself is the weapon? Wall slam damage, enemy collision damage, and pits everywhere. The force push becomes a spatial tool — not just knockback, but a way to use the environment against enemies.",
```

Room 4 — "The Shadows" (line 158):
```ts
    intro: "What if the design question shifts from 'how do I deal damage' to 'how do I avoid detection'? Enemies patrol with vision cones. Cover matters. You can still fight — but getting spotted changes the encounter.",
```

Room 5 — "The Workshop" (line 218):
```ts
    intro: "What if you could bend the rules of the world? Enlarge a rock to trigger a pressure plate. Shrink a crate blocking your path. This room explores object manipulation as a core verb alongside combat.",
```

Room 6 — "The Arena" (line 264):
```ts
    intro: "What if combat had a Y-axis? Jump, launch enemies into the air, dunk them back down, spike them across the arena. This is the current direction — vertical combat with physics-driven aerial verbs.",
```

**Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: Both succeed

**Step 4: Commit**

```
feat: add intro text to all room definitions
```

---

### Task 6: Wire up the intro modal to the game lifecycle

**Files:**
- Modify: `src/engine/game.ts:270-282` (change start callbacks)
- Modify: `src/engine/roomManager.ts:67-77` (add onContinue callback to init)
- Modify: `src/engine/roomManager.ts:79-204` (show intro in loadRoom)

**Step 1: Add onContinue callback to roomManager init**

In `src/engine/roomManager.ts`, modify the `initRoomManager` signature and store the callback:

At the top, add import:
```ts
import { initRoomIntro, showRoomIntro, hideRoomIntro } from '../ui/roomIntro';
```

Add a module-level variable:
```ts
let onContinueCallback: (() => void) | null = null;
```

Change `initRoomManager` (line 67) to accept and store the callback:
```ts
export function initRoomManager(scene: any, onIntroComplete: () => void) {
  sceneRef = scene;
  onContinueCallback = onIntroComplete;
  announceEl = document.getElementById('wave-announce');
  initTelegraph(scene);
  initDoor(scene);
  initRoomIntro();

  // Track enemy deaths for spawn dispatch
  on('enemyDied', () => {
    totalKills++;
  });
}
```

**Step 2: Show intro modal in loadRoom**

In `loadRoom()`, replace lines 159-161:
```ts
  // Show room announce
  showAnnounce(room.name);
  setTimeout(hideAnnounce, 2000);
```

With:
```ts
  // Show room intro modal — gameplay paused until Continue
  gameState.phase = 'intro' as any;
  showRoomIntro(room, () => {
    gameState.phase = 'playing';
    if (onContinueCallback) onContinueCallback();
  });
```

Note: `as any` is needed because `loadRoom` receives `gameState` as `any` already, but if the type is strict we cast. Actually — `gameState` parameter is typed `any` in this function, so no cast needed. Just:

```ts
  gameState.phase = 'intro';
  showRoomIntro(room, () => {
    gameState.phase = 'playing';
    if (onContinueCallback) onContinueCallback();
  });
```

**Step 3: Update game.ts callbacks**

In `src/engine/game.ts`, the `initScreens` callbacks at lines 270-282 currently set `phase = 'playing'` before calling `loadRoom`. Remove the `phase = 'playing'` from these callbacks — `loadRoom` now owns the phase.

Change the Start button callback (line 271):
```ts
    initScreens(restart, () => {
      resumeAudio();
      document.getElementById('hud')!.style.visibility = 'visible';
      loadRoom(0, gameState);
      lastTime = performance.now();
    }, (roomIndex: number) => {
      resumeAudio();
      document.getElementById('hud')!.style.visibility = 'visible';
      loadRoom(roomIndex, gameState);
      lastTime = performance.now();
    });
```

Also update `initRoomManager` call (line 248) to pass the onIntroComplete callback:
```ts
    initRoomManager(scene, () => {
      // Called when intro modal is dismissed — ensure HUD is visible
      document.getElementById('hud')!.style.visibility = 'visible';
    });
```

And remove `document.getElementById('hud')!.style.visibility = 'visible';` from the initScreens callbacks since it's now handled in onIntroComplete. Actually — keep it in both places. The HUD needs to be visible before the intro shows (so health bar appears behind the overlay). So the initScreens callbacks should still set it. The onIntroComplete callback can be a no-op or used for future needs:

```ts
    initRoomManager(scene, () => {
      // Room intro dismissed — gameplay begins
    });
```

**Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: Both succeed

**Step 5: Manual test**

Run: `npm run watch` and open in browser.
- Click "Start" or pick a room — intro modal should appear over the arena
- Click "Continue" — gameplay starts
- Walk through door to next room — intro modal appears again
- Enemies should NOT spawn while intro is showing

**Step 6: Commit**

```
feat: wire intro modal into game lifecycle — pauses until Continue
```

---

### Task 7: Visual polish and edge cases

**Files:**
- Modify: `src/engine/roomManager.ts` (victory room handling)
- Possibly: `style.css` (minor tweaks)

**Step 1: Handle special rooms**

In `loadRoom()`, the victory check (line 80-83) calls `showAnnounce('VICTORY!')` and returns early. This should NOT show the intro modal. Add the intro modal call only for normal rooms — place it after the special room checks.

Review the current flow in `loadRoom()`:
1. Lines 80-83: victory check (returns early)
2. Lines 168-180: rest room handling (returns early)
3. Lines 182-188: victory room handling (returns early)
4. Lines 190+: normal combat room

The intro modal call should go right before the phase is set, after all setup but before the early returns for special rooms. Actually — the intro should show for ALL rooms including rest rooms. But NOT for the final "VICTORY!" when `index >= ROOMS.length`.

Move the intro modal call to the end of `loadRoom()`, after all setup, as a final step. The early returns for rest/victory rooms need the intro too, so move the intro trigger above those checks but after arena setup.

Specifically: the intro modal call should replace the `showAnnounce(room.name)` at line 160, and the rest/victory room early returns (lines 168-188) should still proceed — but with the intro modal showing first.

The cleanest approach: set the intro modal at the very end of `loadRoom()` as the last thing, and restructure the rest/victory returns to not exit early before it. OR: add the intro call in each path.

Simpler: keep the intro call at line 160 (replacing showAnnounce). The rest room / victory room blocks return early AFTER this point currently, but they happen after line 160. Looking at the code flow:
- Line 160: showAnnounce (now: showRoomIntro) — this happens for ALL rooms
- Line 168: rest room early return
- Line 182: victory room early return

So the intro modal is already correctly positioned — it runs before the early returns. The rest room path sets `roomCleared = true` and returns, which is fine — when the user clicks Continue, phase goes to `'playing'` and the rest room logic (door timer) works.

No code change needed here — just verify the flow is correct.

**Step 2: Suppress the showAnnounce for room name**

Since the intro modal now shows the room name, remove the `showAnnounce(room.name)` + `setTimeout(hideAnnounce, 2000)` that was replaced in Task 6. (Already done.)

**Step 3: Test edge cases**

- Start → Room 1 → Continue → play → door → Room 2 intro appears
- Pick Room 6 from selector → intro appears → Continue → play
- Let enemy kill you → game over → restart → Room 1 intro appears
- Mobile portrait: intro modal fits on screen
- Mobile landscape: intro modal text is readable

**Step 4: Commit (if any fixes needed)**

```
fix: intro modal edge cases and visual tweaks
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `index.html` | Rename h1, wrap start-screen-main div, add room-intro overlay |
| `style.css` | Room intro modal styles, .start-screen-main, mobile landscape layout |
| `src/types/index.ts` | Add `'intro'` to phase union |
| `src/engine/game.ts` | Handle `'intro'` phase in game loop, update initScreens callbacks, pass callback to initRoomManager |
| `src/ui/roomIntro.ts` | New file — showRoomIntro / hideRoomIntro |
| `src/config/rooms.ts` | Add `intro` field to interface + placeholder text per room |
| `src/engine/roomManager.ts` | Import roomIntro, accept onIntroComplete callback, show intro in loadRoom |
