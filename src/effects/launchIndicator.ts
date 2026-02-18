// Launch Indicator — shows which enemy will be launched (passive ring + emissive highlight)
// and intensifies during the windup phase before launch fires.

import { LAUNCH } from '../config/player';

let sceneRef: any;

// Ring mesh (singleton — repositioned each frame)
let ringGeo: any;
let ringMat: any;
let ringMesh: any;

// Target tracking (to restore emissive when target changes)
let previousTarget: any = null;

// --- Init ---

export function initLaunchIndicator(scene: any) {
  sceneRef = scene;
}

// --- Target Finding ---

export function findLaunchTarget(enemies: any[], playerPos: any): any | null {
  let closestEnemy: any = null;
  let closestDistSq = LAUNCH.range * LAUNCH.range;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.health <= 0 || e.fellInPit) continue;
    const dx = e.pos.x - playerPos.x;
    const dz = e.pos.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < closestDistSq) {
      closestDistSq = distSq;
      closestEnemy = e;
    }
  }
  return closestEnemy;
}

// --- Ring Mesh (lazy init) ---

function ensureRing() {
  if (ringMesh) return;
  if (!sceneRef) return;

  const innerRadius = LAUNCH.indicatorRingRadius * 0.65;
  ringGeo = new THREE.RingGeometry(innerRadius, LAUNCH.indicatorRingRadius, 24);
  ringGeo.rotateX(-Math.PI / 2); // lay flat on ground

  ringMat = new THREE.MeshBasicMaterial({
    color: LAUNCH.indicatorColor,
    transparent: true,
    opacity: LAUNCH.indicatorOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.renderOrder = -1;
  ringMesh.visible = false;
  sceneRef.add(ringMesh);
}

// --- Emissive Helpers ---

function setTargetHighlight(enemy: any, intensity: number) {
  if (!enemy || !enemy.bodyMesh) return;
  enemy.bodyMesh.material.emissive.setHex(LAUNCH.indicatorColor);
  enemy.bodyMesh.material.emissiveIntensity = intensity;
  if (enemy.headMesh) {
    enemy.headMesh.material.emissive.setHex(LAUNCH.indicatorColor);
    enemy.headMesh.material.emissiveIntensity = intensity;
  }
}

function restoreTargetEmissive(enemy: any) {
  if (!enemy || !enemy.bodyMesh || !enemy.config) return;
  enemy.bodyMesh.material.emissive.setHex(enemy.config.emissive);
  enemy.bodyMesh.material.emissiveIntensity = enemy.config.emissiveIntensity || 0.3;
  if (enemy.headMesh) {
    enemy.headMesh.material.emissive.setHex(enemy.config.emissive);
    enemy.headMesh.material.emissiveIntensity = enemy.config.emissiveIntensity || 0.3;
  }
}

// --- Update ---

/**
 * @param target - The enemy to highlight (null = no target)
 * @param windupProgress - Negative = passive mode, 0..1 = windup intensification
 */
export function updateLaunchIndicator(target: any, windupProgress: number) {
  ensureRing();

  // Target changed — restore previous
  if (previousTarget && previousTarget !== target) {
    restoreTargetEmissive(previousTarget);
  }
  previousTarget = target;

  if (!target) {
    // No target — hide everything
    if (ringMesh) ringMesh.visible = false;
    return;
  }

  // Position ring under enemy
  if (ringMesh) {
    ringMesh.position.set(target.pos.x, 0.04, target.pos.z);
    ringMesh.visible = true;
  }

  if (windupProgress < 0) {
    // --- Passive mode: gentle pulse ---
    const pulse = 0.3 + 0.1 * Math.sin(performance.now() * 0.004);
    if (ringMat) {
      ringMat.opacity = LAUNCH.indicatorOpacity * pulse / 0.3;
    }
    if (ringMesh) {
      ringMesh.scale.setScalar(1.0);
    }
    setTargetHighlight(target, 0.5);
  } else {
    // --- Windup mode: intensify with progress (0 → 1) ---
    const t = Math.min(windupProgress, 1);

    // Ring: opacity ramps, faster pulse
    const pulse = 0.8 + 0.2 * Math.sin(performance.now() * 0.015);
    if (ringMat) {
      ringMat.opacity = (LAUNCH.indicatorOpacity + (0.8 - LAUNCH.indicatorOpacity) * t) * pulse;
    }

    // Ring: slight scale pulse during windup
    if (ringMesh) {
      const scalePulse = 1.0 + 0.15 * Math.sin(performance.now() * 0.02) * t;
      ringMesh.scale.setScalar(scalePulse);
    }

    // Enemy emissive ramps up
    setTargetHighlight(target, 0.5 + 0.5 * t);
  }
}

// --- Cleanup ---

export function clearLaunchIndicator() {
  if (previousTarget) {
    restoreTargetEmissive(previousTarget);
    previousTarget = null;
  }
  if (ringMesh && sceneRef) {
    sceneRef.remove(ringMesh);
    ringMesh = null;
  }
  if (ringMat) {
    ringMat.dispose();
    ringMat = null;
  }
  if (ringGeo) {
    ringGeo.dispose();
    ringGeo = null;
  }
}
