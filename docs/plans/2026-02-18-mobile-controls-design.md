# Mobile Controls Design — Vertical Branch

> Radial fan layout with context-sensitive buttons for vertical combat on mobile.

**Date:** 2026-02-18
**Branch:** `explore/vertical`
**Reference:** Wild Rift bottom-right ability cluster

---

## Layout

Radial fan anchored to bottom-right corner. Primary button at thumb-rest, fan buttons arc counter-clockwise.

```
              [X]                  ← Cancel (small, ~45px)

         [Launch]                  ← Upper arc (~60px)

      [Jump]                       ← Middle arc (~60px)

  [Dash]      [ATK / PUSH]        ← ATK is primary (~85px)
                                     Dash is arc-left (~60px)
```

### Sizing Defaults (all tunable)

| Button | Default Size | Role |
|--------|-------------|------|
| Attack/Push | ~85px | Primary, thumb-rest position |
| Dash | ~60px | Fan, lower-left arc |
| Jump | ~60px | Fan, middle arc |
| Launch | ~60px | Fan, upper arc |
| Cancel | ~45px | Utility, top-right of cluster |

### Positioning

- Attack/Push sits at bottom-right, offset from screen edge by ~20px
- Fan buttons positioned along an arc (radius ~100px) counter-clockwise from Dash → Jump → Launch
- Arc radius, start angle, and spread are all tunable
- Cancel sits top-right of the cluster, separated from the fan

---

## Button Behaviors

### Attack/Push (primary)

- **Tap** → basic attack (fires projectile toward aim direction)
- **Hold** (>180ms) → force push charge (drag-to-aim reticle, release to fire)
- Shows cooldown overlay for force push

### Dash

- **Tap** → dash in movement direction (or facing direction if stationary)
- **Drag** → drag-to-aim dash (choose direction, release to dash)
- Shows cooldown overlay

### Jump

- **Tap** → jump
- No drag behavior — movement joystick controls air direction

### Launch (context-sensitive during float)

- **Grounded, tap** → launch nearest enemy upward, player hops to follow
- **During float, tap** → spike — auto-aimed at nearest enemy, or player facing direction if none nearby
- **During float, hold** → dunk — reticle appears, drag to aim landing spot, release to slam
- Shows cooldown overlay for launch cooldown

### Cancel

- **Tap** → cancels current action (aerial float, force push charge, etc.)
- Always visible, greyed out when nothing to cancel

---

## Input System Integration

### Existing infrastructure reused

The `inputState` already has all needed flags: `attack`, `attackHeld`, `dash`, `jump`, `launch`, `ultimate`, `ultimateHeld`. New buttons set these through exported trigger functions.

### Button → Input Mapping

**Attack/Push:**
- Tap → `triggerAttack()` (new export, sets `inputState.attack = true`)
- Hold start → `triggerUltimate()` + `setUltimateHeld(true)`
- Hold drag → `setAimFromScreenDrag()` + `setAbilityDirOverride()`
- Release → `setUltimateHeld(false)` + `clearAbilityDirOverride()`

**Dash:**
- Same as existing mobile dash button behavior (drag-to-aim)

**Jump:**
- Tap → `triggerJump()` (new export, sets `inputState.jump = true`)

**Launch (grounded):**
- Tap → `triggerLaunch()` (new export, sets `inputState.launch = true`)

**Launch (during float) — key insight:**
- Tap → `triggerAttack()` — spike resolves via existing float selector tap-detection on `attack`
- Hold → `setAttackHeld(true)` + drag-to-aim — dunk resolves via existing float selector hold-detection on `attackHeld`
- The float selector already distinguishes tap vs hold. The Launch button just needs to set the same `attack`/`attackHeld` flags when in float state.

**Cancel:**
- New `triggerCancel()` — consumed by aerial verb framework (cancels active verb) and force push (releases charge)

### Auto-aim for spike

- Existing `autoAimClosestEnemy()` already runs on touch
- Spike carrier already has homing behavior
- Ensure aim direction is set to nearest enemy (or player facing dir) before spike triggers

---

## Tuning Panel

New "Mobile Controls" section:

```
Mobile Controls
├── Layout
│   ├── Primary button size      (60-120px, default 85)
│   ├── Fan button size          (40-90px, default 60)
│   ├── Cancel button size       (30-70px, default 45)
│   ├── Arc radius               (60-160px, default 100)
│   ├── Arc start angle          (180-270°, default 210°)
│   ├── Arc spread               (60-150°, default 90°)
│   └── Edge margin              (10-40px, default 20)
├── Behavior
│   ├── Attack/Push hold threshold (100-400ms, default 180)
│   └── Drag threshold            (8-30px, default 15)
```

All values in a `MOBILE_CONTROLS` config object. Tuning panel mutates directly (same pattern as `AUDIO_CONFIG`). Buttons reposition in real-time on slider change.

---

## What Changes vs. Current Mobile Controls

| Current | New |
|---------|-----|
| 2 buttons (Dash, Push) stacked vertically | 5 buttons (Atk/Push, Dash, Jump, Launch, Cancel) in radial fan |
| Push is a standalone button | Push merged into Attack (tap=attack, hold=push) |
| No jump on mobile | Jump button added |
| No launch on mobile | Launch button added, context-sensitive during float |
| No cancel on mobile | Cancel button added |
| Right joystick zone covers bottom-right 50% | Right joystick zone needs to shrink/adjust to avoid button conflicts |

### Right Joystick Zone Adjustment

The right joystick zone currently occupies the bottom-right 50% of the screen. With the new button cluster in that corner, the joystick zone needs to be reduced or repositioned to avoid conflicting with button touches. Options: shrink the zone, add dead zones around buttons, or move the zone higher.
