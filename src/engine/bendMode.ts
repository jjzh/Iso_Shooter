// Bend Mode — player-triggered rule-bending targeting mode
// Press Q to toggle. Shows radial menu for bend selection,
// then click a physics object to apply the bend.

import { createBendSystem } from './bendSystem';
import { getBendById } from '../config/bends';
import { activateBulletTime, isBulletTimeActive, toggleBulletTime } from './bulletTime';
import { showRadialMenu, hideRadialMenu, isRadialMenuVisible, getSelectedBendId, clearSelectedBend } from '../ui/radialMenu';
import { applyBendVisuals, clearBendVisuals } from '../entities/physicsObject';
import { getCamera } from './renderer';
import { emit } from './events';

// ─── State ───

let bendSystem = createBendSystem(3);
let active = false;
let targeting = false;     // bend selected, waiting for click on target
let maxBends = 3;

// ─── Init ───

export function initBendMode(): void {
  maxBends = 3;
  bendSystem = createBendSystem(maxBends);
}

// ─── Toggle ───

export function toggleBendMode(): void {
  if (active) {
    deactivateBendMode();
  } else {
    activateBendMode();
  }
}

function activateBendMode(): void {
  if (bendSystem.bendsRemaining() <= 0) return;
  active = true;
  targeting = false;

  // Activate bullet time for slow-mo
  if (!isBulletTimeActive()) {
    activateBulletTime();
  }

  showRadialMenu();
  emit({ type: 'bendModeActivated' });
}

function deactivateBendMode(): void {
  active = false;
  targeting = false;
  hideRadialMenu();
  clearSelectedBend();

  // Deactivate bullet time
  if (isBulletTimeActive()) {
    toggleBulletTime();
  }

  emit({ type: 'bendModeDeactivated' });
}

// ─── Targeting ───

export function enterTargeting(): void {
  if (!active) return;
  targeting = true;
  // Hide radial menu — bend is selected, now click a target
  hideRadialMenu();
}

export function isBendModeActive(): boolean {
  return active;
}

export function isBendTargeting(): boolean {
  return targeting;
}

// ─── Click-to-Apply ───

export function handleBendClick(mouseNDC: { x: number; y: number }, gameState: any): void {
  if (!active || !targeting) return;

  const selectedBend = getSelectedBendId();
  if (!selectedBend) return;

  // Raycast against physics object meshes
  const camera = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseNDC.x, mouseNDC.y), camera);

  // Collect all physics object meshes
  const meshes: any[] = [];
  const meshToObj: Map<any, any> = new Map();

  for (const obj of gameState.physicsObjects) {
    if (obj.destroyed || obj.fellInPit || !obj.mesh) continue;
    meshes.push(obj.mesh);
    meshToObj.set(obj.mesh, obj);
  }

  // Test all meshes (recursive for groups)
  const intersects = raycaster.intersectObjects(meshes, true);

  if (intersects.length > 0) {
    // Find which physics object was hit
    let hitObj: any = null;
    for (const hit of intersects) {
      // Walk up to find the group that's in our map
      let current = hit.object;
      while (current) {
        if (meshToObj.has(current)) {
          hitObj = meshToObj.get(current);
          break;
        }
        current = current.parent;
      }
      if (hitObj) break;
    }

    if (hitObj) {
      tryApplyBendToTarget(hitObj, 'physicsObject');
    }
  }
}

export function tryApplyBendToTarget(target: any, targetType: 'physicsObject' | 'obstacle'): void {
  const selectedBend = getSelectedBendId();
  if (!selectedBend) return;

  const result = bendSystem.applyBend(selectedBend, targetType, target);

  if (result.success) {
    // Apply visuals
    const bend = getBendById(selectedBend);
    if (bend) {
      applyBendVisuals(target, bend.tintColor);
    }

    // Emit event
    emit({
      type: 'bendApplied',
      bendId: selectedBend,
      targetType,
      targetId: target.id ?? 0,
      position: { x: target.pos.x, z: target.pos.z },
    });

    // Exit targeting — go back to radial menu if bends remaining
    targeting = false;
    clearSelectedBend();

    if (bendSystem.bendsRemaining() > 0) {
      showRadialMenu();
    } else {
      deactivateBendMode();
    }
  } else {
    emit({
      type: 'bendFailed',
      bendId: selectedBend,
      reason: result.reason || 'unknown',
    });
  }
}

// ─── Queries ───

export function getBendsRemaining(): number {
  return bendSystem.bendsRemaining();
}

export function getActiveBends() {
  return bendSystem.getActiveBends();
}

export function getMaxBends(): number {
  return maxBends;
}

// ─── Reset ───

export function resetBendMode(): void {
  // Restore all bent objects to original values + visuals
  const activeBends = bendSystem.getActiveBends();
  for (const ab of activeBends) {
    if (ab.target && ab.target.mesh) {
      clearBendVisuals(ab.target);
    }
  }

  bendSystem.resetAll();
  active = false;
  targeting = false;
  hideRadialMenu();
  clearSelectedBend();
}
