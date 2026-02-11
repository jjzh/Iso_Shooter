// Canvas 2D damage number system — no DOM thrash, scales to hundreds of numbers
import { getCamera } from '../engine/renderer';

let canvas: any, ctx: any;
const POOL_SIZE = 40;
const LIFETIME = 600; // ms
const FLOAT_DISTANCE = 40; // px upward travel

// Pre-allocated pool of damage number slots
const pool: any[] = [];
for (let i = 0; i < POOL_SIZE; i++) {
  pool.push({ active: false, x: 0, y: 0, value: 0, life: 0, color: '#ffffff' });
}

// Reusable vector for world→screen projection
const _projVec = new THREE.Vector3();

export function initDamageNumbers() {
  canvas = document.createElement('canvas');
  canvas.id = 'damage-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:15;';
  document.body.appendChild(canvas);
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

export function spawnDamageNumber(worldX: number, worldZ: number, value: any, color?: string) {
  if (!color) color = '#ffffff';

  // Find inactive slot
  let slot: any = null;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (!pool[i].active) {
      slot = pool[i];
      break;
    }
  }
  // If pool full, recycle oldest
  if (!slot) {
    let oldest = pool[0];
    for (let i = 1; i < POOL_SIZE; i++) {
      if (pool[i].life > oldest.life) oldest = pool[i];
    }
    slot = oldest;
  }

  // Project world position to screen
  const camera = getCamera();
  _projVec.set(worldX, 1.5, worldZ); // slightly above ground
  _projVec.project(camera);

  slot.active = true;
  slot.x = (_projVec.x * 0.5 + 0.5) * canvas.width;
  slot.y = (-_projVec.y * 0.5 + 0.5) * canvas.height;
  slot.value = typeof value === 'string' ? value : Math.round(value);
  slot.life = 0;
  slot.color = color;

  // Add slight random horizontal offset to prevent stacking
  slot.x += (Math.random() - 0.5) * 20;
}

export function updateDamageNumbers(dt: number) {
  if (!ctx) ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const dtMs = dt * 1000;

  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = pool[i];
    if (!slot.active) continue;

    slot.life += dtMs;
    if (slot.life >= LIFETIME) {
      slot.active = false;
      continue;
    }

    const t = slot.life / LIFETIME;
    const alpha = 1 - t * t; // fade out with ease
    const yOffset = -FLOAT_DISTANCE * t; // float upward
    const scale = 1 + t * 0.3; // slight grow

    const x = slot.x;
    const y = slot.y + yOffset;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(16 * scale)}px 'SF Mono', 'Consolas', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow for readability
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = slot.color;
    ctx.fillText(slot.value, x, y);
    ctx.restore();
  }
}

export function clearDamageNumbers() {
  for (let i = 0; i < POOL_SIZE; i++) {
    pool[i].active = false;
  }
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
