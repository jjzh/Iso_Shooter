import { PhysicsObject, PhysicsObjectPlacement } from '../types/index';

let nextId = 1;

export function resetPhysicsObjectIds(): void {
  nextId = 1;
}

export function createPhysicsObject(placement: PhysicsObjectPlacement): PhysicsObject {
  return {
    id: nextId++,
    pos: { x: placement.x, z: placement.z },
    vel: { x: 0, z: 0 },
    radius: placement.radius,
    mass: placement.mass,
    health: placement.health,
    maxHealth: placement.health,
    material: placement.material,
    meshType: placement.meshType,
    scale: placement.scale ?? 1,
    restitution: undefined,
    mesh: null,
    destroyed: false,
    fellInPit: false,
  };
}

// ─── Mesh Creation ───

const MATERIAL_COLORS: Record<string, { color: number; emissive: number }> = {
  stone: { color: 0x888899, emissive: 0x334455 },
  wood:  { color: 0x8B6914, emissive: 0x443322 },
  metal: { color: 0xaaaacc, emissive: 0x556677 },
  ice:   { color: 0x88ccff, emissive: 0x4488aa },
};

export function createPhysicsObjectMesh(obj: PhysicsObject, scene: any): void {
  const group = new THREE.Group();
  const colors = MATERIAL_COLORS[obj.material] || MATERIAL_COLORS.stone;
  const mat = new THREE.MeshStandardMaterial({
    color: colors.color,
    emissive: colors.emissive,
    emissiveIntensity: 0.3,
    roughness: 0.7,
  });

  let geo;
  switch (obj.meshType) {
    case 'rock':
      geo = new THREE.SphereGeometry(obj.radius * obj.scale, 8, 6);
      break;
    case 'crate': {
      // Squat cylinder with 6 sides — reads as a chunky crate/drum shape
      // while having a circular footprint that exactly matches circle collision.
      // No corner-beyond-radius mismatch possible.
      const r = obj.radius * obj.scale;
      geo = new THREE.CylinderGeometry(r, r, r * 1.4, 6);
      break;
    }
    case 'barrel':
      // Max ground-plane radius = bottom radius = obj.radius * obj.scale
      geo = new THREE.CylinderGeometry(
        obj.radius * obj.scale * 0.8,
        obj.radius * obj.scale,
        obj.radius * obj.scale * 1.5,
        8
      );
      break;
    case 'pillar':
      // Max ground-plane radius = bottom radius = obj.radius * obj.scale
      geo = new THREE.CylinderGeometry(
        obj.radius * obj.scale * 0.6,
        obj.radius * obj.scale,
        obj.radius * obj.scale * 2.5,
        6
      );
      break;
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = obj.radius * obj.scale * 0.5; // sit on ground
  group.add(mesh);

  group.position.set(obj.pos.x, 0, obj.pos.z);
  // Store the base geometry size so bend visuals can scale relative to it
  group.userData._baseGeoSize = obj.radius * obj.scale;
  scene.add(group);
  obj.mesh = group;
}

export function applyBendVisuals(obj: PhysicsObject, tintColor: number): void {
  if (!obj.mesh) return;
  // Scale mesh so visual matches collision radius.
  // Geometry was built at baseGeoSize = originalRadius * originalScale.
  // We want the visual to reflect the new radius.
  const base = obj.mesh.userData._baseGeoSize || 1;
  const s = obj.radius / base;
  obj.mesh.scale.set(s, s, s);
  obj.mesh.traverse((child: any) => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(tintColor);
      child.material.emissiveIntensity = 0.6;
    }
  });
}

export function clearBendVisuals(obj: PhysicsObject): void {
  if (!obj.mesh) return;
  obj.mesh.scale.set(1, 1, 1);
  const colors = MATERIAL_COLORS[obj.material] || MATERIAL_COLORS.stone;
  obj.mesh.traverse((child: any) => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(colors.emissive);
      child.material.emissiveIntensity = 0.3;
    }
  });
}

export function clearPhysicsObjects(gameState: any, scene: any): void {
  for (const obj of gameState.physicsObjects) {
    if (obj.mesh) {
      scene.remove(obj.mesh);
      obj.mesh.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  }
  gameState.physicsObjects = [];
}