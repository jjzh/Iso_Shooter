// Door System — visual door at the far end of each room (-Z wall)
// States: locked → unlocking → open
// Player must be near the open door AND press interact (F/Enter) or dash through

import { DOOR_CONFIG } from '../config/door';
import { emit } from './events';

// Door state
type DoorState = 'locked' | 'unlocking' | 'open' | 'none';

let doorState: DoorState = 'none';
let doorGroup: any = null;
let doorFrameMesh: any = null;
let doorPanelMesh: any = null;
let doorGlowMesh: any = null;
let doorAnimTimer = 0;
let doorRoomIndex = 0;
let sceneRef: any = null;

// Door position (centered on far wall at -Z)
let doorX = 0;
let doorZ = 0;

// Prompt UI element
let promptEl: HTMLElement | null = null;
let promptVisible = false;

export function initDoor(scene: any) {
  sceneRef = scene;

  // Create or find the door prompt element
  promptEl = document.getElementById('door-prompt');
  if (!promptEl) {
    promptEl = document.createElement('div');
    promptEl.id = 'door-prompt';
    promptEl.style.cssText = `
      position: fixed;
      bottom: 25%;
      left: 50%;
      transform: translateX(-50%);
      color: #88bbff;
      font-family: 'Courier New', monospace;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      text-shadow: 0 0 10px rgba(136, 187, 255, 0.6);
      z-index: 50;
    `;
    promptEl.textContent = 'Press F to enter';
    document.body.appendChild(promptEl);
  }
}

export function createDoor(arenaHalfX: number, arenaHalfZ: number, roomIndex: number) {
  removeDoor();

  doorState = 'locked';
  doorRoomIndex = roomIndex;
  doorAnimTimer = 0;

  // Door is centered near the far wall (-Z = top-right in iso)
  // Offset 1 unit inward so the door frame is visible in front of the wall
  doorX = 0;
  doorZ = -arenaHalfZ + 1;

  doorGroup = new THREE.Group();
  doorGroup.position.set(doorX, 0, doorZ);

  // Door frame — two pillars and a lintel (contrasting color from arena walls)
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a6a,
    emissive: 0x4466aa,
    emissiveIntensity: 0.5,
    roughness: 0.5,
  });

  // Left pillar — thicker and taller than walls so it reads as a doorway
  const leftPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 4, 0.6),
    frameMat
  );
  leftPillar.position.set(-2, 2, 0);
  doorGroup.add(leftPillar);

  // Right pillar
  const rightPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 4, 0.6),
    frameMat
  );
  rightPillar.position.set(2, 2, 0);
  doorGroup.add(rightPillar);

  // Lintel (top bar)
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.5, 0.6),
    frameMat
  );
  lintel.position.set(0, 4.25, 0);
  doorGroup.add(lintel);

  doorFrameMesh = doorGroup; // for reference

  // Door panel — the part that animates (wider to fill frame)
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    emissive: 0x334466,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.9,
    roughness: 0.5,
  });
  doorPanelMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 3.6, 0.25),
    panelMat
  );
  doorPanelMesh.position.set(0, 1.8, 0);
  doorGroup.add(doorPanelMesh);

  // Glow plane — behind the door, visible when open (on the +Z side facing player)
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x88bbff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  doorGlowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.6),
    glowMat
  );
  doorGlowMesh.position.set(0, 1.8, 0.2); // glow on the +Z side (facing player approach)
  doorGroup.add(doorGlowMesh);

  sceneRef.add(doorGroup);
}

export function unlockDoor() {
  if (doorState !== 'locked') return;
  doorState = 'unlocking';
  doorAnimTimer = 0;
}

/**
 * Update door state and check for interaction.
 * @param interact - true if the player pressed the interact key this frame
 * @param playerDashing - true if the player is currently dashing
 * @returns true if the player entered the door (trigger room transition)
 */
export function updateDoor(dt: number, playerPos: any, interact: boolean, playerDashing: boolean): boolean {
  if (doorState === 'none' || !doorGroup) return false;

  if (doorState === 'unlocking') {
    doorAnimTimer += dt * 1000;
    const progress = Math.min(doorAnimTimer / DOOR_CONFIG.unlockDuration, 1);

    // Door panel slides up
    doorPanelMesh.position.y = 1.8 + progress * 4;
    doorPanelMesh.material.opacity = 0.9 * (1 - progress);

    // Glow appears
    doorGlowMesh.material.opacity = progress * 0.6;

    // Frame emissive ramps up
    doorGroup.children.forEach((child: any) => {
      if (child.material && child !== doorPanelMesh && child !== doorGlowMesh) {
        child.material.emissiveIntensity = 0.5 + progress * 0.8;
      }
    });

    if (progress >= 1) {
      doorState = 'open';
      emit({ type: 'doorUnlocked', roomIndex: doorRoomIndex });
    }
  }

  if (doorState === 'open') {
    // Pulsing glow
    doorAnimTimer += dt * 1000;
    const pulse = 0.4 + 0.2 * Math.sin(doorAnimTimer * 0.003 * Math.PI * 2);
    doorGlowMesh.material.opacity = pulse;

    // Check player proximity — use a generous radius since the door is at the wall
    // Player is clamped to ±(arenaHalfZ - 0.5), door is at -arenaHalfZ
    // So we check with a larger interact radius that accounts for the wall gap
    if (playerPos) {
      const dx = playerPos.x - doorX;
      const dz = playerPos.z - doorZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      const nearDoor = dist < DOOR_CONFIG.interactRadius;

      if (nearDoor) {
        // Show prompt
        showPrompt();

        // Enter on interact key press OR dashing into the door
        if (interact || playerDashing) {
          hidePrompt();
          emit({ type: 'doorEntered', roomIndex: doorRoomIndex });
          doorState = 'none';
          return true; // trigger room transition
        }
      } else {
        hidePrompt();
      }
    }
  } else {
    hidePrompt();
  }

  return false;
}

function showPrompt() {
  if (promptEl && !promptVisible) {
    promptVisible = true;
    promptEl.style.opacity = '1';
  }
}

function hidePrompt() {
  if (promptEl && promptVisible) {
    promptVisible = false;
    promptEl.style.opacity = '0';
  }
}

export function removeDoor() {
  hidePrompt();
  if (doorGroup && sceneRef) {
    sceneRef.remove(doorGroup);
    // Dispose geometries and materials
    doorGroup.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  doorGroup = null;
  doorPanelMesh = null;
  doorGlowMesh = null;
  doorFrameMesh = null;
  doorState = 'none';
}

export function getDoorState(): DoorState {
  return doorState;
}

export function isDoorOpen(): boolean {
  return doorState === 'open';
}
