// Dynamic Hazard Spawns — ~50% of enemy packs also spawn a small pit nearby
// Gives player push kill opportunities. Pits appear with telegraph, then materialize.

import { PITS } from '../config/arena';
import { invalidateCollisionBounds, getBounds, getPits } from './physics';
import { emit } from './events';

export const HAZARD_CONFIG = {
  spawnChance: 0.5,         // probability of spawning a pit per pack
  pitWidth: 2.5,            // pit width
  pitDepth: 2.5,            // pit depth (Z)
  telegraphDuration: 800,   // ms — warning before pit materializes
  offsetRange: 3,           // max offset from pack center
};

let sceneRef: any = null;

// Active telegraphs — pits being warned before they appear
interface PitTelegraph {
  x: number;
  z: number;
  w: number;
  d: number;
  timer: number;            // ms remaining
  meshGroup: any;           // visual telegraph meshes
}

const activeTelegraphs: PitTelegraph[] = [];

// Materialized dynamic pit visuals (need cleanup when room changes)
const dynamicPitVisuals: any[] = [];

export function initDynamicHazards(scene: any) {
  sceneRef = scene;
}

/**
 * Try to spawn a hazard pit near a pack center.
 * Called after pack enemies spawn (telegraph expired).
 */
export function trySpawnHazard(centerX: number, centerZ: number) {
  if (Math.random() > HAZARD_CONFIG.spawnChance) return;

  // Pick a random offset position near the pack center
  const angle = Math.random() * Math.PI * 2;
  const dist = 1 + Math.random() * HAZARD_CONFIG.offsetRange;
  const px = centerX + Math.cos(angle) * dist;
  const pz = centerZ + Math.sin(angle) * dist;

  const w = HAZARD_CONFIG.pitWidth;
  const d = HAZARD_CONFIG.pitDepth;

  // Validate: not inside existing obstacle or pit
  if (isInsideExistingObstacle(px, pz, w, d)) return;
  if (isInsideExistingPit(px, pz, w, d)) return;

  // Create telegraph visual
  const meshGroup = createTelegraphVisual(px, pz, w, d);

  activeTelegraphs.push({
    x: px,
    z: pz,
    w,
    d,
    timer: HAZARD_CONFIG.telegraphDuration,
    meshGroup,
  });
}

/**
 * Update active hazard telegraphs. When expired, materialize the pit.
 */
export function updateDynamicHazards(dt: number) {
  for (let i = activeTelegraphs.length - 1; i >= 0; i--) {
    const tg = activeTelegraphs[i];
    tg.timer -= dt * 1000;

    // Update telegraph visual — pulsing
    if (tg.meshGroup) {
      const progress = 1 - tg.timer / HAZARD_CONFIG.telegraphDuration;
      const pulse = 0.3 + 0.4 * Math.sin(performance.now() * 0.01);
      // Scale up slightly as it approaches materialization
      const scale = 0.5 + 0.5 * progress;
      tg.meshGroup.scale.set(scale, 1, scale);
      // Opacity ramps up
      tg.meshGroup.children.forEach((child: any) => {
        if (child.material) {
          child.material.opacity = pulse * progress;
        }
      });
    }

    if (tg.timer <= 0) {
      // Remove telegraph visual
      if (tg.meshGroup && sceneRef) {
        sceneRef.remove(tg.meshGroup);
        tg.meshGroup.traverse((child: any) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }

      // Materialize the pit — add to PITS array
      PITS.push({ x: tg.x, z: tg.z, w: tg.w, d: tg.d });
      invalidateCollisionBounds();

      // Create pit visuals (replicating renderer.ts pit visual pattern)
      createPitVisual(tg.x, tg.z, tg.w, tg.d);

      emit({ type: 'dynamicPitSpawned', position: { x: tg.x, z: tg.z } });

      activeTelegraphs.splice(i, 1);
    }
  }
}

/**
 * Clear all dynamic hazards — called when room changes.
 * Note: PITS array is cleared by setArenaConfig in loadRoom.
 */
export function clearDynamicHazards() {
  // Remove telegraph visuals
  for (const tg of activeTelegraphs) {
    if (tg.meshGroup && sceneRef) {
      sceneRef.remove(tg.meshGroup);
      tg.meshGroup.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  }
  activeTelegraphs.length = 0;

  // Remove dynamic pit visuals
  for (const mesh of dynamicPitVisuals) {
    if (sceneRef) {
      sceneRef.remove(mesh);
    }
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  dynamicPitVisuals.length = 0;
}

// ─── Helpers ───

function isInsideExistingObstacle(x: number, z: number, w: number, d: number): boolean {
  const bounds = getBounds();
  const obstacleCount = bounds.length - 4; // last 4 are walls
  const hw = w / 2, hd = d / 2;
  for (let i = 0; i < obstacleCount; i++) {
    const b = bounds[i];
    // Check AABB overlap
    if (x + hw > b.minX && x - hw < b.maxX && z + hd > b.minZ && z - hd < b.maxZ) {
      return true;
    }
  }
  return false;
}

function isInsideExistingPit(x: number, z: number, w: number, d: number): boolean {
  const pits = getPits();
  const hw = w / 2, hd = d / 2;
  for (const p of pits) {
    if (x + hw > p.minX && x - hw < p.maxX && z + hd > p.minZ && z - hd < p.maxZ) {
      return true;
    }
  }
  return false;
}

function createTelegraphVisual(x: number, z: number, w: number, d: number): any {
  const group = new THREE.Group();
  group.position.set(x, 0.03, z);

  // Pulsing red outline
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0xff2244,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Ring / border
  const ringGeo = new THREE.PlaneGeometry(w, d);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.Mesh(ringGeo, outlineMat);
  group.add(ringMesh);

  // Filled area (darker)
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x880022,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fillGeo = new THREE.PlaneGeometry(w * 0.9, d * 0.9);
  fillGeo.rotateX(-Math.PI / 2);
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  group.add(fillMesh);

  sceneRef.add(group);
  return group;
}

function createPitVisual(x: number, z: number, w: number, d: number) {
  const edgeThickness = 0.08;
  const edgeHeight = 0.02;

  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0xff2244,
    transparent: true,
    opacity: 0.8,
  });

  // Dark void floor
  const voidMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  voidMesh.rotation.x = -Math.PI / 2;
  voidMesh.position.set(x, -0.05, z);
  sceneRef.add(voidMesh);
  dynamicPitVisuals.push(voidMesh);

  // North edge
  const nEdge = new THREE.Mesh(
    new THREE.BoxGeometry(w + edgeThickness * 2, edgeHeight, edgeThickness),
    edgeMat
  );
  nEdge.position.set(x, 0.01, z + d / 2);
  sceneRef.add(nEdge);
  dynamicPitVisuals.push(nEdge);

  // South edge
  const sEdge = new THREE.Mesh(
    new THREE.BoxGeometry(w + edgeThickness * 2, edgeHeight, edgeThickness),
    edgeMat
  );
  sEdge.position.set(x, 0.01, z - d / 2);
  sceneRef.add(sEdge);
  dynamicPitVisuals.push(sEdge);

  // East edge
  const eEdge = new THREE.Mesh(
    new THREE.BoxGeometry(edgeThickness, edgeHeight, d),
    edgeMat
  );
  eEdge.position.set(x + w / 2, 0.01, z);
  sceneRef.add(eEdge);
  dynamicPitVisuals.push(eEdge);

  // West edge
  const wEdge = new THREE.Mesh(
    new THREE.BoxGeometry(edgeThickness, edgeHeight, d),
    edgeMat
  );
  wEdge.position.set(x - w / 2, 0.01, z);
  sceneRef.add(wEdge);
  dynamicPitVisuals.push(wEdge);
}
