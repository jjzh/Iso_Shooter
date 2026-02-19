// Pressure Plate — floor zone that activates when a heavy enough object rests on it
// Triggers a ceremony (glow pulse, particle burst, audio) on activation.

import { PressurePlate, PressurePlatePlacement, GameState } from '../types/index';
import { emit } from './events';
import { screenShake } from './renderer';

// ─── Create ───

export function createPressurePlate(placement: PressurePlatePlacement): PressurePlate {
  return {
    x: placement.x,
    z: placement.z,
    radius: placement.radius,
    massThreshold: placement.massThreshold,
    activated: false,
    mesh: null,
  };
}

// ─── Mesh ───

export function createPressurePlateMesh(plate: PressurePlate, scene: any): void {
  const group = new THREE.Group();

  // Glowing ring on the ground
  const ringGeo = new THREE.RingGeometry(plate.radius * 0.6, plate.radius, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x44ff88,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2; // lay flat
  ring.position.y = 0.02;         // just above ground
  group.add(ring);

  // Inner disc
  const discGeo = new THREE.CircleGeometry(plate.radius * 0.6, 32);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x226644,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  group.add(disc);

  group.position.set(plate.x, 0, plate.z);
  scene.add(group);
  plate.mesh = group;
}

// ─── Update ───

export function updatePressurePlates(gameState: GameState): void {
  for (const plate of gameState.pressurePlates) {
    if (plate.activated) continue;

    // Check if any physics object with enough mass is resting on the plate
    for (const obj of gameState.physicsObjects) {
      if (obj.destroyed || obj.fellInPit) continue;

      // Check overlap (circle vs circle)
      const dx = obj.pos.x - plate.x;
      const dz = obj.pos.z - plate.z;
      const distSq = dx * dx + dz * dz;
      const maxDist = plate.radius + obj.radius;

      if (distSq > maxDist * maxDist) continue;

      // Check mass threshold
      if (obj.mass < plate.massThreshold) continue;

      // Check velocity is near zero (object must be "resting")
      const speed = Math.sqrt(obj.vel.x * obj.vel.x + obj.vel.z * obj.vel.z);
      if (speed > 0.5) continue;

      // Activate!
      plate.activated = true;
      activatePlateCeremony(plate);
      break;
    }
  }

  // Pulse inactive plates
  for (const plate of gameState.pressurePlates) {
    if (plate.activated || !plate.mesh) continue;
    const t = performance.now() / 1000;
    const pulse = 0.3 + 0.15 * Math.sin(t * 2.5);
    const ring = plate.mesh.children[0];
    if (ring && ring.material) {
      ring.material.opacity = pulse;
    }
  }
}

function activatePlateCeremony(plate: PressurePlate): void {
  if (!plate.mesh) return;

  // Brighten the plate
  plate.mesh.children.forEach((child: any) => {
    if (child.material) {
      child.material.color.setHex(0x88ffcc);
      child.material.opacity = 0.8;
    }
  });

  // Screen shake
  screenShake(4, 300);

  // Emit event for audio/particles
  emit({
    type: 'pressurePlateActivated',
    position: { x: plate.x, z: plate.z },
  });
}

// ─── Cleanup ───

export function clearPressurePlates(gameState: GameState, scene: any): void {
  for (const plate of gameState.pressurePlates) {
    if (plate.mesh) {
      scene.remove(plate.mesh);
      plate.mesh.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  }
  gameState.pressurePlates = [];
}
