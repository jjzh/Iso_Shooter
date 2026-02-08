// Generic AoE telegraph system — expanding rings, rectangles, and cascading per-target effects.
// Not tied to any specific mechanic — works for stun, damage, slow, etc.

import { spawnDamageNumber } from '../ui/damageNumbers.js';

const THREE = window.THREE;

let sceneRef;

// Active telegraph shapes (rings + rects)
const activeTelegraphs = [];

// Pending per-target effects (delayed callbacks)
const pendingEffects = [];

// Shared geometries (created once)
let ringGeo;
let planeGeo;

// --- Easing ---

function easeOutQuad(t) {
  return t * (2 - t);
}

// --- Init ---

export function initAoeTelegraph(scene) {
  sceneRef = scene;
}

// --- Ring Shape ---

export function createAoeRing(x, z, maxRadius, durationMs, color) {
  if (!ringGeo) {
    ringGeo = new THREE.RingGeometry(0.8, 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2); // lay flat on ground
  }

  const mat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.05, z); // slightly above ground
  mesh.scale.set(0.01, 0.01, 0.01); // start tiny
  sceneRef.add(mesh);

  const telegraph = {
    type: 'ring',
    mesh: mesh,
    material: mat,
    center: { x, z },
    maxRadius: maxRadius,
    duration: durationMs,
    elapsed: 0,
    color: color,
  };

  activeTelegraphs.push(telegraph);
  return telegraph;
}

// --- Rectangle Shape ---

export function createAoeRect(x, z, width, height, rotation, durationMs, color) {
  if (!planeGeo) {
    planeGeo = new THREE.PlaneGeometry(1, 1);
    planeGeo.rotateX(-Math.PI / 2); // lay flat on ground
  }

  const group = new THREE.Group();
  group.position.set(x, 0.05, z);
  group.rotation.y = rotation;

  // Fill plane
  const fillMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.0, // ramps up over first 30%
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fillMesh = new THREE.Mesh(planeGeo, fillMat);
  fillMesh.scale.set(width * 0.8, 1, height * 0.8); // start at 80%
  group.add(fillMesh);

  // Border outline
  const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height));
  edgeGeo.rotateX(-Math.PI / 2);
  const borderMat = new THREE.LineBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const borderMesh = new THREE.LineSegments(edgeGeo, borderMat);
  group.add(borderMesh);

  sceneRef.add(group);

  const telegraph = {
    type: 'rect',
    mesh: group,
    fillMesh: fillMesh,
    fillMaterial: fillMat,
    borderMesh: borderMesh,
    borderMaterial: borderMat,
    borderEdgeGeo: edgeGeo,
    center: { x, z },
    width: width,
    height: height,
    rotation: rotation,
    duration: durationMs,
    elapsed: 0,
    color: color,
  };

  activeTelegraphs.push(telegraph);
  return telegraph;
}

// --- Hit Testing ---

/**
 * Check if a point is inside a rotated rectangle.
 * @param {number} ex - Entity X position
 * @param {number} ez - Entity Z position
 * @param {number} cx - Rectangle center X
 * @param {number} cz - Rectangle center Z
 * @param {number} w - Rectangle width
 * @param {number} h - Rectangle height (length)
 * @param {number} rotation - Y-axis rotation in radians
 * @param {number} [padding=0] - Extra padding to add to each side (e.g., entity radius)
 */
export function isInRotatedRect(ex, ez, cx, cz, w, h, rotation, padding) {
  const pad = padding || 0;
  const dx = ex - cx;
  const dz = ez - cz;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) < (w / 2 + pad) && Math.abs(localZ) < (h / 2 + pad);
}

// --- Update Telegraphs ---

export function updateAoeTelegraphs(dt) {
  const dtMs = dt * 1000;

  for (let i = activeTelegraphs.length - 1; i >= 0; i--) {
    const t = activeTelegraphs[i];
    t.elapsed += dtMs;
    const progress = Math.min(t.elapsed / t.duration, 1);

    if (t.type === 'ring') {
      updateRing(t, progress);
    } else if (t.type === 'rect') {
      updateRect(t, progress);
    }

    // Remove when complete
    if (progress >= 1) {
      removeTelegraph(t);
      activeTelegraphs.splice(i, 1);
    }
  }
}

function updateRing(t, progress) {
  const easedProgress = easeOutQuad(progress);

  // Scale — expand from 0 to maxRadius
  const currentRadius = t.maxRadius * easedProgress;
  t.mesh.scale.set(currentRadius, currentRadius, currentRadius);

  // Thickness shrinks (simulated via Y scale stretching the ring thinner feel)
  // The ring geometry is 0.8→1.0 inner/outer, so at scale 1 it's 0.2 thick.
  // We modulate opacity instead for the thinning effect.

  // Opacity fades out
  t.material.opacity = 0.8 * (1 - progress);
}

function updateRect(t, progress) {
  const easedProgress = easeOutQuad(progress);

  // Fill: opacity ramps 0 → 0.3 over first 30%, then fades
  let fillOpacity;
  if (progress < 0.3) {
    fillOpacity = 0.3 * (progress / 0.3);
  } else {
    fillOpacity = 0.3 * (1 - (progress - 0.3) / 0.7);
  }
  t.fillMaterial.opacity = Math.max(0, fillOpacity);

  // Fill scale: 80% → 100%
  const scaleMult = 0.8 + 0.2 * easedProgress;
  t.fillMesh.scale.set(t.width * scaleMult, 1, t.height * scaleMult);

  // Border: pulse frequency accelerates 2Hz → 8Hz
  const freq = 2 + 6 * progress;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * freq * 0.00628); // 2π/1000
  t.borderMaterial.opacity = 0.4 + 0.5 * pulse;

  // Brightness ramp in last 100ms — telegraph flashes bright before firing
  const flashThreshold = 1 - (100 / t.duration); // last 100ms as fraction of total
  if (progress > flashThreshold) {
    const flashProgress = (progress - flashThreshold) / (1 - flashThreshold); // 0→1
    // Ramp fill to full bright
    t.fillMaterial.opacity = 0.3 + 0.5 * flashProgress;
    // Solid bright border
    t.borderMaterial.opacity = 0.8 + 0.2 * flashProgress;
    // Brighten fill color toward white
    const r = ((t.color >> 16) & 0xff) / 255;
    const g = ((t.color >> 8) & 0xff) / 255;
    const b = (t.color & 0xff) / 255;
    t.fillMaterial.color.setRGB(
      r + (1 - r) * flashProgress * 0.6,
      g + (1 - g) * flashProgress * 0.6,
      b + (1 - b) * flashProgress * 0.6
    );
    t.borderMaterial.color.setRGB(
      r + (1 - r) * flashProgress * 0.6,
      g + (1 - g) * flashProgress * 0.6,
      b + (1 - b) * flashProgress * 0.6
    );
  } else if (progress > 0.8) {
    // Border fades in last 20% (but before the flash window)
    const fadeProgress = (progress - 0.8) / (flashThreshold - 0.8);
    t.borderMaterial.opacity *= (1 - fadeProgress * 0.5);
    t.fillMaterial.opacity *= (1 - fadeProgress * 0.5);
  }
}

function removeTelegraph(t) {
  if (t.type === 'ring') {
    t.material.dispose();
    sceneRef.remove(t.mesh);
  } else if (t.type === 'rect') {
    t.fillMaterial.dispose();
    t.borderMaterial.dispose();
    t.borderEdgeGeo.dispose();
    sceneRef.remove(t.mesh);
  }
}

// --- Pending Effects ---

export function schedulePendingEffect(enemy, delayMs, callback) {
  pendingEffects.push({ enemy, delay: delayMs, callback });
}

// Generic delayed callback (not tied to an enemy)
export function scheduleCallback(delayMs, callback) {
  pendingEffects.push({ enemy: null, delay: delayMs, callback });
}

export function updatePendingEffects(dt) {
  const dtMs = dt * 1000;

  for (let i = pendingEffects.length - 1; i >= 0; i--) {
    const p = pendingEffects[i];
    p.delay -= dtMs;
    if (p.delay <= 0) {
      if (p.enemy) {
        p.callback(p.enemy);
      } else {
        p.callback();
      }
      pendingEffects.splice(i, 1);
    }
  }
}

// --- Generic AoE Applicator ---

/**
 * Trigger an AoE effect with visual telegraph and cascading per-target application.
 *
 * @param {Object} opts
 * @param {number} opts.x - Center X position
 * @param {number} opts.z - Center Z position
 * @param {number} opts.radius - Effect radius
 * @param {number} opts.durationMs - Ring expansion time (ms)
 * @param {number} opts.color - Color as hex number (e.g., 0x88eeff)
 * @param {string} [opts.label] - Text shown on affected enemies (e.g., 'STUNNED')
 * @param {Function} opts.effectFn - Callback(enemy) — the actual game effect to apply
 * @param {Object} opts.gameState - Game state containing enemies array
 * @param {Object} [opts.excludeEnemy] - Enemy to skip (e.g., the source)
 */
export function applyAoeEffect({ x, z, radius, durationMs, color, label, effectFn, gameState, excludeEnemy }) {
  // 1. Create expanding ring visual
  createAoeRing(x, z, radius, durationMs, color);

  // 2. Schedule cascade effects on each enemy in range
  const colorStr = '#' + color.toString(16).padStart(6, '0');

  for (const enemy of gameState.enemies) {
    if (enemy === excludeEnemy) continue;

    const dx = enemy.pos.x - x;
    const dz = enemy.pos.z - z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < radius) {
      // Delay proportional to distance — closest react first
      const delayMs = (dist / radius) * durationMs;

      schedulePendingEffect(enemy, delayMs, (e) => {
        // Apply the actual game effect
        effectFn(e);

        // Visual feedback — flash enemy to effect color
        e.flashTimer = 200;
        e.bodyMesh.material.emissive.setHex(color);
        if (e.headMesh) e.headMesh.material.emissive.setHex(color);

        // Floating text label
        if (label) {
          spawnDamageNumber(e.pos.x, e.pos.z, label, colorStr);
        }
      });
    }
  }
}

// --- Rectangle AoE Applicator ---

/**
 * Trigger a rectangle AoE — shows a telegraph, then fires a damage corridor.
 * Hits both enemies AND the player (friendly fire / environmental hazard).
 *
 * Two-phase lifecycle:
 *   1. Telegraph phase (telegraphDurationMs): pulsing rect on ground warns player
 *   2. Fire phase (instant): everything in the rect takes damage, short linger visual
 *
 * @param {Object} opts
 * @param {number} opts.x - Center X of rectangle
 * @param {number} opts.z - Center Z of rectangle
 * @param {number} opts.width - Width of damage corridor (perpendicular to aim)
 * @param {number} opts.height - Length of damage corridor (along aim)
 * @param {number} opts.rotation - Y-axis rotation in radians
 * @param {number} opts.telegraphDurationMs - How long the warning shows
 * @param {number} opts.lingerDurationMs - How long the fired shot rect lingers
 * @param {number} opts.color - Color as hex number
 * @param {number} opts.damage - Damage dealt to targets in the rect
 * @param {Function} [opts.playerDamageFn] - Callback() for damaging the player (if in rect)
 * @param {Function} [opts.enemyDamageFn] - Callback(enemy) for damaging enemies (if in rect)
 * @param {Object} opts.gameState - Game state
 * @param {Object} [opts.excludeEnemy] - Enemy to skip (e.g., the shooter)
 */
export function applyAoeRectEffect({
  x, z, width, height, rotation,
  telegraphDurationMs, lingerDurationMs,
  color, damage,
  playerDamageFn, enemyDamageFn,
  gameState, excludeEnemy
}) {
  // 1. Show telegraph rect (warning phase)
  createAoeRect(x, z, width, height, rotation, telegraphDurationMs, color);

  // 2. Schedule the actual damage at the end of the telegraph
  const colorStr = '#' + color.toString(16).padStart(6, '0');

  scheduleCallback(telegraphDurationMs, () => {
    // Show a bright "fired" rect that lingers briefly
    createAoeRect(x, z, width, height, rotation, lingerDurationMs, color);

    // Check all enemies in the rect (pad by enemy collision radius for generous hit detection)
    for (const enemy of gameState.enemies) {
      if (enemy === excludeEnemy) continue;
      const enemyRadius = (enemy.config && enemy.config.size) ? enemy.config.size.radius : 0;
      if (isInRotatedRect(enemy.pos.x, enemy.pos.z, x, z, width, height, rotation, enemyRadius)) {
        if (enemyDamageFn) {
          enemyDamageFn(enemy);
        }
        // Visual feedback
        enemy.flashTimer = 200;
        enemy.bodyMesh.material.emissive.setHex(color);
        if (enemy.headMesh) enemy.headMesh.material.emissive.setHex(color);
        spawnDamageNumber(enemy.pos.x, enemy.pos.z, damage, colorStr);
      }
    }

    // Check player
    if (playerDamageFn) {
      playerDamageFn(x, z, width, height, rotation);
    }
  });
}

// --- Cleanup ---

export function clearAoeTelegraphs() {
  // Remove all active telegraph shapes
  for (const t of activeTelegraphs) {
    removeTelegraph(t);
  }
  activeTelegraphs.length = 0;

  // Clear pending effects
  pendingEffects.length = 0;
}
