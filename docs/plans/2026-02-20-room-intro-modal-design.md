# Room Intro Modal + Start Screen Layout

**Date:** 2026-02-20
**Branch:** demo/portfolio

## Summary

Three changes:
1. **Room intro modal** — semi-transparent overlay at the start of every room showing title + paragraph of context. Pauses gameplay until dismissed.
2. **Mobile landscape two-column start screen** — title/subtitle/start button on the left, room selector on the right.
3. **Rename** — "ISO BATTLER" → "GAMEPLAY SANDBOX"

---

## 1. Room Intro Modal

### Content model

Add an `intro` field to `RoomDefinition` in `src/config/rooms.ts`:

```ts
intro?: string;  // longer paragraph for the room intro modal
```

If `intro` is undefined, the modal falls back to the existing `commentary` string. The `commentary` field stays as-is for the room selector buttons.

### Game phase

Add a new phase `'intro'` to the game lifecycle. The flow:

1. `loadRoom()` builds the arena (obstacles, pits, physics objects, player position, door, highlights — everything it does today)
2. `loadRoom()` sets `gameState.phase = 'intro'` and shows the intro overlay
3. `updateRoomManager` already gates on `phase !== 'playing'` so spawning is frozen
4. Player clicks/taps **Continue** → `gameState.phase = 'playing'`, overlay fades out, spawning begins

### Entry paths

| Path | Before | After |
|------|--------|-------|
| Start screen → room | `game.ts` sets phase to `'playing'` then calls `loadRoom()` | `game.ts` calls `loadRoom()` which sets phase to `'intro'` |
| Door transition | `loadRoom(next)` called, phase stays `'playing'` | `loadRoom(next)` sets phase to `'intro'` |

The `game.ts` callbacks that currently set `phase = 'playing'` before `loadRoom()` will stop doing that — `loadRoom()` owns the phase now.

### Implementation

New file: `src/ui/roomIntro.ts`
- `showRoomIntro(room: RoomDefinition, onContinue: () => void)` — creates/shows the overlay
- `hideRoomIntro()` — fades out and removes

New HTML element in `index.html`:
```html
<div id="room-intro" class="hidden">
  <div class="room-intro-content">
    <h2 id="room-intro-name"></h2>
    <p id="room-intro-text"></p>
    <button id="room-intro-continue">Continue</button>
  </div>
</div>
```

### Integration in `roomManager.ts`

In `loadRoom()`, after all setup, instead of `showAnnounce(room.name)`:
- Import and call `showRoomIntro(room, onContinue)`
- `onContinue` callback: set `gameState.phase = 'playing'` (need a setter or pass gameState)

Since `loadRoom` doesn't currently have access to set `gameState.phase`, pass a callback from `game.ts` during init (similar to how `initScreens` works).

### Styling

```
#room-intro {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 15, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;  /* below start-screen (100) but above game UI */
  opacity: 0;
  transition: opacity 0.3s ease;
}
#room-intro.visible { opacity: 1; }
#room-intro.hidden { display: none; }

.room-intro-content {
  max-width: 500px;
  text-align: center;
  padding: 40px;
}

#room-intro-name — same style as .screen h1 but smaller (~32px)
#room-intro-text — 14px, rgba(255,255,255,0.6), line-height 1.6
#room-intro-continue — same style as .screen button
```

---

## 2. Mobile Landscape Two-Column Start Screen

### Problem

On mobile landscape, the vertically-stacked start screen (title → subtitle → start button → room list) overflows and is hard to navigate.

### Solution

Add a `@media (pointer: coarse) and (orientation: landscape)` query:

- `#start-screen` becomes `flex-direction: row` with two columns
- **Left column**: title (h1), subtitle (p), Start button — vertically centered
- **Right column**: room selector list — scrollable, takes remaining width

### HTML change

Wrap the left-side content in a container div:

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

### CSS

```css
@media (pointer: coarse) and (orientation: landscape) {
  #start-screen {
    flex-direction: row;
    align-items: stretch;
    padding: 20px;
    gap: 24px;
  }

  .start-screen-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  #room-selector {
    flex: 1;
    max-height: 100%;  /* override the 35vh portrait limit */
    overflow-y: auto;
    align-self: center;
  }
}
```

Portrait mode stays as-is (stacked layout).

---

## 3. Rename

- `index.html`: `<h1>ISO BATTLER</h1>` → `<h1>GAMEPLAY SANDBOX</h1>`
- `<title>` tag if it exists
- No code references to the name exist outside HTML

---

## What I won't build

- No text animation / typewriter effect
- No skip-all-intros setting
- No keyboard shortcut to dismiss (just click/tap Continue)
- No transition animation between rooms beyond the overlay fade
- The intro modal does NOT replace the room selector's existing commentary — both exist independently
