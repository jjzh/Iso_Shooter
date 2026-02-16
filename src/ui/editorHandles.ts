// Editor Handles — draggable resize cubes for obstacles and pits
// Shows colored cubes at edges of selected object. Drag to resize.

import { getCamera } from '../engine/renderer';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HandleData {
  axis: 'x' | 'z' | 'y';
  sign: 1 | -1;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let sceneRef: any = null;
let handleMeshes: any[] = [];
let grabbedHandle: HandleData | null = null;

let handleSize = 0.3;
const HANDLE_SIZE_NORMAL = 0.3;
const HANDLE_SIZE_RESIZE = 0.6;
const HANDLE_COLORS: Record<string, number> = {
  x: 0xff4444,   // red
  z: 0x4444ff,   // blue
  y: 0x44ff44,   // green
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export function initHandles(scene: any): void {
  sceneRef = scene;
}

export function setResizeMode(on: boolean): void {
  handleSize = on ? HANDLE_SIZE_RESIZE : HANDLE_SIZE_NORMAL;
}

export function showHandles(entity: any, type: 'obstacle' | 'pit'): void {
  clearHandles();
  if (!sceneRef) return;
  addHandlesForEntity(entity, type);
}

/** Show handles on ALL obstacles and pits at once (dimmed), so everything looks editable */
export function showAllHandles(obstacles: any[], pits: any[]): void {
  clearHandles();
  if (!sceneRef) return;
  for (const o of obstacles) addHandlesForEntity(o, 'obstacle', 0.35);
  for (const p of pits) addHandlesForEntity(p, 'pit', 0.35);
}

function addHandlesForEntity(entity: any, type: 'obstacle' | 'pit', opacity = 0.8): void {
  const x = entity.x as number;
  const z = entity.z as number;
  const w = entity.w as number;
  const d = entity.d as number;
  const h = type === 'obstacle' ? (entity.h as number) : 0;
  const baseY = type === 'obstacle' ? h / 2 : 0.15;

  // +X, -X edge handles
  addHandle(x + w / 2, baseY, z, 'x', 1, opacity);
  addHandle(x - w / 2, baseY, z, 'x', -1, opacity);

  // +Z, -Z edge handles
  addHandle(x, baseY, z + d / 2, 'z', 1, opacity);
  addHandle(x, baseY, z - d / 2, 'z', -1, opacity);

  // +Y handle (height) — only for obstacles
  if (type === 'obstacle') {
    addHandle(x, h, z, 'y', 1, opacity);
  }
}

export function clearHandles(): void {
  for (const mesh of handleMeshes) {
    if (sceneRef) sceneRef.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  handleMeshes = [];
}

export function raycastHandles(ndc: { x: number; y: number }): boolean {
  if (handleMeshes.length === 0) return false;

  const camera = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

  const intersects = raycaster.intersectObjects(handleMeshes, false);
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    grabbedHandle = hitMesh.userData.handleData as HandleData;
    return true;
  }
  return false;
}

export function getGrabbedHandle(): HandleData | null {
  return grabbedHandle;
}

export function releaseHandle(): void {
  grabbedHandle = null;
}

/** In resize mode, pick the nearest handle to the given world position */
export function grabNearestHandle(worldX: number, worldZ: number): boolean {
  if (handleMeshes.length === 0) return false;
  let bestDist = Infinity;
  let bestHandle: HandleData | null = null;
  for (const mesh of handleMeshes) {
    const dx = mesh.position.x - worldX;
    const dz = mesh.position.z - worldZ;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      bestHandle = mesh.userData.handleData as HandleData;
    }
  }
  if (bestHandle) {
    grabbedHandle = bestHandle;
    return true;
  }
  return false;
}

export function updateHandlePositions(entity: any, type: 'obstacle' | 'pit'): void {
  // Faster to just rebuild — only 4-5 meshes
  const savedGrab = grabbedHandle;
  showHandles(entity, type);
  grabbedHandle = savedGrab; // preserve grab state across rebuild
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNALS
// ═══════════════════════════════════════════════════════════════════════════

function addHandle(px: number, py: number, pz: number, axis: 'x' | 'z' | 'y', sign: 1 | -1, opacity = 0.8): void {
  const geo = new THREE.BoxGeometry(handleSize, handleSize, handleSize);
  const mat = new THREE.MeshBasicMaterial({
    color: HANDLE_COLORS[axis],
    transparent: true,
    opacity,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(px, py, pz);
  mesh.userData.handleData = { axis, sign } as HandleData;

  sceneRef.add(mesh);
  handleMeshes.push(mesh);
}
