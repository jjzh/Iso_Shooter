// Bend Mode — player-triggered rule-bending targeting mode
// Press Q to toggle. Shows radial menu for bend selection,
// then click a physics object to apply the bend.

import { createBendSystem } from './bendSystem';
import { getBendById } from '../config/bends';
import { activateBulletTime, isBulletTimeActive, toggleBulletTime } from './bulletTime';
import { showRadialMenu, hideRadialMenu, isRadialMenuVisible, getSelectedBendId, clearSelectedBend, updateLockedBends, unlockBendUI } from '../ui/radialMenu';
import { applyBendVisuals, clearBendVisuals } from '../entities/physicsObject';
import { getCamera } from './renderer';
import { emit, on } from './events';
import { screenShake } from './renderer';

// ─── State ───

let bendSystem = createBendSystem(3);
let active = false;
let targeting = false;     // bend selected, waiting for click on target
let maxBends = 3;

// ─── Highlight State ───
// Tracks which objects are currently highlighted so we can restore them

let highlightedObjects: Set<any> = new Set();
let hoveredObject: any = null;
let highlightPulseTime = 0;  // accumulates for pulsing animation
let lockedBends: Set<string> = new Set();

// ─── Init ───

export function initBendMode(): void {
  maxBends = 3;
  bendSystem = createBendSystem(maxBends);

  // Pressure plate unlocks all locked bends
  on('pressurePlateActivated', () => {
    if (lockedBends.size === 0) return;
    const unlocking = [...lockedBends];
    for (const bendId of unlocking) {
      unlockBend(bendId);
    }
  });
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
  updateTargetingCursor();
  emit({ type: 'bendModeActivated' });
}

function deactivateBendMode(): void {
  active = false;
  targeting = false;
  hideRadialMenu();
  clearSelectedBend();
  unhighlightAllObjects();
  updateTargetingCursor();

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
  updateTargetingCursor();
}

// ─── Targeting Cursor ───
// Shows a visible "click a target" indicator when in targeting mode

let targetingIndicator: HTMLDivElement | null = null;

function ensureTargetingIndicator(): void {
  if (targetingIndicator) return;
  targetingIndicator = document.createElement('div');
  targetingIndicator.id = 'bend-targeting';
  targetingIndicator.style.cssText = `
    position: fixed;
    top: 55%;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: rgba(100, 180, 255, 0.9);
    letter-spacing: 3px;
    text-transform: uppercase;
    text-shadow: 0 0 10px rgba(100, 140, 255, 0.6);
    pointer-events: none;
    z-index: 200;
    display: none;
  `;
  document.body.appendChild(targetingIndicator);
}

function updateTargetingCursor(): void {
  ensureTargetingIndicator();
  if (!targetingIndicator) return;

  if (active && targeting) {
    const bendId = getSelectedBendId();
    const label = bendId === 'enlarge' ? 'ENLARGE' : bendId === 'shrink' ? 'SHRINK' : 'BEND';
    targetingIndicator.textContent = `[ ${label} ] click target`;
    targetingIndicator.style.display = 'block';
    document.body.style.cursor = 'crosshair';
  } else if (active && !targeting) {
    targetingIndicator.style.display = 'none';
    document.body.style.cursor = 'default';
  } else {
    targetingIndicator.style.display = 'none';
    document.body.style.cursor = 'default';
  }
}

export function isBendModeActive(): boolean {
  return active;
}

export function isBendTargeting(): boolean {
  return targeting;
}

// ─── Object Highlights ───
// When bend mode is active, all targetable objects pulse with an outline glow.
// The hovered object gets a brighter highlight.

function highlightTargetableObjects(gameState: any): void {
  for (const obj of gameState.physicsObjects) {
    if (obj.destroyed || obj.fellInPit || !obj.mesh) continue;
    if (highlightedObjects.has(obj)) continue;

    // Store original emissive values before highlight
    obj.mesh.traverse((child: any) => {
      if (child.isMesh && child.material) {
        if (!child.userData._origEmissiveHex) {
          child.userData._origEmissiveHex = child.material.emissive.getHex();
          child.userData._origEmissiveIntensity = child.material.emissiveIntensity;
        }
      }
    });

    highlightedObjects.add(obj);
  }
}

function unhighlightAllObjects(): void {
  for (const obj of highlightedObjects) {
    if (!obj.mesh) continue;
    obj.mesh.traverse((child: any) => {
      if (child.isMesh && child.material && child.userData._origEmissiveHex !== undefined) {
        child.material.emissive.setHex(child.userData._origEmissiveHex);
        child.material.emissiveIntensity = child.userData._origEmissiveIntensity;
        delete child.userData._origEmissiveHex;
        delete child.userData._origEmissiveIntensity;
      }
    });
  }
  highlightedObjects.clear();
  hoveredObject = null;
}

function updateHighlightPulse(dt: number): void {
  highlightPulseTime += dt;
  // Pulse intensity: sine wave between 0.5 and 1.0
  const pulse = 0.5 + 0.5 * Math.sin(highlightPulseTime * 4);
  const baseIntensity = 0.3 + pulse * 0.5;     // 0.3 → 0.8
  const hoverIntensity = 0.6 + pulse * 0.6;    // 0.6 → 1.2
  const highlightColor = 0x6699ff; // soft blue

  for (const obj of highlightedObjects) {
    if (!obj.mesh) continue;
    const isHovered = obj === hoveredObject;
    obj.mesh.traverse((child: any) => {
      if (child.isMesh && child.material) {
        child.material.emissive.setHex(isHovered ? 0x88ccff : highlightColor);
        child.material.emissiveIntensity = isHovered ? hoverIntensity : baseIntensity;
      }
    });
  }
}

// ─── Hover Detection ───
// Called each frame during targeting to detect which object the cursor is over

export function updateBendHover(mouseNDC: { x: number; y: number }, gameState: any): void {
  if (!active || !targeting) {
    if (hoveredObject) hoveredObject = null;
    return;
  }

  const camera = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(mouseNDC.x, mouseNDC.y), camera);

  const meshes: any[] = [];
  const meshToObj: Map<any, any> = new Map();

  for (const obj of gameState.physicsObjects) {
    if (obj.destroyed || obj.fellInPit || !obj.mesh) continue;
    meshes.push(obj.mesh);
    meshToObj.set(obj.mesh, obj);
  }

  const intersects = raycaster.intersectObjects(meshes, true);
  let newHovered: any = null;

  if (intersects.length > 0) {
    for (const hit of intersects) {
      let current = hit.object;
      while (current) {
        if (meshToObj.has(current)) {
          newHovered = meshToObj.get(current);
          break;
        }
        current = current.parent;
      }
      if (newHovered) break;
    }
  }

  hoveredObject = newHovered;
}

// ─── Per-Frame Update ───
// Call from game loop to update highlights and hover

export function updateBendMode(dt: number, gameState: any): void {
  if (active) {
    highlightTargetableObjects(gameState);
    updateHighlightPulse(dt);
  }
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

  if (lockedBends.has(selectedBend)) {
    emit({ type: 'bendFailed', bendId: selectedBend, reason: 'locked' });
    return;
  }

  const result = bendSystem.applyBend(selectedBend, targetType, target);

  if (result.success) {
    // Remove from highlight set so highlight pulse doesn't overwrite bend visuals
    highlightedObjects.delete(target);
    // Clean up stored originals (bend visuals now own the emissive)
    if (target.mesh) {
      target.mesh.traverse((child: any) => {
        if (child.isMesh) {
          delete child.userData._origEmissiveHex;
          delete child.userData._origEmissiveIntensity;
        }
      });
    }

    // Apply visuals
    const bend = getBendById(selectedBend);
    if (bend) {
      applyBendVisuals(target, bend.tintColor);
    }

    // Drop suspended objects
    if (target.suspended) {
      target.suspended = false;

      // Remove tether visual
      if (target.tetherMesh) {
        target.tetherMesh.geometry.dispose();
        target.tetherMesh.material.dispose();
        const tetherScene = target.tetherMesh.parent;
        if (tetherScene) tetherScene.remove(target.tetherMesh);
        target.tetherMesh = null;
      }

      // Animate drop: move mesh from suspend height to ground
      const mesh = target.mesh;
      if (mesh) {
        const startY = target.suspendHeight;
        const dropDuration = 400; // ms
        const startTime = performance.now();
        const dropAnim = () => {
          const elapsed = performance.now() - startTime;
          const t = Math.min(elapsed / dropDuration, 1);
          // Ease-in (accelerating fall)
          const eased = t * t;
          mesh.position.y = startY * (1 - eased);
          if (t < 1) {
            requestAnimationFrame(dropAnim);
          } else {
            mesh.position.y = 0;
            // Impact feedback
            screenShake(5, 300);
            emit({ type: 'objectDropped', position: { x: target.pos.x, z: target.pos.z } });
          }
        };
        requestAnimationFrame(dropAnim);
      }
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

// ─── Locked Bends ───

export function setLockedBends(ids: string[]): void {
  lockedBends = new Set(ids);
  updateLockedBends(ids);
}

export function isBendLocked(bendId: string): boolean {
  return lockedBends.has(bendId);
}

function unlockBend(bendId: string): void {
  lockedBends.delete(bendId);
  updateLockedBends([...lockedBends]);
  unlockBendUI(bendId);

  // Announce
  const announceEl = document.getElementById('wave-announce');
  if (announceEl) {
    const label = bendId.toUpperCase();
    announceEl.textContent = `${label} UNLOCKED`;
    announceEl.classList.add('visible');
    setTimeout(() => announceEl.classList.remove('visible'), 2000);
  }

  // Screen shake for emphasis
  screenShake(3, 200);
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
  unhighlightAllObjects();
  highlightPulseTime = 0;
  hideRadialMenu();
  clearSelectedBend();
  lockedBends.clear();
  updateLockedBends([]);
}