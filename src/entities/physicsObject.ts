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
