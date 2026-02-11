// Mortar projectile system — lobbed arc projectiles with AoE impact
// Each projectile travels along a parabolic arc, then explodes on landing.
// Ice Mortar Imps leave behind ice patches that affect movement and knockback.

import { applyAoeEffect } from '../engine/aoeTelegraph';
import { getPlayerPos, isPlayerInvincible } from './player';
import { slowEnemy } from './enemy';
import { screenShake } from '../engine/renderer';
import { spawnDamageNumber } from '../ui/damageNumbers';

let sceneRef: any;

// Active mortar projectiles in flight
const activeMortars: any[] = [];

// Active ice patches on the ground
const activeIcePatches: any[] = [];

// Shared geometry (created once)
let shellGeo: any;

export function initMortarSystem(scene: any) {
  sceneRef = scene;
}

/**
 * Fire a mortar projectile along a parabolic arc.
 */
export function fireMortarProjectile(opts: any) {
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
  // Using a simple approximation: arcLen ~ groundDist + 2*arcHeight^2/groundDist
  const arcLen = groundDist > 0.1
    ? groundDist + 2 * opts.arcHeight * opts.arcHeight / groundDist
    : opts.arcHeight * 2;
  const flightTime = arcLen / opts.speed;

  const mortar: any = {
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
    icePatch: opts.icePatch || null,
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
export function updateMortarProjectiles(dt: number) {
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

    // Update ground circle opacity — ramps from 0.3 -> 0.9 as projectile approaches
    if (m.groundCircle) {
      const gc = m.groundCircle;
      // Ring: 0.3 at launch -> 0.9 at impact (never below 0.3)
      const ringOpacity = 0.3 + 0.6 * t;
      // Fill: 0.08 at launch -> 0.35 at impact
      const fillOpacity = 0.08 + 0.27 * t;
      // Pulse border for urgency
      const gcPulse = 0.85 + 0.15 * Math.sin(performance.now() * (0.006 + 0.012 * t));
      gc.ringMat.opacity = ringOpacity * gcPulse;
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
function onMortarImpact(m: any) {
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
    effectFn: (e: any) => {
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

  // Create ice patch if enabled
  if (m.icePatch && m.icePatch.enabled) {
    createIcePatch(tx, tz, m.blastRadius, m.icePatch);
  }
}

/**
 * Create a persistent ice patch on the ground.
 */
function createIcePatch(x: number, z: number, radius: number, config: any) {
  // Create visual ice patch (flat circle on ground)
  const geo = new THREE.CircleGeometry(radius, 32);
  geo.rotateX(-Math.PI / 2); // lay flat

  const mat = new THREE.MeshBasicMaterial({
    color: config.color || 0x80E0FF,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.02, z); // slightly above ground to avoid z-fighting
  sceneRef.add(mesh);

  const patch = {
    x,
    z,
    radius,
    mesh,
    mat,
    geo,
    duration: config.duration,
    elapsed: 0,
    speedMult: config.speedMult,
    knockbackMult: config.knockbackMult,
    affectsPlayer: config.affectsPlayer,
    affectsEnemies: config.affectsEnemies,
  };

  activeIcePatches.push(patch);
  return patch;
}

/**
 * Update all ice patches — handle duration and fading.
 */
export function updateIcePatches(dt: number) {
  for (let i = activeIcePatches.length - 1; i >= 0; i--) {
    const patch = activeIcePatches[i];
    patch.elapsed += dt * 1000;

    // Fade out in last 500ms
    const remaining = patch.duration - patch.elapsed;
    if (remaining < 500) {
      patch.mat.opacity = 0.5 * (remaining / 500);
    }

    // Remove when expired
    if (patch.elapsed >= patch.duration) {
      patch.geo.dispose();
      patch.mat.dispose();
      sceneRef.remove(patch.mesh);
      activeIcePatches.splice(i, 1);
    }
  }
}

/**
 * Check if a position is on any ice patch.
 * Returns the ice patch config if on ice, null otherwise.
 */
export function getIcePatchAt(x: number, z: number) {
  for (const patch of activeIcePatches) {
    const dx = x - patch.x;
    const dz = z - patch.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= patch.radius) {
      return patch;
    }
  }
  return null;
}

/**
 * Get ice effect multipliers for an entity at position.
 */
export function getIceEffects(x: number, z: number, isPlayer: boolean) {
  const patch = getIcePatchAt(x, z);
  if (!patch) {
    return { speedMult: 1.0, knockbackMult: 1.0 };
  }

  // Check if this entity type is affected
  if (isPlayer && !patch.affectsPlayer) {
    return { speedMult: 1.0, knockbackMult: 1.0 };
  }
  if (!isPlayer && !patch.affectsEnemies) {
    return { speedMult: 1.0, knockbackMult: 1.0 };
  }

  return {
    speedMult: patch.speedMult,
    knockbackMult: patch.knockbackMult,
  };
}

/**
 * Clean up a mortar projectile's visual resources.
 */
function removeMortar(m: any) {
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

/**
 * Clear all ice patches (on restart/cleanup).
 */
export function clearIcePatches() {
  for (const patch of activeIcePatches) {
    patch.geo.dispose();
    patch.mat.dispose();
    sceneRef.remove(patch.mesh);
  }
  activeIcePatches.length = 0;
}
