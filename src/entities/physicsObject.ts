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
      const s = obj.radius * obj.scale * 1.4; // box inscribed in circle
      geo = new THREE.BoxGeometry(s, s, s);
      break;
    }
    case 'barrel':
      geo = new THREE.CylinderGeometry(
        obj.radius * obj.scale * 0.8,
        obj.radius * obj.scale,
        obj.radius * obj.scale * 1.5,
        8
      );
      break;
    case 'pillar':
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
  scene.add(group);
  obj.mesh = group;
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
