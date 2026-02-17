// Ground shadows — flat dark circles projected onto the ground below entities.
// Critical for height readability with isometric camera.
// Shadow stays on ground, shrinks/fades as entity rises.

import { getScene } from './renderer';
import { getPlayerPos, getPlayerGroup } from '../entities/player';
import { PHYSICS } from '../config/physics';
import { getGroundHeight } from '../config/terrain';
import type { GameState } from '../types/index';

let playerShadow: any = null;
const enemyShadows: Map<any, any> = new Map();
let shadowGeo: any = null;
let shadowMat: any = null;

function getShadowGeo() {
  if (!shadowGeo) {
    shadowGeo = new THREE.CircleGeometry(1, 16);
  }
  return shadowGeo;
}

function getShadowMat() {
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
  }
  return shadowMat;
}

function createShadowMesh(radius: number): any {
  const mesh = new THREE.Mesh(getShadowGeo(), getShadowMat().clone());
  mesh.rotation.x = -Math.PI / 2; // Lay flat on ground
  mesh.scale.set(radius * 0.8, radius * 0.8, 1);
  mesh.renderOrder = -1; // Render below everything
  return mesh;
}

function updateShadowForEntity(shadow: any, posX: number, posZ: number, posY: number, baseRadius: number) {
  const groundHeight = getGroundHeight(posX, posZ);
  const altitude = posY - groundHeight;

  shadow.position.x = posX;
  shadow.position.z = posZ;
  shadow.position.y = groundHeight + 0.01; // Slightly above ground

  // Scale: shrinks with altitude, min 30%
  const scale = Math.max(0.3, 1 - altitude * 0.1) * baseRadius * 0.8;
  shadow.scale.set(scale, scale, 1);

  // Opacity: fades with altitude, min 10%
  shadow.material.opacity = Math.max(0.1, 0.3 - altitude * 0.03);

  // Only visible when entity is above ground
  shadow.visible = altitude > PHYSICS.groundEpsilon || posY > 0;
}

export function initGroundShadows() {
  const scene = getScene();

  // Player shadow
  playerShadow = createShadowMesh(0.35); // PLAYER.size.radius
  scene.add(playerShadow);
}

export function updateGroundShadows(gameState: GameState) {
  const scene = getScene();

  // Update player shadow
  if (playerShadow) {
    const pp = getPlayerPos();
    updateShadowForEntity(playerShadow, pp.x, pp.z, pp.y, 0.35);
  }

  // Update enemy shadows — create on demand, remove when dead
  const activeEnemies = new Set<any>();
  for (const enemy of gameState.enemies) {
    if (enemy.health <= 0 && !enemyShadows.has(enemy)) continue;
    activeEnemies.add(enemy);

    let shadow = enemyShadows.get(enemy);
    if (!shadow) {
      shadow = createShadowMesh(enemy.config.size.radius);
      scene.add(shadow);
      enemyShadows.set(enemy, shadow);
    }

    if (enemy.health <= 0 || (enemy as any).fellInPit) {
      shadow.visible = false;
      continue;
    }

    updateShadowForEntity(shadow, enemy.pos.x, enemy.pos.z, enemy.pos.y, enemy.config.size.radius);
  }

  // Clean up shadows for removed enemies
  for (const [enemy, shadow] of enemyShadows) {
    if (!activeEnemies.has(enemy)) {
      scene.remove(shadow);
      shadow.material.dispose();
      enemyShadows.delete(enemy);
    }
  }
}

export function cleanupGroundShadows() {
  const scene = getScene();
  if (playerShadow) {
    scene.remove(playerShadow);
    playerShadow.material.dispose();
    playerShadow = null;
  }
  for (const [, shadow] of enemyShadows) {
    scene.remove(shadow);
    shadow.material.dispose();
  }
  enemyShadows.clear();
}
