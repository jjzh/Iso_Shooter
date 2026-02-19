# Mobile Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 2-button vertical stack with a 5-button radial fan layout (Attack/Push, Dash, Jump, Launch, Cancel) with context-sensitive aerial verb routing and tunable positioning.

**Architecture:** New `MOBILE_CONTROLS` config drives a radial layout engine in `hud.ts`. Buttons are HTML elements positioned via JS (not CSS flex) so the tuning panel can adjust them in real-time. Each button wires into existing `inputState` triggers. The Launch button detects float state via `playerHasTag(TAG.AERIAL)` to route tap→spike and hold→dunk through the existing float selector.

**Tech Stack:** HTML/CSS for button elements, TypeScript for positioning logic and input wiring, existing tuning panel pattern for runtime adjustment.

**Design doc:** `docs/plans/2026-02-18-mobile-controls-design.md`

---

### Task 1: Create MOBILE_CONTROLS config

**Files:**
- Create: `src/config/mobileControls.ts`

**Step 1: Create the config file**

```typescript
// src/config/mobileControls.ts
// Tunable config for mobile radial button layout.
// Mutated directly by the tuning panel at runtime.

export const MOBILE_CONTROLS = {
  // Layout
  primarySize: 85,       // px — Attack/Push button
  fanSize: 60,           // px — Dash, Jump, Launch
  cancelSize: 45,        // px — Cancel button
  arcRadius: 100,        // px — distance from primary center to fan buttons
  arcStartAngle: 210,    // degrees — 0=right, 90=up, 180=left; 210 = lower-left
  arcSpread: 90,         // degrees — total angle spread across fan buttons
  edgeMargin: 20,        // px — offset from screen edge

  // Behavior
  holdThreshold: 180,    // ms — tap vs hold on Attack/Push button
  dragThreshold: 15,     // px — min distance to register as drag
  dragMaxRadius: 80,     // px — full deflection range for drag-to-aim
};
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add src/config/mobileControls.ts
git commit -m "feat: add MOBILE_CONTROLS config for radial button layout"
```

---

### Task 2: Add missing input trigger functions

**Files:**
- Modify: `src/engine/input.ts:358-382` (add new trigger exports alongside existing ones)

**Step 1: Add triggerAttack, triggerJump, triggerLaunch, triggerCancel, setAttackHeld**

Add after the existing trigger functions at line 362:

```typescript
export function triggerAttack() { inputState.attack = true; }
export function triggerJump() { inputState.jump = true; }
export function triggerLaunch() { inputState.launch = true; }
export function setAttackHeld(held: boolean) { inputState.attackHeld = held; }

// Cancel flag — consumed by game loop to cancel active verb / charge
let _cancelRequested = false;
export function triggerCancel() { _cancelRequested = true; }
export function consumeCancel(): boolean {
  if (_cancelRequested) { _cancelRequested = false; return true; }
  return false;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. New exports available but not yet consumed.

**Step 3: Commit**

```bash
git add src/engine/input.ts
git commit -m "feat: add triggerAttack/Jump/Launch/Cancel input exports for mobile"
```

---

### Task 3: Wire cancel into game loop

**Files:**
- Modify: `src/engine/game.ts` — import `consumeCancel`, call it in the update loop
- Modify: `src/entities/player.ts` — check cancel to release force push charge

The cancel needs to do two things:
1. Cancel active aerial verb (via existing `cancelActiveVerb()`)
2. Release force push charge if charging

**Step 1: Add cancel consumption to game update**

In `src/engine/game.ts`, in the update function, after `updateInput()` and before `updatePlayer()`:

```typescript
import { consumeCancel } from './input';
import { cancelActiveVerb } from './aerialVerbs';

// In the update loop, after updateInput():
if (consumeCancel()) {
  cancelActiveVerb();
  // Force push cancel is handled in player.ts via ultimateHeld going false
  setUltimateHeld(false);
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

**Step 3: Commit**

```bash
git add src/engine/game.ts
git commit -m "feat: wire cancel input into game loop for aerial verbs and force push"
```

---

### Task 4: Replace HTML mobile button markup

**Files:**
- Modify: `index.html:43-56` — replace 2-button `#mobile-actions` with 5-button radial container

**Step 1: Replace mobile-actions HTML**

Replace the `#mobile-actions` div with:

```html
<div id="mobile-actions">
  <div id="mobile-btn-attack" class="mobile-btn mobile-btn-primary ready">
    <div class="mobile-btn-icon">⚔️</div>
    <div class="mobile-btn-label">Attack</div>
    <div class="mobile-btn-cd-text"></div>
    <div class="mobile-btn-cd-overlay"></div>
  </div>
  <div id="mobile-btn-dash" class="mobile-btn mobile-btn-fan ready">
    <div class="mobile-btn-icon">⚡</div>
    <div class="mobile-btn-label">Dash</div>
    <div class="mobile-btn-cd-text"></div>
    <div class="mobile-btn-cd-overlay"></div>
  </div>
  <div id="mobile-btn-jump" class="mobile-btn mobile-btn-fan ready">
    <div class="mobile-btn-icon">🦘</div>
    <div class="mobile-btn-label">Jump</div>
    <div class="mobile-btn-cd-text"></div>
    <div class="mobile-btn-cd-overlay"></div>
  </div>
  <div id="mobile-btn-launch" class="mobile-btn mobile-btn-fan ready">
    <div class="mobile-btn-icon">🚀</div>
    <div class="mobile-btn-label">Launch</div>
    <div class="mobile-btn-cd-text"></div>
    <div class="mobile-btn-cd-overlay"></div>
  </div>
  <div id="mobile-btn-cancel" class="mobile-btn mobile-btn-cancel">
    <div class="mobile-btn-icon">✕</div>
    <div class="mobile-btn-label">Cancel</div>
  </div>
</div>
```

**Step 2: Verify the page loads**

Run: `npm run build` then open in browser.
Expected: Buttons exist in DOM but won't be positioned correctly yet (CSS still has old layout).

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: replace mobile button HTML with 5-button radial layout markup"
```

---

### Task 5: Update CSS for radial button layout

**Files:**
- Modify: `style.css:278-356` — replace vertical stack CSS with absolute positioning base styles
- Modify: `style.css:358-368` — adjust right joystick zone to avoid button overlap

**Step 1: Replace #mobile-actions and .mobile-btn CSS**

Replace the mobile actions CSS block with:

```css
/* ── Mobile action buttons (radial fan) ── */
#mobile-actions {
  display: none;                /* shown via @media (pointer: coarse) */
  position: fixed;
  bottom: 0;
  right: 0;
  width: 280px;
  height: 280px;
  z-index: 100;
  pointer-events: none;        /* container is transparent to touches */
}

.mobile-btn {
  position: absolute;          /* positioned by JS radial engine */
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  border: 2px solid rgba(255,255,255,0.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: auto;        /* buttons receive touches */
  transition: border-color 0.2s, box-shadow 0.2s;
}

.mobile-btn-primary {
  /* Size set by JS from MOBILE_CONTROLS.primarySize */
}

.mobile-btn-fan {
  /* Size set by JS from MOBILE_CONTROLS.fanSize */
}

.mobile-btn-cancel {
  /* Size set by JS from MOBILE_CONTROLS.cancelSize */
  opacity: 0.5;
}

.mobile-btn-cancel.active {
  opacity: 1.0;
  border-color: rgba(255, 80, 80, 0.6);
}

.mobile-btn.ready {
  border-color: rgba(68, 255, 136, 0.5);
  box-shadow: 0 0 10px rgba(68, 255, 136, 0.25);
}

/* Icon, label, cooldown styles stay the same */
.mobile-btn-icon { font-size: 22px; line-height: 1; z-index: 2; pointer-events: none; }
.mobile-btn-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; margin-top: 2px; z-index: 2; pointer-events: none; }

.mobile-btn-cd-text {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 20px; font-weight: bold;
  color: rgba(255,255,255,0.9);
  text-shadow: 0 0 6px rgba(0,0,0,0.8);
  z-index: 3; pointer-events: none;
  display: none;
}

.mobile-btn-cd-overlay {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.6);
  border-radius: 0 0 50% 50%;
  z-index: 1; pointer-events: none;
  height: 0%;
}
```

**Step 2: Shrink right joystick zone**

Change the right joystick zone to avoid the button cluster. In the `.joystick-zone` styles, reduce the right zone height or add a bottom-right dead zone. The simplest approach: make both joystick zones shorter (35% height instead of 45%) so they don't overlap the button area.

```css
.joystick-zone {
  position: fixed;
  bottom: 0;
  width: 50%;
  height: 35%;           /* was 45% — shorter to avoid button overlap */
  z-index: 50;
  display: none;
}
#zone-left { left: 0; }
#zone-right { left: 50%; }
```

**Step 3: Verify build and load**

Run: `npm run build`, open on mobile or use Chrome DevTools touch emulation.
Expected: Buttons visible but piled in one spot (JS positioning not wired yet).

**Step 4: Commit**

```bash
git add style.css
git commit -m "feat: CSS for radial mobile button layout with joystick zone adjustment"
```

---

### Task 6: Build radial positioning engine in hud.ts

**Files:**
- Modify: `src/ui/hud.ts` — replace `initMobileButtons()` with radial layout engine

This is the core task. The positioning engine reads `MOBILE_CONTROLS` config and places buttons using absolute positioning via `style.left`/`style.bottom`.

**Step 1: Add imports and button refs**

At top of `hud.ts`, add import:

```typescript
import { MOBILE_CONTROLS } from '../config/mobileControls';
```

Replace the existing `mobileBtnDash` and `mobileBtnUlt` variables with:

```typescript
let mobileBtnAttack: HTMLElement | null = null;
let mobileBtnDash: HTMLElement | null = null;
let mobileBtnJump: HTMLElement | null = null;
let mobileBtnLaunch: HTMLElement | null = null;
let mobileBtnCancel: HTMLElement | null = null;
```

**Step 2: Write positionMobileButtons() function**

This function reads `MOBILE_CONTROLS` and sets absolute positions. Called on init and whenever tuning panel changes values.

```typescript
export function positionMobileButtons(): void {
  const C = MOBILE_CONTROLS;
  if (!mobileBtnAttack) return;

  const containerW = 280; // matches CSS
  const containerH = 280;

  // Primary button: bottom-right corner of container
  const primaryX = containerW - C.edgeMargin - C.primarySize / 2;
  const primaryY = C.edgeMargin + C.primarySize / 2;
  placeButton(mobileBtnAttack, primaryX, primaryY, C.primarySize);

  // Fan buttons: arc from primary center
  const fanButtons = [mobileBtnDash, mobileBtnJump, mobileBtnLaunch];
  const fanCount = fanButtons.length;
  for (let i = 0; i < fanCount; i++) {
    const btn = fanButtons[i];
    if (!btn) continue;
    // Distribute evenly across arc
    const t = fanCount > 1 ? i / (fanCount - 1) : 0.5;
    const angleDeg = C.arcStartAngle + t * C.arcSpread;
    const angleRad = angleDeg * Math.PI / 180;
    const bx = primaryX + Math.cos(angleRad) * C.arcRadius;
    const by = primaryY + Math.sin(angleRad) * C.arcRadius;
    placeButton(btn, bx, by, C.fanSize);
  }

  // Cancel button: top-right of container
  const cancelX = containerW - C.edgeMargin - C.cancelSize / 2;
  const cancelY = containerH - C.edgeMargin - C.cancelSize / 2;
  placeButton(mobileBtnCancel, cancelX, cancelY, C.cancelSize);
}

function placeButton(btn: HTMLElement | null, cx: number, cy: number, size: number): void {
  if (!btn) return;
  btn.style.width = size + 'px';
  btn.style.height = size + 'px';
  // cx, cy are center coords within container; CSS uses right/bottom anchoring
  btn.style.right = (280 - cx - size / 2) + 'px';
  btn.style.bottom = (cy - size / 2) + 'px';
}
```

**Note:** The coordinate system has (0,0) at bottom-right of the container. `primaryX` is measured from left edge, `primaryY` from bottom edge. `placeButton` converts to CSS `right`/`bottom` offsets. This may need adjustment during testing — the math should be validated visually.

**Step 3: Update initMobileButtons() to find new elements and call positioning**

```typescript
function initMobileButtons() {
  mobileBtnAttack = document.getElementById('mobile-btn-attack');
  mobileBtnDash = document.getElementById('mobile-btn-dash');
  mobileBtnJump = document.getElementById('mobile-btn-jump');
  mobileBtnLaunch = document.getElementById('mobile-btn-launch');
  mobileBtnCancel = document.getElementById('mobile-btn-cancel');
  if (!mobileBtnAttack) return;

  positionMobileButtons();
  wireButtonHandlers();
}
```

**Step 4: Verify build and visual layout**

Run: `npm run build`, check on touch device or Chrome DevTools.
Expected: Buttons positioned in radial fan pattern. Tapping does nothing yet (handlers not wired).

**Step 5: Commit**

```bash
git add src/ui/hud.ts src/config/mobileControls.ts
git commit -m "feat: radial positioning engine for mobile buttons"
```

---

### Task 7: Wire button input handlers

**Files:**
- Modify: `src/ui/hud.ts` — implement `wireButtonHandlers()` function

**Step 1: Write wireButtonHandlers()**

This function sets up touch handlers for all 5 buttons. Reuses the existing `setupDragToAim()` helper for buttons that need drag behavior.

```typescript
import {
  triggerDash, triggerAttack, triggerJump, triggerLaunch, triggerCancel,
  triggerUltimate, setUltimateHeld, setAttackHeld,
  setAimFromScreenDrag, setAbilityDirOverride, clearAbilityDirOverride,
} from '../engine/input';
import { playerHasTag, TAG } from '../engine/tags';

function wireButtonHandlers(): void {
  // --- Attack/Push: tap = attack, hold = force push ---
  setupDragToAim(mobileBtnAttack!, {
    onDragStart: () => {
      // Start hold timer — if held past threshold, becomes force push
      triggerUltimate();
      setUltimateHeld(true);
    },
    onDragMove: (normX: number, normY: number) => {
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: (wasDrag: boolean, heldMs: number) => {
      if (heldMs < MOBILE_CONTROLS.holdThreshold && !wasDrag) {
        // Short tap — attack
        setUltimateHeld(false);
        triggerAttack();
      } else {
        // Long hold or drag — release force push
        setUltimateHeld(false);
        clearAbilityDirOverride();
      }
    },
    onCancel: () => {
      setUltimateHeld(false);
      clearAbilityDirOverride();
    },
  });

  // --- Dash: drag-to-aim, release to fire (unchanged) ---
  setupDragToAim(mobileBtnDash!, {
    onDragStart: () => {},
    onDragMove: (normX: number, normY: number) => {
      const isoX = normX * ISO_RIGHT_X + normY * ISO_UP_X;
      const isoZ = normX * ISO_RIGHT_Z + normY * ISO_UP_Z;
      setAbilityDirOverride(isoX, isoZ);
      setAimFromScreenDrag(normX, normY);
    },
    onRelease: (wasDrag: boolean) => {
      triggerDash();
      if (!wasDrag) clearAbilityDirOverride();
    },
    onCancel: () => { clearAbilityDirOverride(); },
  });

  // --- Jump: simple tap ---
  mobileBtnJump!.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    triggerJump();
  }, { passive: false });

  // --- Launch: context-sensitive (grounded vs float) ---
  setupDragToAim(mobileBtnLaunch!, {
    onDragStart: () => {
      if (playerHasTag(TAG.AERIAL)) {
        // In float → hold = dunk (set attackHeld for float selector)
        setAttackHeld(true);
      }
    },
    onDragMove: (normX: number, normY: number) => {
      if (playerHasTag(TAG.AERIAL)) {
        // Drag to aim dunk landing spot
        setAimFromScreenDrag(normX, normY);
      }
    },
    onRelease: (wasDrag: boolean, heldMs: number) => {
      if (playerHasTag(TAG.AERIAL)) {
        if (heldMs < MOBILE_CONTROLS.holdThreshold && !wasDrag) {
          // Tap during float → spike
          triggerAttack();
        }
        // Release dunk aim
        setAttackHeld(false);
        clearAbilityDirOverride();
      } else {
        // Grounded → launch
        triggerLaunch();
      }
    },
    onCancel: () => {
      setAttackHeld(false);
      clearAbilityDirOverride();
    },
  });

  // --- Cancel: simple tap ---
  mobileBtnCancel!.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    triggerCancel();
  }, { passive: false });
}
```

**Step 2: Update setupDragToAim to pass heldMs to onRelease**

The existing `setupDragToAim` doesn't track hold duration. Modify it to record `touchStartTime` and pass `heldMs` to `onRelease`:

In `setupDragToAim()`, add at the start of the touchstart handler:
```typescript
let touchStartTime = 0;
// In touchstart handler:
touchStartTime = performance.now();
```

In the touchend handler, compute and pass:
```typescript
const heldMs = performance.now() - touchStartTime;
callbacks.onRelease(wasDrag, heldMs);
```

Update the callback type to accept the optional second parameter:
```typescript
onRelease: (wasDrag: boolean, heldMs?: number) => void;
```

**Step 3: Verify build and test on touch device**

Run: `npm run build`, test each button.
Expected:
- Attack tap → fires projectile
- Attack hold → force push charge + aim
- Dash → dash with drag-to-aim
- Jump → player jumps
- Launch (grounded) → launches enemy
- Launch (float, tap) → spike
- Launch (float, hold) → dunk with aim
- Cancel → cancels current action

**Step 4: Commit**

```bash
git add src/ui/hud.ts
git commit -m "feat: wire all mobile button handlers with context-sensitive launch"
```

---

### Task 8: Update cooldown display for new buttons

**Files:**
- Modify: `src/ui/hud.ts` — update `updateHUD()` to show cooldowns on all new buttons

**Step 1: Update cooldown logic in updateHUD()**

The existing `updateHUD()` updates cooldowns for the old `mobileBtnDash` and `mobileBtnUlt`. Extend it to cover the new buttons. The Attack/Push button shows force push cooldown. Launch shows launch cooldown. Dash shows dash cooldown. Jump has no cooldown. Cancel shows active/greyed state.

Find the existing mobile cooldown update code and replace/extend with:

```typescript
// Mobile button cooldowns
if (mobileBtnAttack) {
  // Attack/Push shows force push cooldown
  updateMobileBtnCooldown(mobileBtnAttack, gameState.abilities.ultimate);
}
if (mobileBtnDash) {
  updateMobileBtnCooldown(mobileBtnDash, gameState.abilities.dash);
}
if (mobileBtnLaunch) {
  updateMobileBtnCooldown(mobileBtnLaunch, gameState.abilities.launch);
}
if (mobileBtnCancel) {
  // Cancel: show active state when there's something to cancel
  const hasActiveVerb = playerHasTag(TAG.AERIAL);
  const isCharging = gameState.abilities.ultimate.isCharging;
  mobileBtnCancel.classList.toggle('active', hasActiveVerb || isCharging);
}
```

`updateMobileBtnCooldown` is a helper that reads the ability state and sets the cooldown overlay height + text (extract from existing code to avoid duplication).

**Step 2: Verify cooldowns display correctly**

Run: `npm run build`, use abilities and check cooldown overlays animate.

**Step 3: Commit**

```bash
git add src/ui/hud.ts
git commit -m "feat: cooldown display for all mobile buttons including cancel state"
```

---

### Task 9: Add Mobile Controls tuning panel section

**Files:**
- Modify: `src/ui/tuning.ts` — add new section to SECTIONS array

**Step 1: Add Mobile Controls section**

Import the config:
```typescript
import { MOBILE_CONTROLS } from '../config/mobileControls';
```

Add a new section to the `SECTIONS` array (at the end, before the closing bracket):

```typescript
{
  section: 'Mobile Controls',
  collapsed: true,
  items: [
    { label: 'Primary Size', config: () => MOBILE_CONTROLS, key: 'primarySize', min: 60, max: 120, step: 5, suffix: 'px' },
    { label: 'Fan Size', config: () => MOBILE_CONTROLS, key: 'fanSize', min: 40, max: 90, step: 5, suffix: 'px' },
    { label: 'Cancel Size', config: () => MOBILE_CONTROLS, key: 'cancelSize', min: 30, max: 70, step: 5, suffix: 'px' },
    { label: 'Arc Radius', config: () => MOBILE_CONTROLS, key: 'arcRadius', min: 60, max: 160, step: 5, suffix: 'px' },
    { label: 'Arc Start °', config: () => MOBILE_CONTROLS, key: 'arcStartAngle', min: 180, max: 270, step: 5, suffix: '°' },
    { label: 'Arc Spread °', config: () => MOBILE_CONTROLS, key: 'arcSpread', min: 60, max: 150, step: 5, suffix: '°' },
    { label: 'Edge Margin', config: () => MOBILE_CONTROLS, key: 'edgeMargin', min: 10, max: 40, step: 2, suffix: 'px' },
    { label: 'Hold Threshold', config: () => MOBILE_CONTROLS, key: 'holdThreshold', min: 100, max: 400, step: 10, suffix: 'ms' },
    { label: 'Drag Threshold', config: () => MOBILE_CONTROLS, key: 'dragThreshold', min: 8, max: 30, step: 1, suffix: 'px' },
  ],
},
```

**Step 2: Hook slider changes to reposition buttons**

The tuning panel already mutates config objects directly. But button positions need to update when layout values change. Add a callback: after any slider in the Mobile Controls section changes, call `positionMobileButtons()`.

In the slider `input` event handler in `initTuningPanel()`, add:

```typescript
// After updating the config value:
if (item.config() === MOBILE_CONTROLS) {
  positionMobileButtons();
}
```

This requires importing `positionMobileButtons` from `hud.ts`.

**Step 3: Verify tuning panel shows section and sliders work**

Run: `npm run build`, open tuning panel, find Mobile Controls section.
Expected: Sliders adjust button positions in real-time.

**Step 4: Commit**

```bash
git add src/ui/tuning.ts
git commit -m "feat: mobile controls tuning panel section with live repositioning"
```

---

### Task 10: Integration testing and polish

**Files:**
- No new files — manual testing checklist

**Step 1: Test each button individually**

On a touch device or Chrome DevTools with touch emulation:

- [ ] Attack tap → projectile fires
- [ ] Attack hold → force push charges, reticle appears, release fires push
- [ ] Attack hold + drag → aim override works
- [ ] Dash tap → dash in move direction
- [ ] Dash drag → drag-to-aim dash
- [ ] Jump tap → player jumps
- [ ] Launch tap (grounded, enemy nearby) → enemy launched
- [ ] Launch tap (during float) → spike fires at nearest enemy
- [ ] Launch hold (during float) → dunk reticle, release slams
- [ ] Cancel tap (during float) → cancels aerial verb
- [ ] Cancel tap (during push charge) → cancels charge
- [ ] Cancel greyed out when nothing to cancel

**Step 2: Test cooldowns**

- [ ] Dash cooldown overlay animates
- [ ] Force push cooldown shows on Attack/Push button
- [ ] Launch cooldown shows on Launch button

**Step 3: Test tuning panel**

- [ ] Arc radius slider moves fan buttons in/out
- [ ] Arc start angle rotates the fan
- [ ] Arc spread widens/narrows button spacing
- [ ] Primary/fan/cancel size sliders resize buttons
- [ ] Edge margin adjusts corner offset

**Step 4: Test joystick zones don't conflict**

- [ ] Left joystick works without triggering buttons
- [ ] Right joystick works without triggering buttons
- [ ] Buttons don't trigger joystick creation

**Step 5: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: mobile controls integration polish from playtesting"
```

---

## Task Dependency Summary

```
Task 1 (config) ─────────────────────────┐
Task 2 (input triggers) ─────────────────┤
Task 3 (cancel wiring) ← depends on 2    │
Task 4 (HTML markup) ────────────────────┤── All feed into Task 7
Task 5 (CSS) ────────────────────────────┤
Task 6 (radial positioning) ← needs 1,4  │
Task 7 (button handlers) ← needs 2,6 ───┘
Task 8 (cooldowns) ← needs 7
Task 9 (tuning panel) ← needs 1,6
Task 10 (integration test) ← needs all
```

Tasks 1, 2, 4, 5 can be done in parallel. Task 6 needs 1+4. Task 7 needs 2+6. Tasks 8 and 9 can be parallel after 7. Task 10 is last.
