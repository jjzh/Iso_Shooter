import { screenToWorld } from './renderer';
import { getPlayerPos } from '../entities/player';
import { getActiveEnemy } from './aerialVerbs';

const keys: Record<string, boolean> = {};

const inputState = {
  moveX: 0,
  moveZ: 0,
  aimWorldPos: { x: 0, y: 0, z: 0 },
  mouseNDC: { x: 0, y: 0 },
  dash: false,
  attack: false,
  attackHeld: false,       // continuous: true while LMB is down
  ultimate: false,
  ultimateHeld: false,
  interact: false,
  bulletTime: false,
  bendMode: false,
  jump: false,
  launch: false,
  chargeStarted: false,
};

// Isometric basis vectors (from prototype)
// Camera faces along (-1, -1, -1)
// Screen-right → world (1, 0, -1) normalized
// Screen-up → world (-1, 0, -1) normalized
const INV_SQRT2 = 1 / Math.SQRT2;
const ISO_RIGHT_X = INV_SQRT2;
const ISO_RIGHT_Z = -INV_SQRT2;
const ISO_UP_X = -INV_SQRT2;
const ISO_UP_Z = -INV_SQRT2;

// Gamepad state
const DEADZONE = 0.15;
let gamepadIndex = -1;
let gamepadAimActive = false;   // true while right stick is deflected beyond deadzone
let prevGamepadButtons: Record<string, boolean> = {};    // for edge-triggered button detection

// Track input source — gamepad/touch aim overrides mouse aim when active
let usingGamepad = false;

// Touch joystick state (nipplejs)
let touchMoveX = 0, touchMoveY = 0;  // screen-space from left stick
let touchMoveActive = false;         // true only while left stick is held
let touchAimX = 0, touchAimY = 0;    // screen-space from right stick
let touchAimActive = false;
let touchActive = false;             // true when any touch joystick has been used

let _checkMouseHold: () => void = () => {};

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    usingGamepad = false;

    // Edge-triggered ability inputs
    if (e.code === 'Space') { inputState.jump = true; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') inputState.dash = true;
    if (e.code === 'KeyE') { inputState.launch = true; inputState.ultimate = true; }
    if (e.code === 'KeyF' || e.code === 'Enter') inputState.interact = true;
    if (e.code === 'KeyQ') { inputState.bulletTime = true; inputState.bendMode = true; }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  window.addEventListener('mousemove', (e) => {
    inputState.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    inputState.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    usingGamepad = false;
  });

  let mouseDownTime = 0;
  let mouseIsDown = false;
  const HOLD_THRESHOLD = 200; // ms — LMB hold longer than this triggers force push charge

  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // left click
      inputState.attack = true;
      inputState.attackHeld = true;
      mouseDownTime = performance.now();
      mouseIsDown = true;
      usingGamepad = false;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      mouseIsDown = false;
      inputState.attackHeld = false;
    }
  });

  // Check LMB hold each frame (called from updateInput)
  _checkMouseHold = () => {
    if (mouseIsDown && (performance.now() - mouseDownTime > HOLD_THRESHOLD)) {
      inputState.chargeStarted = true;
    }
  };

  // Gamepad connect/disconnect
  window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
    console.log(`[input] Gamepad connected: ${e.gamepad.id}`);
    gamepadIndex = e.gamepad.index;
  });
  window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
    console.log(`[input] Gamepad disconnected: ${e.gamepad.id}`);
    if (e.gamepad.index === gamepadIndex) gamepadIndex = -1;
  });

  // Touch joysticks (nipplejs) — only on touch-capable devices
  initTouchJoysticks();
}

function applyDeadzone(value: number) {
  if (Math.abs(value) < DEADZONE) return 0;
  // Remap from [deadzone..1] to [0..1] for smooth ramp
  const sign = value > 0 ? 1 : -1;
  return sign * (Math.abs(value) - DEADZONE) / (1 - DEADZONE);
}

function initTouchJoysticks() {
  // Only initialize if nipplejs is loaded and we have touch capability
  if (typeof nipplejs === 'undefined') return;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!hasTouch) return;

  const zoneLeft = document.getElementById('zone-left');
  const zoneRight = document.getElementById('zone-right');
  if (!zoneLeft || !zoneRight) return;

  // Ensure zones are visible on touch devices
  zoneLeft.style.display = 'block';
  zoneRight.style.display = 'block';

  console.log('[input] Touch joysticks initialized');

  // Left joystick — movement
  const leftJoystick = nipplejs.create({
    zone: zoneLeft,
    mode: 'dynamic',
    position: { left: '50%', top: '50%' },
    color: 'rgba(68, 204, 136, 0.35)',
    size: 120,
    restOpacity: 0.5,
  });

  leftJoystick.on('move', (evt: any, data: any) => {
    const force = Math.min(data.force, 1.5) / 1.5;
    const angle = data.angle.radian;
    touchMoveX = Math.cos(angle) * force;   // screen-right
    touchMoveY = Math.sin(angle) * force;   // screen-up
    touchMoveActive = true;
    touchActive = true;
  });
  leftJoystick.on('end', () => {
    touchMoveX = 0;
    touchMoveY = 0;
    touchMoveActive = false;
  });

  // Right joystick — aim + auto-fire
  const rightJoystick = nipplejs.create({
    zone: zoneRight,
    mode: 'dynamic',
    position: { left: '50%', top: '50%' },
    color: 'rgba(255, 102, 68, 0.35)',
    size: 120,
    restOpacity: 0.5,
  });

  rightJoystick.on('move', (evt: any, data: any) => {
    const force = Math.min(data.force, 1.5) / 1.5;
    const angle = data.angle.radian;
    touchAimX = Math.cos(angle) * force;
    touchAimY = Math.sin(angle) * force;
    touchAimActive = true;
    touchActive = true;
  });
  rightJoystick.on('end', () => {
    touchAimX = 0;
    touchAimY = 0;
    touchAimActive = false;
  });
}

function pollTouchJoysticks() {
  if (!touchActive) return;

  // --- Left stick: movement (only while stick is actively held) ---
  if (touchMoveActive && (Math.abs(touchMoveX) > 0.01 || Math.abs(touchMoveY) > 0.01)) {
    // Map screen-space joystick to isometric world-space (same as WASD/gamepad)
    // touchMoveX = screen right, touchMoveY = screen up
    const tMoveX = touchMoveX * ISO_RIGHT_X + touchMoveY * ISO_UP_X;
    const tMoveZ = touchMoveX * ISO_RIGHT_Z + touchMoveY * ISO_UP_Z;

    // Touch overrides keyboard if keyboard isn't active
    const kbActive = Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01;
    if (!kbActive) {
      inputState.moveX = tMoveX;
      inputState.moveZ = tMoveZ;
      const len = Math.sqrt(inputState.moveX * inputState.moveX + inputState.moveZ * inputState.moveZ);
      if (len > 1) {
        inputState.moveX /= len;
        inputState.moveZ /= len;
      }
    }
  }

  // --- Right stick: aim ---
  if (touchAimActive) {
    const aimDirX = touchAimX * ISO_RIGHT_X + touchAimY * ISO_UP_X;
    const aimDirZ = touchAimX * ISO_RIGHT_Z + touchAimY * ISO_UP_Z;

    const pp = getPlayerPos();
    const aimDist = 10;
    inputState.aimWorldPos.x = pp.x + aimDirX * aimDist;
    inputState.aimWorldPos.y = 0;
    inputState.aimWorldPos.z = pp.z + aimDirZ * aimDist;
  }
}

function pollGamepad() {
  if (gamepadIndex < 0) return;
  const gamepads = navigator.getGamepads();
  const gp = gamepads[gamepadIndex];
  if (!gp) return;

  usingGamepad = true;

  // --- Left stick: movement (axes 0, 1) ---
  const lx = applyDeadzone(gp.axes[0] || 0);
  const ly = applyDeadzone(gp.axes[1] || 0); // Y axis inverted (up = negative)

  // Map screen-space stick to isometric world-space (same as WASD)
  // lx = screen right, -ly = screen up (stick Y is inverted)
  const gpMoveX = lx * ISO_RIGHT_X + (-ly) * ISO_UP_X;
  const gpMoveZ = lx * ISO_RIGHT_Z + (-ly) * ISO_UP_Z;

  // Blend with keyboard: if keyboard has input, keyboard wins; otherwise gamepad
  const kbActive = Math.abs(inputState.moveX) > 0.01 || Math.abs(inputState.moveZ) > 0.01;
  if (!kbActive && (Math.abs(gpMoveX) > 0.01 || Math.abs(gpMoveZ) > 0.01)) {
    inputState.moveX = gpMoveX;
    inputState.moveZ = gpMoveZ;
    // Normalize if > 1
    const len = Math.sqrt(inputState.moveX * inputState.moveX + inputState.moveZ * inputState.moveZ);
    if (len > 1) {
      inputState.moveX /= len;
      inputState.moveZ /= len;
    }
  }

  // --- Right stick: aim (axes 2, 3) ---
  const rx = applyDeadzone(gp.axes[2] || 0);
  const ry = applyDeadzone(gp.axes[3] || 0);

  gamepadAimActive = (Math.abs(rx) > 0.01 || Math.abs(ry) > 0.01);

  if (gamepadAimActive) {
    // Convert stick direction to isometric world direction
    const aimDirX = rx * ISO_RIGHT_X + (-ry) * ISO_UP_X;
    const aimDirZ = rx * ISO_RIGHT_Z + (-ry) * ISO_UP_Z;

    // Place aim target at player + direction * distance
    const pp = getPlayerPos();
    const aimDist = 10; // arbitrary distance so atan2 calculation works
    inputState.aimWorldPos.x = pp.x + aimDirX * aimDist;
    inputState.aimWorldPos.y = 0;
    inputState.aimWorldPos.z = pp.z + aimDirZ * aimDist;
  }

  // --- Buttons (edge-triggered) ---
  // Standard gamepad mapping:
  // 0 = A (South), 1 = B (East), 2 = X (West), 3 = Y (North)
  // 4 = LB, 5 = RB, 6 = LT, 7 = RT
  const buttons = gp.buttons;

  // Dash: A button (0) or LB (4)
  const dashBtn = (buttons[0] && buttons[0].pressed) || (buttons[4] && buttons[4].pressed);
  if (dashBtn && !prevGamepadButtons.dash) inputState.dash = true;
  prevGamepadButtons.dash = !!dashBtn;

  // Ultimate: RB (5) or RT (7)
  const ultBtn = (buttons[5] && buttons[5].pressed) || (buttons[7] && buttons[7].pressed);
  if (ultBtn && !prevGamepadButtons.ult) inputState.ultimate = true;
  prevGamepadButtons.ult = !!ultBtn;

  // Interact: Y button (3) — door interaction
  const interactBtn = buttons[3] && buttons[3].pressed;
  if (interactBtn && !prevGamepadButtons.interact) inputState.interact = true;
  prevGamepadButtons.interact = !!interactBtn;

  // Bullet Time: LT (6)
  const btBtn = buttons[6] && buttons[6].pressed;
  if (btBtn && !prevGamepadButtons.bulletTime) inputState.bulletTime = true;
  prevGamepadButtons.bulletTime = !!btBtn;

  // Ultimate held (for charge release detection)
  if (ultBtn) inputState.ultimateHeld = true;
}

export function updateInput() {
  // WASD → raw screen-space directions
  let rawX = 0, rawY = 0;
  if (keys['KeyD'] || keys['ArrowRight']) rawX += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  rawX -= 1;
  if (keys['KeyW'] || keys['ArrowUp'])    rawY += 1;
  if (keys['KeyS'] || keys['ArrowDown'])  rawY -= 1;

  // Map screen-space to isometric world-space
  inputState.moveX = rawX * ISO_RIGHT_X + rawY * ISO_UP_X;
  inputState.moveZ = rawX * ISO_RIGHT_Z + rawY * ISO_UP_Z;

  // Normalize diagonal movement
  const len = Math.sqrt(inputState.moveX * inputState.moveX + inputState.moveZ * inputState.moveZ);
  if (len > 1) {
    inputState.moveX /= len;
    inputState.moveZ /= len;
  }

  // Check LMB hold for force push charge
  _checkMouseHold();

  // Continuous held state for charge abilities
  // Merge keyboard + touch button hold + LMB hold (gamepad sets it in pollGamepad)
  inputState.ultimateHeld = !!keys['KeyE'] || _touchUltHeld || inputState.chargeStarted;

  // Mouse → world position on y=0 plane (only if not overridden by gamepad/touch/ability drag)
  if ((!usingGamepad || !gamepadAimActive) && !touchAimActive && !_abilityAimActive) {
    const worldPos = screenToWorld(inputState.mouseNDC.x, inputState.mouseNDC.y);
    inputState.aimWorldPos.x = worldPos.x;
    inputState.aimWorldPos.y = worldPos.y;
    inputState.aimWorldPos.z = worldPos.z;
  }

  // Poll gamepad (blends with keyboard/mouse above)
  pollGamepad();

  // Poll touch joysticks (blends with keyboard/mouse/gamepad above)
  pollTouchJoysticks();
}

export function consumeInput() {
  inputState.dash = false;
  inputState.attack = false;
  inputState.ultimate = false;
  inputState.interact = false;
  inputState.bulletTime = false;
  inputState.bendMode = false;
  inputState.jump = false;
  inputState.launch = false;
  inputState.chargeStarted = false;
}

export function getInputState() { return inputState; }

// Expose for touch-screen ability buttons
let _touchUltHeld = false;
export function triggerDash() { inputState.dash = true; }
export function triggerUltimate() { inputState.ultimate = true; }
export function setUltimateHeld(held: boolean) { _touchUltHeld = held; }
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

// Drag-to-aim: set aim world position from screen-space drag direction
let _abilityAimActive = false; // true while a mobile button drag is overriding aim
export function setAimFromScreenDrag(screenX: number, screenY: number) {
  _abilityAimActive = true;
  const aimDirX = screenX * ISO_RIGHT_X + screenY * ISO_UP_X;
  const aimDirZ = screenX * ISO_RIGHT_Z + screenY * ISO_UP_Z;

  const pp = getPlayerPos();
  const aimDist = 10;
  inputState.aimWorldPos.x = pp.x + aimDirX * aimDist;
  inputState.aimWorldPos.y = 0;
  inputState.aimWorldPos.z = pp.z + aimDirZ * aimDist;
}

// Override movement direction for dash drag-to-aim
let _abilityDirOverride: { x: number; z: number } | null = null;
export function setAbilityDirOverride(x: number, z: number) { _abilityDirOverride = { x, z }; }
export function clearAbilityDirOverride() { _abilityDirOverride = null; _abilityAimActive = false; }
export function getAbilityDirOverride() { return _abilityDirOverride; }

/**
 * Mobile auto-aim: if on a touch device and the right joystick / ability drag
 * is NOT active, aim at the closest enemy automatically.
 * Called from game loop after updateInput(), before updatePlayer().
 */
export function autoAimClosestEnemy(enemies: any[]) {
  // Only on touch devices, and only when no manual aim is active
  if (!touchActive) return;
  if (touchAimActive || _abilityAimActive) return;

  if (!enemies || enemies.length === 0) return;

  const pp = getPlayerPos();
  const grabbed = getActiveEnemy();
  let closest: any = null;
  let closestDist = Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.fellInPit || e.health <= 0) continue;
    // Skip the currently grabbed enemy — it's right next to the player
    // and would cause spike to aim at itself instead of a ground target
    if (e === grabbed) continue;
    const dx = e.pos.x - pp.x;
    const dz = e.pos.z - pp.z;
    const dist = dx * dx + dz * dz; // squared distance is fine for comparison
    if (dist < closestDist) {
      closestDist = dist;
      closest = e;
    }
  }

  if (closest) {
    inputState.aimWorldPos.x = closest.pos.x;
    inputState.aimWorldPos.y = 0;
    inputState.aimWorldPos.z = closest.pos.z;
  }
}
