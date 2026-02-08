// Mortar projectile system — lobbed arc projectiles with AoE impact
// Each projectile travels along a parabolic arc, then explodes on landing.

import { applyAoeEffect } from '../engine/aoeTelegraph.js';
import { getPlayerPos, isPlayerInvincible } from './player.js';
import { slowEnemy } from './enemy.js';
import { screenShake } from '../engine/renderer.js';
import { spawnDamageNumber } from '../ui/damageNumbers.js';

const THREE = window.THREE;

let sceneRef;

// Active mortar projectiles in flight
const activeMortars = [];

// Shared geometry (created once)
let shellGeo;

export function initMortarSystem(scene) {
  sceneRef = scene;
}

/**
 * Fire a mortar projectile along a parabolic arc.
 *
 * @param {Object} opts
 * @param {number} opts.startX - Launch X position
 * @param {number} opts.startZ - Launch Z position
 * @param {number} opts.targetX - Landing X position
 * @param {number} opts.targetZ - Landing Z position
 * @param {number} opts.arcHeight - Peak height of arc (units)
 * @param {number} opts.speed - Travel speed along arc (u/s)
 * @param {number} opts.color - Projectile/explosion color (hex)
 * @param {number} opts.blastRadius - AoE damage radius on impact
 * @param {number} opts.damage - Damage dealt on impact
 * @param {number} opts.slowDuration - Slow duration applied to targets
 * @param {number} opts.slowMult - Slow multiplier applied to targets
 * @param {number} opts.explosionDuration - How long the explosion ring lasts
 * @param {Object} opts.gameState - Game state for enemy iteration
 * @param {Object} opts.sourceEnemy - The enemy that fired (excluded from self-damage)
 * @param {Object} [opts.groundCircle] - Persistent ground circle mesh (handed off from aim phase)
 */
export function fireMortarProjectile(opts) {
  if (!shellGeo) {
    shellGeo = new THREE.SphereGeometry(0.15, 6, 4);
  }

  const mat = new THREE.MeshStandardMaterial({
    color: opts.color,
    emissive: opts.color,
    emissiveIntensity: 0.8,
  });

  const mesh = new THREE.Mesh(shellGeo, mat);
  mesh.position.set(opts.startX, 0.8, opts.startZ);
  sceneRef.add(mesh);

  // Create a glowing trail line behind the projectile
  const trailPositions = new Float32Array(30 * 3); // 30-point trail
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: opts.color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const trail = new THREE.Line(trailGeo, trailMat);
  sceneRef.add(trail);

  // Calculate arc distance and total flight time
  const dx = opts.targetX - opts.startX;
  const dz = opts.targetZ - opts.startZ;
  const groundDist = Math.sqrt(dx * dx + dz * dz);

  // Approximate arc length (parabolic arc is longer than ground distance)
  // Using a simple approximation: arcLen ≈ groundDist + 2*arcHeight²/groundDist
  const arcLen = groundDist > 0.1
    ? groundDist + 2 * opts.arcHeight * opts.arcHeight / groundDist
    : opts.arcHeight * 2;
  const flightTime = arcLen / opts.speed;

  const mortar = {
    mesh,
    trail,
    trailGeo,
    trailMat,
    mat,
    startX: opts.startX,
    startZ: opts.startZ,
    targetX: opts.targetX,
    targetZ: opts.targetZ,
    arcHeight: opts.arcHeight,
    flightTime,
    elapsed: 0,
    color: opts.color,
    blastRadius: opts.blastRadius,
    damage: opts.damage,
    slowDuration: opts.slowDuration,
    slowMult: opts.slowMult,
    explosionDuration: opts.explosionDuration,
    gameState: opts.gameState,
    sourceEnemy: opts.sourceEnemy,
    trailHistory: [], // past positions for trail
    groundCircle: opts.groundCircle || null, // persistent ground circle from aim phase
  };

  activeMortars.push(mortar);
  return mortar;
}

/**
 * Update all in-flight mortar projectiles.
 * Call this every frame from the game loop.
 */
export function updateMortarProjectiles(dt) {
  for (let i = activeMortars.length - 1; i >= 0; i--) {
    const m = activeMortars[i];
    m.elapsed += dt;
    const t = Math.min(m.elapsed / m.flightTime, 1);

    // Interpolate position along parabolic arc
    const x = m.startX + (m.targetX - m.startX) * t;
    const z = m.startZ + (m.targetZ - m.startZ) * t;
    const y = 0.8 + 4 * m.arcHeight * t * (1 - t); // parabolic arc

    m.mesh.position.set(x, y, z);

    // Pulse glow
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.01);
    m.mat.emissiveIntensity = pulse;

    // Update trail
    m.trailHistory.push({ x, y, z });
    if (m.trailHistory.length > 30) m.trailHistory.shift();

    const positions = m.trailGeo.attributes.position.array;
    for (let j = 0; j < 30; j++) {
      const idx = j < m.trailHistory.length ? j : m.trailHistory.length - 1;
      const p = m.trailHistory[idx];
      positions[j * 3] = p.x;
      positions[j * 3 + 1] = p.y;
      positions[j * 3 + 2] = p.z;
    }
    m.trailGeo.attributes.position.needsUpdate = true;
    m.trailGeo.setDrawRange(0, m.trailHistory.length);

    // Trail fades as projectile progresses
    m.trailMat.opacity = 0.5 * (1 - t * 0.5);

    // Update ground circle opacity — ramps from 0.3 → 0.9 as projectile approaches
    if (m.groundCircle) {
      const gc = m.groundCircle;
      // Ring: 0.3 at launch → 0.9 at impact (never below 0.3)
      const ringOpacity = 0.3 + 0.6 * t;
      // Fill: 0.08 at launch → 0.35 at impact
      const fillOpacity = 0.08 + 0.27 * t;
      // Pulse border for urgency
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() * (0.006 + 0.012 * t));
      gc.ringMat.opacity = ringOpacity * pulse;
      gc.fillMat.opacity = fillOpacity;
    }

    // Impact — projectile has landed
    if (t >= 1) {
      onMortarImpact(m);
      removeMortar(m);
      activeMortars.splice(i, 1);
    }
  }
}

/**
 * Handle mortar impact — AoE damage + slow + visual.
 */
function onMortarImpact(m) {
  const tx = m.targetX;
  const tz = m.targetZ;

  // Screen shake on impact
  screenShake(3, 150);

  // AoE effect — damages and slows all enemies in blast radius
  applyAoeEffect({
    x: tx,
    z: tz,
    radius: m.blastRadius,
    durationMs: m.explosionDuration,
    color: m.color,
    label: 'SLOWED',
    effectFn: (e) => {
      e.health -= m.damage;
      slowEnemy(e, m.slowDuration, m.slowMult);
    },
    gameState: m.gameState,
    excludeEnemy: m.sourceEnemy,
  });

  // Check player damage
  const pp = getPlayerPos();
  const pdx = pp.x - tx;
  const pdz = pp.z - tz;
  const playerDist = Math.sqrt(pdx * pdx + pdz * pdz);
  if (playerDist < m.blastRadius && !isPlayerInvincible()) {
    m.gameState.playerHealth -= m.damage;
    screenShake(4, 200);
    spawnDamageNumber(pp.x, pp.z, m.damage, '#ff4466');
    if (m.gameState.playerHealth <= 0) {
      m.gameState.playerHealth = 0;
      m.gameState.phase = 'gameOver';
    }
  }
}

/**
 * Clean up a mortar projectile's visual resources.
 */
function removeMortar(m) {
  m.mat.dispose();
  sceneRef.remove(m.mesh);
  m.trailGeo.dispose();
  m.trailMat.dispose();
  sceneRef.remove(m.trail);
  // Clean up ground circle (geometry is shared — don't dispose)
  if (m.groundCircle) {
    const gc = m.groundCircle;
    gc.ringMat.dispose();
    gc.fillMat.dispose();
    sceneRef.remove(gc.group);
    m.groundCircle = null;
  }
}

/**
 * Clear all in-flight mortar projectiles (on restart/cleanup).
 */
export function clearMortarProjectiles() {
  for (const m of activeMortars) {
    removeMortar(m);
  }
  activeMortars.length = 0;
}
