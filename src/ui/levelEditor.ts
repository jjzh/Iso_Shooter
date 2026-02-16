// Level Editor — visual tool for placing obstacles, physics objects, and pits
// Toggle with Shift+` (Shift+Backquote). Pauses gameplay while editing.
// Tasks 8 (core), 9 (click/drag/place), 10 (property panel).

import { getScene, getCamera, rebuildArenaVisuals } from '../engine/renderer';
import { OBSTACLES, PITS, ARENA_HALF_X, ARENA_HALF_Z } from '../config/arena';
import { invalidateCollisionBounds } from '../engine/physics';
import { createPhysicsObject, createPhysicsObjectMesh, clearPhysicsObjects, applyBendVisuals, clearBendVisuals } from '../entities/physicsObject';
import { isEditorActive as isSpawnEditorActive } from './spawnEditor';
import { initHandles, showHandles, showAllHandles, clearHandles, raycastHandles, getGrabbedHandle, releaseHandle, updateHandlePositions, setResizeMode, grabNearestHandle } from './editorHandles';
import { createBendSystem } from '../engine/bendSystem';
import { BENDS, getBendById } from '../config/bends';
import type { Obstacle, Pit, PhysicsObject, PhysicsObjectPlacement } from '../types/index';

// ═══════════════════════════════════════════════════════════════════════════
// MODULE STATE
// ═══════════════════════════════════════════════════════════════════════════

let sceneRef: any;
let gameStateRef: any;

let active = false;
let previousPhase = 'playing';

// Editor mode and selection
let mode: 'obstacle' | 'physics' | 'pit' = 'obstacle';
let selectedType: 'obstacle' | 'physics' | 'pit' | null = null;
let selectedIdx = -1;

// Drag state
let isDragging = false;
let dragStarted = false;
let dragStartWorld: { x: number; z: number } | null = null;
let dragUndoPushed = false;

// Handle resize state
let handleUndoPushed = false;
let resizeMode = false;

// Track mouse position for hotkeys (B = quick-place block)
let lastMouseNDC: { x: number; y: number } = { x: 0, y: 0 };

// Bend preview state
let bendPreviewActive = false;
let bendPreviewSystem: ReturnType<typeof createBendSystem> | null = null;
let selectedBendId: string = BENDS[0]?.id ?? 'enlarge';
let bendPreviewBtn: HTMLButtonElement;
let bendSelectorEl: HTMLDivElement;

// DOM elements
let barEl: HTMLDivElement;
let panelEl: HTMLDivElement;
let panelContent: HTMLDivElement;
let modeBtns: HTMLButtonElement[] = [];

// Selection visual (THREE.js object in scene)
let selectionVisual: any = null;

// ═══════════════════════════════════════════════════════════════════════════
// UNDO / REDO
// ═══════════════════════════════════════════════════════════════════════════

const undoStack: any[] = [];
const redoStack: any[] = [];
const MAX_UNDO = 50;

function snapshotState() {
  return {
    obstacles: JSON.parse(JSON.stringify(OBSTACLES)),
    pits: JSON.parse(JSON.stringify(PITS)),
    physicsObjects: gameStateRef.physicsObjects.map((o: PhysicsObject) => ({
      meshType: o.meshType,
      material: o.material,
      x: o.pos.x,
      z: o.pos.z,
      mass: o.mass,
      health: o.health,
      radius: o.radius,
      scale: o.scale,
    })),
    selectedType,
    selectedIdx,
  };
}

function pushUndo() {
  undoStack.push(snapshotState());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

function applySnapshot(snap: any) {
  OBSTACLES.length = 0;
  for (const o of snap.obstacles) OBSTACLES.push(o);
  PITS.length = 0;
  for (const p of snap.pits) PITS.push(p);
  // Rebuild physics objects from snapshot
  clearPhysicsObjects(gameStateRef, sceneRef);
  for (const p of snap.physicsObjects) {
    const obj = createPhysicsObject(p);
    createPhysicsObjectMesh(obj, sceneRef);
    gameStateRef.physicsObjects.push(obj);
  }
  selectedType = snap.selectedType;
  selectedIdx = snap.selectedIdx;
  onArenaChanged();
  updateSelectionVisuals();
  updatePropertyPanel();
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(snapshotState());
  applySnapshot(undoStack.pop());
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(snapshotState());
  applySnapshot(redoStack.pop());
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════════════════

function exportRoomJSON(): void {
  const room = {
    name: 'Exported Room',
    arenaHalfX: ARENA_HALF_X,
    arenaHalfZ: ARENA_HALF_Z,
    obstacles: OBSTACLES.map(o => ({ ...o })),
    pits: PITS.map(p => ({ ...p })),
    physicsObjects: gameStateRef.physicsObjects.map((obj: any) => ({
      meshType: obj.meshType,
      material: obj.material,
      x: obj.pos.x,
      z: obj.pos.z,
      mass: obj.mass,
      health: obj.maxHealth,
      radius: obj.radius,
      scale: obj.scale,
    })),
    spawnBudget: { packs: [] },
    playerStart: { x: 0, z: 0 },
  };

  const json = JSON.stringify(room, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    // Brief confirmation flash in the title bar
    const titleSpan = barEl.querySelector('span');
    if (titleSpan) {
      const original = titleSpan.textContent;
      titleSpan.textContent = 'COPIED! — ';
      setTimeout(() => { titleSpan.textContent = original; }, 1200);
    }
  });
}

function importRoomJSON(): void {
  const json = window.prompt('Paste room JSON:');
  if (!json) return;

  let room: any;
  try {
    room = JSON.parse(json);
  } catch {
    window.alert('Invalid JSON');
    return;
  }

  pushUndo();

  // Replace obstacles
  OBSTACLES.length = 0;
  if (Array.isArray(room.obstacles)) {
    for (const o of room.obstacles) OBSTACLES.push(o);
  }

  // Replace pits
  PITS.length = 0;
  if (Array.isArray(room.pits)) {
    for (const p of room.pits) PITS.push(p);
  }

  // Replace physics objects
  clearPhysicsObjects(gameStateRef, sceneRef);
  if (Array.isArray(room.physicsObjects)) {
    for (const p of room.physicsObjects) {
      const obj = createPhysicsObject(p);
      createPhysicsObjectMesh(obj, sceneRef);
      gameStateRef.physicsObjects.push(obj);
    }
  }

  selectedType = null;
  selectedIdx = -1;
  onArenaChanged();
  updateSelectionVisuals();
  updatePropertyPanel();
}

// ═══════════════════════════════════════════════════════════════════════════
// BEND PREVIEW
// ═══════════════════════════════════════════════════════════════════════════

function updateBendSelectorHighlight(): void {
  const btns = bendSelectorEl.querySelectorAll('button');
  btns.forEach((btn: any) => {
    btn.style.background = btn.dataset.bendId === selectedBendId ? '#336699' : '';
  });
}

function toggleBendPreview(): void {
  bendPreviewActive = !bendPreviewActive;
  if (bendPreviewActive) {
    bendPreviewSystem = createBendSystem(99);
    bendPreviewBtn.textContent = 'Preview ON';
    bendPreviewBtn.style.background = '#228844';
    bendSelectorEl.style.display = 'flex';
    updateBendSelectorHighlight();
  } else {
    // Reset all preview bends
    if (bendPreviewSystem) {
      bendPreviewSystem.resetAll();
      // Restore visuals on all physics objects
      for (const obj of gameStateRef.physicsObjects) {
        clearBendVisuals(obj);
      }
      bendPreviewSystem = null;
    }
    bendPreviewBtn.textContent = 'Preview Bends';
    bendPreviewBtn.style.background = '';
    bendSelectorEl.style.display = 'none';
  }
}

function applyBendPreviewToTarget(ndc: { x: number; y: number }): boolean {
  if (!bendPreviewActive || !bendPreviewSystem) return false;

  // Only apply to physics objects — raycast scene to find one
  const camera = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);

  for (const obj of gameStateRef.physicsObjects) {
    if (!obj.mesh || obj.destroyed) continue;
    const intersects = raycaster.intersectObject(obj.mesh, true);
    if (intersects.length > 0) {
      const bend = getBendById(selectedBendId);
      if (!bend) return false;
      const result = bendPreviewSystem.applyBend(selectedBendId, 'physicsObject', obj);
      if (result.success) {
        applyBendVisuals(obj, bend.tintColor);
      }
      return true; // consumed the click
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function onArenaChanged() {
  rebuildArenaVisuals();
  invalidateCollisionBounds();
}

function snap(v: number): number {
  return Math.round(v * 2) / 2;
}

function mouseToWorld(mouseNDC: { x: number; y: number }): { x: number; z: number } {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(mouseNDC.x, mouseNDC.y);
  raycaster.setFromCamera(ndc, getCamera());
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  return { x: target.x, z: target.z };
}

function clientToNDC(e: MouseEvent): { x: number; y: number } {
  return {
    x: (e.clientX / window.innerWidth) * 2 - 1,
    y: -(e.clientY / window.innerHeight) * 2 + 1,
  };
}

function clearChildren(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTION VISUALS
// ═══════════════════════════════════════════════════════════════════════════

function clearSelectionVisual() {
  if (selectionVisual) {
    sceneRef.remove(selectionVisual);
    selectionVisual.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    selectionVisual = null;
  }
}

function updateSelectionVisuals() {
  clearSelectionVisual();
  clearHandles();

  // Orange outline in resize mode, green in normal mode
  const outlineColor = resizeMode ? 0xff8844 : 0x44ff44;

  if (selectedType === 'obstacle' && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    const o = OBSTACLES[selectedIdx];
    const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: outlineColor });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(o.x, o.h / 2, o.z);
    sceneRef.add(lines);
    selectionVisual = lines;
    geo.dispose();
    showHandles(o, 'obstacle');
  } else if (selectedType === 'physics' && selectedIdx >= 0 && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj = gameStateRef.physicsObjects[selectedIdx];
    const r = obj.radius;
    const ringGeo = new THREE.RingGeometry(r - 0.05, r + 0.05, 32);
    const mat = new THREE.LineBasicMaterial({ color: outlineColor });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(obj.pos.x, 0.05, obj.pos.z);
    sceneRef.add(ring);
    selectionVisual = ring;
  } else if (selectedType === 'pit' && selectedIdx >= 0 && selectedIdx < PITS.length) {
    const p = PITS[selectedIdx];
    const geo = new THREE.BoxGeometry(p.w, 0.2, p.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: outlineColor });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(p.x, 0.1, p.z);
    sceneRef.add(lines);
    selectionVisual = lines;
    geo.dispose();
    showHandles(p, 'pit');
  } else {
    // Nothing selected — show dimmed handles on ALL terrain so it's clear they're editable
    showAllHandles(OBSTACLES, PITS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY PANEL (Task 10)
// ═══════════════════════════════════════════════════════════════════════════

function addNumberField(
  container: HTMLElement, label: string, value: number,
  onChange: (v: number) => void, min?: number, max?: number, step?: number
): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:4px 0';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.style.cssText = 'color:#ccc;font-size:12px';
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.value = String(value);
  inp.style.cssText = 'width:70px;background:#333;color:#fff;border:1px solid #555;padding:2px 4px;font-size:12px';
  if (min !== undefined) inp.min = String(min);
  if (max !== undefined) inp.max = String(max);
  if (step !== undefined) inp.step = String(step);
  inp.addEventListener('change', () => {
    pushUndo();
    onChange(parseFloat(inp.value));
    updateSelectionVisuals();
  });
  row.appendChild(lbl);
  row.appendChild(inp);
  container.appendChild(row);
}

function addDropdown(
  container: HTMLElement, label: string, value: string,
  options: string[], onChange: (v: string) => void
): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:4px 0';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.style.cssText = 'color:#ccc;font-size:12px';
  const sel = document.createElement('select');
  sel.style.cssText = 'width:80px;background:#333;color:#fff;border:1px solid #555;padding:2px 4px;font-size:12px';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    pushUndo();
    onChange(sel.value);
    updateSelectionVisuals();
  });
  row.appendChild(lbl);
  row.appendChild(sel);
  container.appendChild(row);
}

function addCheckbox(
  container: HTMLElement, label: string, checked: boolean,
  onChange: (v: boolean) => void
): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:4px 0';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  lbl.style.cssText = 'color:#ccc;font-size:12px';
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = checked;
  inp.style.cssText = 'accent-color:#4f4';
  inp.addEventListener('change', () => {
    pushUndo();
    onChange(inp.checked);
    // Rebuild panel to show/hide conditional fields
    updatePropertyPanel();
    updateSelectionVisuals();
  });
  row.appendChild(lbl);
  row.appendChild(inp);
  container.appendChild(row);
}

function addSectionHeader(container: HTMLElement, text: string): void {
  const h = document.createElement('div');
  h.textContent = text;
  h.style.cssText = 'color:#4f4;font-size:13px;font-weight:bold;margin:8px 0 4px;border-bottom:1px solid #444;padding-bottom:2px';
  container.appendChild(h);
}

function rebuildPhysicsObjectMesh(obj: PhysicsObject) {
  if (obj.mesh) {
    sceneRef.remove(obj.mesh);
    obj.mesh.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    obj.mesh = null;
  }
  createPhysicsObjectMesh(obj, sceneRef);
}

function updatePropertyPanel() {
  clearChildren(panelContent);

  if (selectedType === 'obstacle' && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    const o = OBSTACLES[selectedIdx];
    addSectionHeader(panelContent, 'Obstacle');

    addNumberField(panelContent, 'X', o.x, (v) => { o.x = v; onArenaChanged(); }, undefined, undefined, 0.5);
    addNumberField(panelContent, 'Z', o.z, (v) => { o.z = v; onArenaChanged(); }, undefined, undefined, 0.5);
    addNumberField(panelContent, 'Width', o.w, (v) => { o.w = v; onArenaChanged(); }, 0.5, undefined, 0.5);
    addNumberField(panelContent, 'Height', o.h, (v) => { o.h = v; onArenaChanged(); }, 0.5, undefined, 0.5);
    addNumberField(panelContent, 'Depth', o.d, (v) => { o.d = v; onArenaChanged(); }, 0.5, undefined, 0.5);

    addCheckbox(panelContent, 'Destructible', !!o.destructible, (v) => {
      o.destructible = v;
      if (v && !o.health) {
        o.health = 50;
        o.maxHealth = 50;
      }
      onArenaChanged();
    });

    if (o.destructible) {
      addNumberField(panelContent, 'Health', o.health ?? 50, (v) => {
        o.health = v;
        o.maxHealth = v;
        onArenaChanged();
      }, 1, undefined, 1);
    }

    addDropdown(panelContent, 'Material', o.material || 'stone', ['stone', 'wood', 'metal', 'ice'], (v) => {
      o.material = v as any;
      onArenaChanged();
    });

  } else if (selectedType === 'physics' && selectedIdx >= 0 && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj: PhysicsObject = gameStateRef.physicsObjects[selectedIdx];
    addSectionHeader(panelContent, 'Physics Object');

    addNumberField(panelContent, 'X', obj.pos.x, (v) => {
      obj.pos.x = v;
      if (obj.mesh) obj.mesh.position.x = v;
    }, undefined, undefined, 0.5);
    addNumberField(panelContent, 'Z', obj.pos.z, (v) => {
      obj.pos.z = v;
      if (obj.mesh) obj.mesh.position.z = v;
    }, undefined, undefined, 0.5);

    addDropdown(panelContent, 'Mesh Type', obj.meshType, ['rock', 'crate', 'barrel', 'pillar'], (v) => {
      obj.meshType = v as any;
      rebuildPhysicsObjectMesh(obj);
    });
    addDropdown(panelContent, 'Material', obj.material, ['stone', 'wood', 'metal', 'ice'], (v) => {
      obj.material = v as any;
      rebuildPhysicsObjectMesh(obj);
    });

    addNumberField(panelContent, 'Mass', obj.mass, (v) => { obj.mass = v; }, 0.1, 50, 0.1);
    addNumberField(panelContent, 'Health', obj.health, (v) => {
      obj.health = v;
      obj.maxHealth = v;
    }, 1, 9999, 1);
    addNumberField(panelContent, 'Radius', obj.radius, (v) => {
      obj.radius = v;
      rebuildPhysicsObjectMesh(obj);
    }, 0.1, 5, 0.1);

  } else if (selectedType === 'pit' && selectedIdx >= 0 && selectedIdx < PITS.length) {
    const p = PITS[selectedIdx];
    addSectionHeader(panelContent, 'Pit');

    addNumberField(panelContent, 'X', p.x, (v) => { p.x = v; onArenaChanged(); }, undefined, undefined, 0.5);
    addNumberField(panelContent, 'Z', p.z, (v) => { p.z = v; onArenaChanged(); }, undefined, undefined, 0.5);
    addNumberField(panelContent, 'Width', p.w, (v) => { p.w = v; onArenaChanged(); }, 0.5, undefined, 0.5);
    addNumberField(panelContent, 'Depth', p.d, (v) => { p.d = v; onArenaChanged(); }, 0.5, undefined, 0.5);

  } else {
    const hint = document.createElement('div');
    hint.textContent = 'Click to place or select';
    hint.style.cssText = 'color:#666;font-size:11px;text-align:center;margin-top:20px';
    panelContent.appendChild(hint);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HIT TESTING (Task 9)
// ═══════════════════════════════════════════════════════════════════════════

function hitTestPhysics(wx: number, wz: number): number {
  for (let i = 0; i < gameStateRef.physicsObjects.length; i++) {
    const obj = gameStateRef.physicsObjects[i];
    if (obj.destroyed) continue;
    const dx = wx - obj.pos.x;
    const dz = wz - obj.pos.z;
    if (dx * dx + dz * dz < obj.radius * obj.radius) return i;
  }
  return -1;
}

function hitTestObstacle(wx: number, wz: number): number {
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    if (Math.abs(wx - o.x) < o.w / 2 && Math.abs(wz - o.z) < o.d / 2) return i;
  }
  return -1;
}

/** 3D ray-box hit test for obstacles — works regardless of which face you click */
function hitTestObstacle3D(ndc: { x: number; y: number }): number {
  const camera = getCamera();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const ray = raycaster.ray;

  let bestDist = Infinity;
  let bestIdx = -1;

  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const box = new THREE.Box3(
      new THREE.Vector3(o.x - o.w / 2, 0, o.z - o.d / 2),
      new THREE.Vector3(o.x + o.w / 2, o.h, o.z + o.d / 2),
    );
    const hit = ray.intersectBox(box, new THREE.Vector3());
    if (hit) {
      const dist = hit.distanceTo(ray.origin);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

function hitTestPit(wx: number, wz: number): number {
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    if (Math.abs(wx - p.x) < p.w / 2 && Math.abs(wz - p.z) < p.d / 2) return i;
  }
  return -1;
}

interface HitResult { type: 'obstacle' | 'physics' | 'pit'; idx: number }

function hitTestAll3D(ndc: { x: number; y: number }, wx: number, wz: number): HitResult | null {
  // Search current mode first, then others
  const order: Array<'obstacle' | 'physics' | 'pit'> =
    mode === 'obstacle' ? ['obstacle', 'physics', 'pit'] :
    mode === 'physics'  ? ['physics', 'obstacle', 'pit'] :
                          ['pit', 'obstacle', 'physics'];

  for (const t of order) {
    let idx = -1;
    if (t === 'obstacle') idx = hitTestObstacle3D(ndc);
    else if (t === 'physics') idx = hitTestPhysics(wx, wz);
    else idx = hitTestPit(wx, wz);
    if (idx >= 0) return { type: t, idx };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLACEMENT (Task 9)
// ═══════════════════════════════════════════════════════════════════════════

function placeNewObject(wx: number, wz: number) {
  const sx = snap(wx);
  const sz = snap(wz);

  if (mode === 'obstacle') {
    pushUndo();
    OBSTACLES.push({ x: sx, z: sz, w: 2, h: 2, d: 2 });
    selectedType = 'obstacle';
    selectedIdx = OBSTACLES.length - 1;
    onArenaChanged();
  } else if (mode === 'physics') {
    pushUndo();
    const placement: PhysicsObjectPlacement = {
      meshType: 'rock', material: 'stone',
      x: sx, z: sz,
      mass: 2.0, health: 9999, radius: 0.8,
    };
    const obj = createPhysicsObject(placement);
    createPhysicsObjectMesh(obj, sceneRef);
    gameStateRef.physicsObjects.push(obj);
    selectedType = 'physics';
    selectedIdx = gameStateRef.physicsObjects.length - 1;
  } else if (mode === 'pit') {
    pushUndo();
    PITS.push({ x: sx, z: sz, w: 3, d: 3 });
    selectedType = 'pit';
    selectedIdx = PITS.length - 1;
    onArenaChanged();
  }

  updateSelectionVisuals();
  updatePropertyPanel();
}

function deleteSelected() {
  if (selectedType === null || selectedIdx < 0) return;
  pushUndo();

  if (selectedType === 'obstacle' && selectedIdx < OBSTACLES.length) {
    OBSTACLES.splice(selectedIdx, 1);
    onArenaChanged();
  } else if (selectedType === 'physics' && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj = gameStateRef.physicsObjects[selectedIdx];
    if (obj.mesh) {
      sceneRef.remove(obj.mesh);
      obj.mesh.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    gameStateRef.physicsObjects.splice(selectedIdx, 1);
  } else if (selectedType === 'pit' && selectedIdx < PITS.length) {
    PITS.splice(selectedIdx, 1);
    onArenaChanged();
  }

  selectedType = null;
  selectedIdx = -1;
  updateSelectionVisuals();
  updatePropertyPanel();
}

function deleteNearest(wx: number, wz: number) {
  let bestDist = 3.0;
  let bestType: 'obstacle' | 'physics' | 'pit' | null = null;
  let bestIdx = -1;

  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const d = Math.sqrt((wx - o.x) ** 2 + (wz - o.z) ** 2);
    if (d < bestDist) { bestDist = d; bestType = 'obstacle'; bestIdx = i; }
  }
  for (let i = 0; i < gameStateRef.physicsObjects.length; i++) {
    const o = gameStateRef.physicsObjects[i];
    if (o.destroyed) continue;
    const d = Math.sqrt((wx - o.pos.x) ** 2 + (wz - o.pos.z) ** 2);
    if (d < bestDist) { bestDist = d; bestType = 'physics'; bestIdx = i; }
  }
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    const d = Math.sqrt((wx - p.x) ** 2 + (wz - p.z) ** 2);
    if (d < bestDist) { bestDist = d; bestType = 'pit'; bestIdx = i; }
  }

  if (bestType === null) return;

  // Select, then delete
  selectedType = bestType;
  selectedIdx = bestIdx;
  deleteSelected();
}

function duplicateSelected() {
  if (selectedType === null || selectedIdx < 0) return;
  pushUndo();

  if (selectedType === 'obstacle' && selectedIdx < OBSTACLES.length) {
    const src = OBSTACLES[selectedIdx];
    const copy: Obstacle = { ...src, x: src.x + 1 };
    if (copy.health !== undefined) copy.maxHealth = copy.health;
    OBSTACLES.push(copy);
    selectedIdx = OBSTACLES.length - 1;
    onArenaChanged();
  } else if (selectedType === 'physics' && selectedIdx < gameStateRef.physicsObjects.length) {
    const src = gameStateRef.physicsObjects[selectedIdx];
    const placement: PhysicsObjectPlacement = {
      meshType: src.meshType, material: src.material,
      x: src.pos.x + 1, z: src.pos.z,
      mass: src.mass, health: src.health, radius: src.radius,
      scale: src.scale,
    };
    const obj = createPhysicsObject(placement);
    createPhysicsObjectMesh(obj, sceneRef);
    gameStateRef.physicsObjects.push(obj);
    selectedIdx = gameStateRef.physicsObjects.length - 1;
  } else if (selectedType === 'pit' && selectedIdx < PITS.length) {
    const src = PITS[selectedIdx];
    PITS.push({ ...src, x: src.x + 1 });
    selectedIdx = PITS.length - 1;
    onArenaChanged();
  }

  updateSelectionVisuals();
  updatePropertyPanel();
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLE RESIZE (Task 11)
// ═══════════════════════════════════════════════════════════════════════════

const MIN_DIM = 0.5;

function resizeWithHandle(handle: { axis: 'x' | 'z' | 'y'; sign: 1 | -1 }, ndc: { x: number; y: number }): void {
  if (handle.axis === 'x' || handle.axis === 'z') {
    // Ground-plane raycasting for X/Z resize
    const w = mouseToWorld(ndc);

    if (handle.axis === 'x') {
      if (selectedType === 'obstacle' && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
        const o = OBSTACLES[selectedIdx];
        const fixedEdge = o.x - handle.sign * o.w / 2;
        const rawEdge = snap(w.x);
        // Clamp so dragged edge can't cross the fixed edge
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newW = Math.abs(newEdge - fixedEdge);
        o.x = fixedEdge + handle.sign * newW / 2;
        o.w = newW;
        onArenaChanged();
        updateHandlePositions(o, 'obstacle');
      } else if (selectedType === 'pit' && selectedIdx >= 0 && selectedIdx < PITS.length) {
        const p = PITS[selectedIdx];
        const fixedEdge = p.x - handle.sign * p.w / 2;
        const rawEdge = snap(w.x);
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newW = Math.abs(newEdge - fixedEdge);
        p.x = fixedEdge + handle.sign * newW / 2;
        p.w = newW;
        onArenaChanged();
        updateHandlePositions(p, 'pit');
      }
    } else {
      // axis === 'z'
      if (selectedType === 'obstacle' && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
        const o = OBSTACLES[selectedIdx];
        const fixedEdge = o.z - handle.sign * o.d / 2;
        const rawEdge = snap(w.z);
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newD = Math.abs(newEdge - fixedEdge);
        o.z = fixedEdge + handle.sign * newD / 2;
        o.d = newD;
        onArenaChanged();
        updateHandlePositions(o, 'obstacle');
      } else if (selectedType === 'pit' && selectedIdx >= 0 && selectedIdx < PITS.length) {
        const p = PITS[selectedIdx];
        const fixedEdge = p.z - handle.sign * p.d / 2;
        const rawEdge = snap(w.z);
        const newEdge = handle.sign > 0 ? Math.max(fixedEdge + MIN_DIM, rawEdge) : Math.min(fixedEdge - MIN_DIM, rawEdge);
        const newD = Math.abs(newEdge - fixedEdge);
        p.z = fixedEdge + handle.sign * newD / 2;
        p.d = newD;
        onArenaChanged();
        updateHandlePositions(p, 'pit');
      }
    }
  } else if (handle.axis === 'y' && selectedType === 'obstacle') {
    // Camera-facing vertical plane for height resize
    const o = OBSTACLES[selectedIdx];
    const camera = getCamera();
    const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const handlePos = new THREE.Vector3(o.x, o.h, o.z);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, handlePos);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      const newH = Math.max(MIN_DIM, snap(intersection.y));
      o.h = newH;
      onArenaChanged();
      updateHandlePositions(o, 'obstacle');
    }
  }

  // Update green selection outline to match new size
  clearSelectionVisual();
  if (selectedType === 'obstacle' && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    const o = OBSTACLES[selectedIdx];
    const geo = new THREE.BoxGeometry(o.w, o.h, o.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0x44ff44 });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(o.x, o.h / 2, o.z);
    sceneRef.add(lines);
    selectionVisual = lines;
    geo.dispose();
  } else if (selectedType === 'pit' && selectedIdx >= 0 && selectedIdx < PITS.length) {
    const p = PITS[selectedIdx];
    const geo = new THREE.BoxGeometry(p.w, 0.2, p.d);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0x44ff44 });
    const lines = new THREE.LineSegments(edges, mat);
    lines.position.set(p.x, 0.1, p.z);
    sceneRef.add(lines);
    selectionVisual = lines;
    geo.dispose();
  }

  updatePropertyPanel();
}

// ═══════════════════════════════════════════════════════════════════════════
// MOUSE HANDLERS (Task 9)
// ═══════════════════════════════════════════════════════════════════════════

function onMouseDown(e: MouseEvent) {
  if (!active) return;

  const ndc = clientToNDC(e);
  const w = mouseToWorld(ndc);

  // Right-click or shift+click: delete nearest
  if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
    e.preventDefault();
    deleteNearest(w.x, w.z);
    return;
  }

  if (e.button !== 0) return;

  // Check resize handles first (before normal selection)
  if (raycastHandles(ndc)) {
    handleUndoPushed = false;
    return;
  }

  // Bend preview mode — click to apply bend to physics object
  if (applyBendPreviewToTarget(ndc)) {
    return;
  }

  // Try to select existing object (3D ray-box for obstacles — click any visible face)
  const hit = hitTestAll3D(ndc, w.x, w.z);
  if (hit) {
    // In resize mode: if clicking the already-selected obstacle/pit, grab nearest handle
    if (resizeMode && hit.type === selectedType && hit.idx === selectedIdx
        && (hit.type === 'obstacle' || hit.type === 'pit')) {
      if (grabNearestHandle(w.x, w.z)) {
        handleUndoPushed = false;
        return;
      }
    }
    selectedType = hit.type;
    selectedIdx = hit.idx;
    isDragging = true;
    dragStarted = false;
    dragUndoPushed = false;
    dragStartWorld = { x: w.x, z: w.z };
    updateSelectionVisuals();
    updatePropertyPanel();
  } else {
    // Click on empty space — deselect and show all handles
    selectedType = null;
    selectedIdx = -1;
    updateSelectionVisuals();
    updatePropertyPanel();
  }
}

function onMouseMove(e: MouseEvent) {
  if (!active) return;

  const ndc = clientToNDC(e);
  lastMouseNDC.x = ndc.x;
  lastMouseNDC.y = ndc.y;

  // Handle resize drag
  const handle = getGrabbedHandle();
  if (handle) {
    if (!handleUndoPushed) {
      pushUndo();
      handleUndoPushed = true;
    }
    resizeWithHandle(handle, ndc);
    return;
  }

  if (!isDragging) return;

  const w = mouseToWorld(ndc);

  if (!dragStarted && dragStartWorld) {
    const dx = w.x - dragStartWorld.x;
    const dz = w.z - dragStartWorld.z;
    if (Math.sqrt(dx * dx + dz * dz) < 0.5) return;
    dragStarted = true;
  }

  if (!dragStarted) return;

  // Push undo on first real drag movement
  if (!dragUndoPushed) {
    pushUndo();
    dragUndoPushed = true;
  }

  const sx = snap(w.x);
  const sz = snap(w.z);

  if (selectedType === 'obstacle' && selectedIdx >= 0 && selectedIdx < OBSTACLES.length) {
    OBSTACLES[selectedIdx].x = sx;
    OBSTACLES[selectedIdx].z = sz;
    onArenaChanged();
  } else if (selectedType === 'physics' && selectedIdx >= 0 && selectedIdx < gameStateRef.physicsObjects.length) {
    const obj = gameStateRef.physicsObjects[selectedIdx];
    obj.pos.x = sx;
    obj.pos.z = sz;
    if (obj.mesh) {
      obj.mesh.position.x = sx;
      obj.mesh.position.z = sz;
    }
  } else if (selectedType === 'pit' && selectedIdx >= 0 && selectedIdx < PITS.length) {
    PITS[selectedIdx].x = sx;
    PITS[selectedIdx].z = sz;
    onArenaChanged();
  }

  updateSelectionVisuals();
  updatePropertyPanel();
}

function onMouseUp(_e: MouseEvent) {
  if (!active) return;

  // Finalize handle resize
  if (getGrabbedHandle()) {
    releaseHandle();
    onArenaChanged();
    updateSelectionVisuals();
    updatePropertyPanel();
  }

  isDragging = false;
  dragStarted = false;
  dragStartWorld = null;
  dragUndoPushed = false;
}

function onContextMenu(e: MouseEvent) {
  if (active) e.preventDefault();
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD HANDLER
// ═══════════════════════════════════════════════════════════════════════════

function onKeyDown(e: KeyboardEvent) {
  if (!active) return;

  // Toggle off with Shift+Backquote
  if (e.code === 'Backquote' && e.shiftKey) {
    e.preventDefault();
    toggleLevelEditor();
    return;
  }

  // Mode switching
  if (e.code === 'Digit1') { setMode('obstacle'); return; }
  if (e.code === 'Digit2') { setMode('physics'); return; }
  if (e.code === 'Digit3') { setMode('pit'); return; }

  // Delete selected
  if (e.code === 'Delete' || e.code === 'Backspace') {
    e.preventDefault();
    deleteSelected();
    return;
  }

  // Duplicate
  if (e.code === 'KeyD' && !e.ctrlKey && !e.metaKey) {
    duplicateSelected();
    return;
  }

  // Undo/Redo
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
    e.preventDefault();
    redo();
    return;
  }

  // R — toggle resize mode
  if (e.code === 'KeyR') {
    resizeMode = !resizeMode;
    setResizeMode(resizeMode);
    updateSelectionVisuals();
    return;
  }

  // Quick-place 1×1×1 block at cursor position
  if (e.code === 'KeyB') {
    pushUndo();
    const w = mouseToWorld(lastMouseNDC);
    OBSTACLES.push({ x: snap(w.x), z: snap(w.z), w: 1, h: 1, d: 1 });
    selectedType = 'obstacle';
    selectedIdx = OBSTACLES.length - 1;
    onArenaChanged();
    updateSelectionVisuals();
    updatePropertyPanel();
    return;
  }

  // Escape — deselect
  if (e.code === 'Escape') {
    selectedType = null;
    selectedIdx = -1;
    updateSelectionVisuals();
    updatePropertyPanel();
    return;
  }
}

// Global listener for Shift+Backquote to toggle editor ON (even when inactive)
function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.code === 'Backquote' && e.shiftKey) {
    e.preventDefault();
    toggleLevelEditor();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

function setMode(m: 'obstacle' | 'physics' | 'pit') {
  mode = m;
  updateModeBar();
}

function updateModeBar() {
  const labels = ['obstacle', 'physics', 'pit'];
  for (let i = 0; i < modeBtns.length; i++) {
    if (labels[i] === mode) {
      modeBtns[i].classList.add('active');
    } else {
      modeBtns[i].classList.remove('active');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVATE / DEACTIVATE
// ═══════════════════════════════════════════════════════════════════════════

function enterEditor() {
  active = true;
  previousPhase = gameStateRef.phase;
  gameStateRef.phase = 'editorPaused';

  // Reset selection — show all handles on entry
  selectedType = null;
  selectedIdx = -1;

  barEl.style.display = 'block';
  panelEl.style.display = 'block';
  updateModeBar();
  updateSelectionVisuals();
  updatePropertyPanel();

  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
}

function exitEditor() {
  active = false;
  gameStateRef.phase = previousPhase;

  barEl.style.display = 'none';
  panelEl.style.display = 'none';

  clearSelectionVisual();
  clearHandles();
  // Turn off resize mode if active
  if (resizeMode) {
    resizeMode = false;
    setResizeMode(false);
  }
  // Turn off bend preview if active
  if (bendPreviewActive) {
    toggleBendPreview();
  }
  selectedType = null;
  selectedIdx = -1;

  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('contextmenu', onContextMenu);
  window.removeEventListener('keydown', onKeyDown);
}

// ═══════════════════════════════════════════════════════════════════════════
// DOM SETUP
// ═══════════════════════════════════════════════════════════════════════════

function injectCSS() {
  const style = document.createElement('style');
  style.textContent = [
    '.level-editor-panel {',
    '  position: fixed; right: 10px; top: 60px; width: 220px;',
    '  background: rgba(0,0,0,0.85); color: #fff; font-family: monospace; font-size: 12px;',
    '  padding: 10px; border-radius: 4px; z-index: 9999;',
    '  max-height: calc(100vh - 80px); overflow-y: auto;',
    '}',
    '.level-editor-bar {',
    '  position: fixed; top: 10px; left: 50%; transform: translateX(-50%);',
    '  background: rgba(0,0,0,0.85); color: #fff; font-family: monospace; font-size: 14px;',
    '  padding: 6px 16px; border-radius: 4px; z-index: 9999; white-space: nowrap;',
    '}',
    '.level-editor-bar .mode-btn {',
    '  background: none; border: 1px solid #555; color: #888;',
    '  padding: 2px 8px; margin: 0 2px; cursor: pointer;',
    '  font-family: monospace; font-size: 13px; border-radius: 3px;',
    '}',
    '.level-editor-bar .mode-btn.active {',
    '  border-color: #4f4; color: #4f4;',
    '}',
  ].join('\n');
  document.head.appendChild(style);
}

function createDOM() {
  // Mode bar (top center)
  barEl = document.createElement('div');
  barEl.className = 'level-editor-bar';
  barEl.style.display = 'none';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = 'LEVEL EDITOR \u2014 ';
  barEl.appendChild(titleSpan);

  const modeLabels = [
    { key: '1', label: 'Obstacle', mode: 'obstacle' as const },
    { key: '2', label: 'Physics', mode: 'physics' as const },
    { key: '3', label: 'Pit', mode: 'pit' as const },
  ];

  modeBtns = [];
  for (const m of modeLabels) {
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    btn.textContent = m.key + ': ' + m.label;
    btn.addEventListener('click', () => setMode(m.mode));
    barEl.appendChild(btn);
    modeBtns.push(btn);
  }

  // Separator + Export/Import buttons
  const sep = document.createElement('span');
  sep.textContent = '  |  ';
  sep.style.opacity = '0.5';
  barEl.appendChild(sep);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'mode-btn';
  exportBtn.textContent = 'Copy JSON';
  exportBtn.addEventListener('click', exportRoomJSON);
  barEl.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.className = 'mode-btn';
  importBtn.textContent = 'Load JSON';
  importBtn.addEventListener('click', importRoomJSON);
  barEl.appendChild(importBtn);

  // Bend preview button
  const sep2 = document.createElement('span');
  sep2.textContent = '  |  ';
  sep2.style.opacity = '0.5';
  barEl.appendChild(sep2);

  bendPreviewBtn = document.createElement('button');
  bendPreviewBtn.className = 'mode-btn';
  bendPreviewBtn.textContent = 'Preview Bends';
  bendPreviewBtn.addEventListener('click', toggleBendPreview);
  barEl.appendChild(bendPreviewBtn);

  // Bend selector (hidden until preview is active)
  bendSelectorEl = document.createElement('div');
  bendSelectorEl.style.display = 'none';
  bendSelectorEl.style.gap = '4px';
  for (const bend of BENDS) {
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    btn.textContent = bend.icon + ' ' + bend.name;
    btn.dataset.bendId = bend.id;
    btn.addEventListener('click', () => {
      selectedBendId = bend.id;
      updateBendSelectorHighlight();
    });
    bendSelectorEl.appendChild(btn);
  }
  barEl.appendChild(bendSelectorEl);

  document.body.appendChild(barEl);

  // Property panel (right side)
  panelEl = document.createElement('div');
  panelEl.className = 'level-editor-panel';
  panelEl.style.display = 'none';

  panelContent = document.createElement('div');
  panelEl.appendChild(panelContent);

  document.body.appendChild(panelEl);
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export function initLevelEditor(scene: any, gameState: any): void {
  console.log('[levelEditor] initLevelEditor called');
  sceneRef = scene;
  gameStateRef = gameState;
  injectCSS();
  createDOM();
  initHandles(scene);

  // Global listener for Shift+Backquote toggle (always active)
  window.addEventListener('keydown', onGlobalKeyDown);
  console.log('[levelEditor] init complete — Shift+` to toggle');
}

export function toggleLevelEditor(): void {
  if (active) {
    exitEditor();
  } else {
    // Don't open level editor while spawn editor is active
    if (isSpawnEditorActive()) return;
    enterEditor();
  }
}

export function isLevelEditorActive(): boolean {
  return active;
}

export function updateLevelEditor(): void {
  // Called each frame when editor is active — used for visual updates only.
  // Selection visuals are updated on state change, nothing needed per-frame currently.
}
