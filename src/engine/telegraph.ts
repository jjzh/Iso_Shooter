// Telegraph system — visual warnings before enemies spawn
// Ground ring + fill circle + type indicator per spawn point

import { ENEMY_TYPES } from '../config/enemies';

let sceneRef: any;

// Shared geometries (created once, reused across all telegraphs)
let ringGeo: any, fillGeo: any;
const typeGeos: Record<string, any> = {};  // keyed by enemy type name

// Type indicator shapes
const TYPE_LABELS: Record<string, string> = {
  goblin: 'G',
  skeletonArcher: 'A',
  stoneGolem: 'T',
};

export function initTelegraph(scene: any) {
  sceneRef = scene;

  // Ring: inner 0.6, outer 0.8, flat on ground
  ringGeo = new THREE.RingGeometry(0.6, 0.8, 24);
  ringGeo.rotateX(-Math.PI / 2);

  // Fill circle: radius 0.6
  fillGeo = new THREE.CircleGeometry(0.6, 24);
  fillGeo.rotateX(-Math.PI / 2);

  // Type indicators — small shapes
  // Goblin: triangle (cone 3 sides)
  typeGeos.goblin = new THREE.ConeGeometry(0.2, 0.4, 3);
  // Archer: diamond (box rotated)
  typeGeos.skeletonArcher = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  // Golem: hexagon (cylinder 6 sides, flat)
  typeGeos.stoneGolem = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 6);
}

export function createTelegraph(x: number, z: number, typeName: string) {
  const color = ENEMY_TYPES[typeName] ? ENEMY_TYPES[typeName].color : 0xffffff;
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Ground ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.03;
  group.add(ring);

  // Fill circle
  const fillMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.y = 0.02;
  group.add(fill);

  // Type indicator — floating shape
  const typeGeo = typeGeos[typeName] || typeGeos.goblin;
  const typeMat = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.8,
  });
  const typeIndicator = new THREE.Mesh(typeGeo, typeMat);
  typeIndicator.position.y = 1.2;
  if (typeName === 'skeletonArcher') {
    typeIndicator.rotation.y = Math.PI / 4; // diamond rotation
  }
  group.add(typeIndicator);

  sceneRef.add(group);

  return {
    group,
    ring,
    ringMat,
    fill,
    fillMat,
    typeIndicator,
    typeMat,
    baseColor: color,
    time: 0,
  };
}

// progress: 0 = just appeared, 1 = about to spawn
export function updateTelegraph(telegraph: any, progress: number, dt: number) {
  telegraph.time += dt;

  // Fill circle: opacity ramps up with progress
  telegraph.fillMat.opacity = progress * 0.4;

  // Ring: pulse frequency increases with progress (2Hz → 10Hz)
  const freq = 2 + progress * 8;
  const pulse = 0.5 + 0.5 * Math.sin(telegraph.time * freq * Math.PI * 2);

  // Ring opacity: base 0.3 + pulse
  telegraph.ringMat.opacity = 0.3 + pulse * 0.5;

  // Ring scale: gentle breathing
  const scale = 1.0 + 0.1 * Math.sin(telegraph.time * freq * Math.PI * 2);
  telegraph.ring.scale.set(scale, 1, scale);

  // Flash white when close to spawning (>80%)
  if (progress > 0.8) {
    const flash = Math.sin(telegraph.time * 20) > 0.5;
    telegraph.ringMat.color.setHex(flash ? 0xffffff : telegraph.baseColor);
    telegraph.fillMat.color.setHex(flash ? 0xffffff : telegraph.baseColor);
  }

  // Type indicator: gentle bob
  telegraph.typeIndicator.position.y = 1.2 + 0.15 * Math.sin(telegraph.time * 2);
  telegraph.typeIndicator.rotation.y += dt * 1.5;
}

export function removeTelegraph(telegraph: any) {
  if (telegraph.group.parent) {
    sceneRef.remove(telegraph.group);
  }
  // Dispose cloned materials
  telegraph.ringMat.dispose();
  telegraph.fillMat.dispose();
  telegraph.typeMat.dispose();
}
