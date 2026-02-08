import { screenToWorld } from './renderer.js';

const keys = {};

const inputState = {
  moveX: 0,
  moveZ: 0,
  aimWorldPos: { x: 0, y: 0, z: 0 },
  mouseNDC: { x: 0, y: 0 },
  dash: false,
  ultimate: false,
  ultimateHeld: false,
  toggleEditor: false,
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

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;

    // Edge-triggered ability inputs
    if (e.code === 'Space') { inputState.dash = true; e.preventDefault(); }
    if (e.code === 'KeyE') inputState.ultimate = true;
    if (e.code === 'Backquote') inputState.toggleEditor = true;
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  window.addEventListener('mousemove', (e) => {
    inputState.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    inputState.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
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

  // Continuous held state for charge abilities
  inputState.ultimateHeld = !!keys['KeyE'];

  // Mouse → world position on y=0 plane
  const worldPos = screenToWorld(inputState.mouseNDC.x, inputState.mouseNDC.y);
  inputState.aimWorldPos.x = worldPos.x;
  inputState.aimWorldPos.y = worldPos.y;
  inputState.aimWorldPos.z = worldPos.z;
}

export function consumeInput() {
  inputState.dash = false;
  inputState.ultimate = false;
  inputState.toggleEditor = false;
}

export function getInputState() { return inputState; }
