// Spawn Editor — visual dev tool for placing and configuring wave spawners
// Toggle with backtick (`) key. Pauses gameplay, click to place spawners on arena.
// Follows tuning.js pattern: DOM panel + injected CSS, copy-to-clipboard export.
// Two tabs: Spawn (wave/enemy editing) and Level (obstacles/pits editing).
console.log('[spawnEditor] v2 loaded — tabs enabled');

import { WAVES } from '../config/waves';
import { ENEMY_TYPES } from '../config/enemies';
import { screenToWorld, getScene, setZoom, resetZoom, getCurrentFrustum, rebuildArenaVisuals } from '../engine/renderer';
import { getInputState, consumeInput } from '../engine/input';
import { startWave, resetWaveRunner } from '../engine/waveRunner';
import { clearEnemies } from '../entities/enemy';
import { releaseAllProjectiles } from '../entities/projectile';
import { ARENA_HALF_X, ARENA_HALF_Z, OBSTACLES, PITS } from '../config/arena';
import { invalidateCollisionBounds } from '../engine/physics';
import { toggleLevelEditor } from './levelEditor';

let sceneRef: any;
let gameStateRef: any;
let panel: any;
let active = false;
let previousPhase = 'playing';

// Current tab: 'spawn' or 'level'
let currentTab = 'spawn';

// Editor state (Spawn tab)
const editorState = {
  waveIndex: 0,
  groupIndex: 0,
  enemyType: 'goblin',
  selectedSpawnIdx: -1,  // index into current group's spawns, -1 = none
};

// Level editor state
const levelState = {
  selectedType: null as string | null,   // 'obstacle' or 'pit'
  selectedIdx: -1,      // index into OBSTACLES or PITS
};

// Arena preset state
let currentPresetName: string | null = null; // name of loaded preset, or null

// Drag state
let isDragging = false;
let dragStarted = false; // true once mouse moves beyond threshold
let dragStartWorld: any = null;

// Undo/redo stacks — stores snapshots of { waveIndex, groupIndex, spawns (deep copy) }
const undoStack: any[] = [];
const redoStack: any[] = [];
const MAX_UNDO = 50;

function snapshotGroup() {
  const wave = WAVES[editorState.waveIndex];
  if (!wave) return null;
  const group = wave.groups[editorState.groupIndex];
  if (!group) return null;
  return {
    tab: 'spawn',
    waveIndex: editorState.waveIndex,
    groupIndex: editorState.groupIndex,
    spawns: JSON.parse(JSON.stringify(group.spawns)),
    triggerDelay: group.triggerDelay,
    telegraphDuration: group.telegraphDuration,
    stagger: group.stagger,
  };
}

function snapshotLevel() {
  return {
    tab: 'level',
    obstacles: JSON.parse(JSON.stringify(OBSTACLES)),
    pits: JSON.parse(JSON.stringify(PITS)),
    selectedType: levelState.selectedType,
    selectedIdx: levelState.selectedIdx,
  };
}

function pushUndo() {
  const snap = currentTab === 'level' ? snapshotLevel() : snapshotGroup();
  if (!snap) return;
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // new action clears redo
}

function applySnapshot(snap: any) {
  if (snap.tab === 'level') {
    // Restore obstacle/pit arrays in place
    OBSTACLES.length = 0;
    for (const o of snap.obstacles) OBSTACLES.push(o);
    PITS.length = 0;
    for (const p of snap.pits) PITS.push(p);
    levelState.selectedType = snap.selectedType;
    levelState.selectedIdx = snap.selectedIdx;
    onArenaChanged();
    rebuildLevelMarkers();
    refreshUI();
  } else {
    editorState.waveIndex = snap.waveIndex;
    editorState.groupIndex = snap.groupIndex;
    const wave = WAVES[snap.waveIndex];
    if (!wave) return;
    const group = wave.groups[snap.groupIndex];
    if (!group) return;
    group.spawns = snap.spawns;
    group.triggerDelay = snap.triggerDelay;
    group.telegraphDuration = snap.telegraphDuration;
    group.stagger = snap.stagger;
    rebuildMarkers();
    refreshUI();
  }
}

function popUndo() {
  if (undoStack.length === 0) return;
  // Save current state to redo before restoring
  const current = currentTab === 'level' ? snapshotLevel() : snapshotGroup();
  if (current) redoStack.push(current);
  applySnapshot(undoStack.pop());
}

function popRedo() {
  if (redoStack.length === 0) return;
  // Save current state to undo before restoring
  const current = currentTab === 'level' ? snapshotLevel() : snapshotGroup();
  if (current) undoStack.push(current);
  applySnapshot(redoStack.pop());
}

// 3D markers in scene (spawn tab)
let markers: any[] = []; // { mesh, waveIdx, groupIdx, spawnIdx }

// 3D markers for level tab
let levelMarkers: any[] = []; // { mesh, type: 'obstacle'|'pit', idx }

// Shared geometry/materials for markers
let markerGeo: any;
const markerMats: any = {};

// DOM references
let waveLabel: any, groupLabel: any, spawnCountLabel: any;
let bannerEl: any;
let spawnTabContent: any, levelTabContent: any;

// Enemy type shortnames for marker labels
const TYPE_SHORT: any = {
  goblin: 'G',
  skeletonArcher: 'A',
  iceMortarImp: 'M',
  stoneGolem: 'T',
};

const ENEMY_TYPE_KEYS = Object.keys(ENEMY_TYPES);

// ─── Per-Enemy Tuning Slider Definitions ───

const ENEMY_TUNING_SLIDERS: any = {
  goblin: [
    { label: 'Health',       key: 'health',             min: 5,   max: 200,  step: 5,   suffix: '', unit: 'HP',  tip: 'Hit points before death.' },
    { label: 'Speed',        key: 'speed',              min: 0.5, max: 6,    step: 0.1, suffix: '', unit: 'u/s', tip: 'Movement speed in units per second.' },
    { label: 'Damage',       key: 'damage',             min: 1,   max: 50,   step: 1,   suffix: '', unit: 'HP',  tip: 'Melee damage per hit.' },
    { label: 'Attack Rate',  key: 'attackRate',          min: 200, max: 3000, step: 50,  suffix: 'ms', unit: 'ms', tip: 'Minimum time between melee attacks.' },
    { label: 'KB Resist',    key: 'knockbackResist',     min: 0,   max: 1,    step: 0.05,suffix: '', unit: '',    tip: 'Resistance to knockback. 0 = full knockback, 1 = immune.' },
    { label: 'Stop Dist',    key: 'rush.stopDistance',   min: 0.1, max: 3,    step: 0.1, suffix: '', unit: 'u',   tip: 'How close to the player before the goblin stops moving.' },
    { label: 'Leap Edge',    key: 'pitLeap.edgeTimeRequired', min: 200,  max: 4000, step: 100, suffix: 'ms', unit: 'ms', tip: 'How long a goblin must hug a pit edge before leaping.' },
    { label: 'Leap Speed',   key: 'pitLeap.leapSpeed',        min: 2,    max: 20,   step: 0.5, suffix: '', unit: 'u/s', tip: 'Travel speed along the arc. Lower = slower, more dramatic.' },
    { label: 'Leap Height',  key: 'pitLeap.arcHeight',        min: 1,    max: 12,   step: 0.5, suffix: '', unit: 'u',   tip: 'Peak height of the parabolic leap arc.' },
    { label: 'Leap CD',      key: 'pitLeap.cooldown',         min: 500,  max: 10000,step: 250, suffix: 'ms', unit: 'ms', tip: 'Cooldown before a goblin can leap again.' },
  ],
  skeletonArcher: [
    { label: 'Health',           key: 'health',                     min: 5,   max: 200,  step: 5,    suffix: '', unit: 'HP',  tip: 'Hit points before death.' },
    { label: 'Speed',            key: 'speed',                      min: 0.5, max: 6,    step: 0.1,  suffix: '', unit: 'u/s', tip: 'Movement speed in units per second.' },
    { label: 'Damage',           key: 'damage',                     min: 1,   max: 50,   step: 1,    suffix: '', unit: 'HP',  tip: 'Base damage value.' },
    { label: 'Attack Rate',      key: 'attackRate',                  min: 500, max: 5000, step: 100,  suffix: 'ms', unit: 'ms', tip: 'Cooldown between sniper shots (includes telegraph time).' },
    { label: 'Attack Range',     key: 'attackRange',                 min: 3,   max: 20,   step: 0.5,  suffix: '', unit: 'u',   tip: 'Maximum distance to initiate a sniper shot.' },
    { label: 'KB Resist',        key: 'knockbackResist',             min: 0,   max: 1,    step: 0.05, suffix: '', unit: '',    tip: 'Resistance to knockback. 0 = full knockback, 1 = immune.' },
    { label: 'Sniper Telegraph', key: 'sniper.telegraphDuration',    min: 200, max: 2000, step: 50,   suffix: 'ms', unit: 'ms', tip: 'How long the laser sight shows before firing. This is the player\'s dodge window.' },
    { label: 'Shot Width',       key: 'sniper.shotWidth',            min: 0.5, max: 4,    step: 0.1,  suffix: '', unit: 'u',   tip: 'Width of the damage corridor (perpendicular to aim).' },
    { label: 'Shot Length',      key: 'sniper.shotLength',           min: 4,   max: 25,   step: 1,    suffix: '', unit: 'u',   tip: 'Length of the damage corridor (along aim direction).' },
    { label: 'Sniper Dmg',       key: 'sniper.damage',               min: 1,   max: 50,   step: 1,    suffix: '', unit: 'HP',  tip: 'Damage dealt to everything in the corridor (player + enemies).' },
    { label: 'Slow Dur',         key: 'sniper.slowDuration',          min: 200, max: 3000, step: 100,  suffix: 'ms', unit: 'ms', tip: 'How long enemies hit by sniper are slowed.' },
    { label: 'Slow Mult',        key: 'sniper.slowMult',              min: 0.1, max: 1.0,  step: 0.05, suffix: '', unit: 'x',   tip: 'Speed multiplier while slowed. 0.5 = half speed.' },
    { label: 'Pref Range %',     key: 'kite.preferredRangeMult',     min: 0.3, max: 1.0,  step: 0.05, suffix: '', unit: 'x',   tip: 'Multiplier on attackRange for ideal distance. Lower = fights closer.' },
    { label: 'Retreat Buf',      key: 'kite.retreatBuffer',          min: 0,   max: 5,    step: 0.5,  suffix: '', unit: 'u',   tip: 'How far inside preferred range before retreating.' },
    { label: 'Advance Buf',      key: 'kite.advanceBuffer',          min: 0,   max: 8,    step: 0.5,  suffix: '', unit: 'u',   tip: 'How far outside preferred range before advancing.' },
  ],
  iceMortarImp: [
    { label: 'Health',         key: 'health',                    min: 5,   max: 200,  step: 5,    suffix: '', unit: 'HP',  tip: 'Hit points before death.' },
    { label: 'Speed',          key: 'speed',                     min: 0.5, max: 6,    step: 0.1,  suffix: '', unit: 'u/s', tip: 'Movement speed in units per second.' },
    { label: 'Damage',         key: 'damage',                    min: 1,   max: 50,   step: 1,    suffix: '', unit: 'HP',  tip: 'Base damage value.' },
    { label: 'Attack Rate',    key: 'attackRate',                  min: 1000,max: 8000, step: 250,  suffix: 'ms', unit: 'ms', tip: 'Cooldown between mortar shots (includes aim time).' },
    { label: 'Attack Range',   key: 'attackRange',                 min: 5,   max: 25,   step: 0.5,  suffix: '', unit: 'u',   tip: 'Maximum distance to initiate a mortar shot.' },
    { label: 'KB Resist',      key: 'knockbackResist',             min: 0,   max: 1,    step: 0.05, suffix: '', unit: '',    tip: 'Resistance to knockback.' },
    { label: 'Aim Duration',   key: 'mortar.aimDuration',          min: 400, max: 3000, step: 100,  suffix: 'ms', unit: 'ms', tip: 'How long the aim arc + ground circle telegraph shows. This is the dodge window.' },
    { label: 'Proj Speed',     key: 'mortar.projectileSpeed',      min: 3,   max: 20,   step: 0.5,  suffix: '', unit: 'u/s', tip: 'Projectile travel speed along the arc.' },
    { label: 'Arc Height',     key: 'mortar.arcHeight',            min: 2,   max: 15,   step: 0.5,  suffix: '', unit: 'u',   tip: 'Peak height of the parabolic arc.' },
    { label: 'Blast Radius',   key: 'mortar.blastRadius',          min: 1,   max: 8,    step: 0.5,  suffix: '', unit: 'u',   tip: 'AoE damage radius on impact.' },
    { label: 'Mortar Dmg',     key: 'mortar.damage',               min: 1,   max: 50,   step: 1,    suffix: '', unit: 'HP',  tip: 'Damage dealt to everything in the blast radius.' },
    { label: 'Inaccuracy',     key: 'mortar.inaccuracy',           min: 0,   max: 5,    step: 0.25, suffix: '', unit: 'u',   tip: 'Random offset from player position. Higher = less accurate.' },
    { label: 'Slow Dur',       key: 'mortar.slowDuration',          min: 200, max: 3000, step: 100,  suffix: 'ms', unit: 'ms', tip: 'How long targets hit by mortar are slowed.' },
    { label: 'Slow Mult',      key: 'mortar.slowMult',              min: 0.1, max: 1.0,  step: 0.05, suffix: '', unit: 'x',   tip: 'Speed multiplier while slowed.' },
    { label: 'Circle Start',   key: 'mortar.circleStartScale',     min: 0.05, max: 1.0, step: 0.05, suffix: '', unit: 'x',   tip: 'Initial scale of ground circle on aim lock (0.25 = starts at 25% size).' },
    { label: 'Circle Scale',   key: 'mortar.circleScaleTime',      min: 50,  max: 1000, step: 50,   suffix: 'ms', unit: 'ms', tip: 'How long the ground circle takes to scale from start size to full size.' },
    { label: 'Pref Range %',   key: 'kite.preferredRangeMult',     min: 0.3, max: 1.0,  step: 0.05, suffix: '', unit: 'x',   tip: 'Multiplier on attackRange for ideal distance.' },
    { label: 'Retreat Buf',    key: 'kite.retreatBuffer',          min: 0,   max: 5,    step: 0.5,  suffix: '', unit: 'u',   tip: 'How far inside preferred range before retreating.' },
    { label: 'Advance Buf',    key: 'kite.advanceBuffer',          min: 0,   max: 8,    step: 0.5,  suffix: '', unit: 'u',   tip: 'How far outside preferred range before advancing.' },
  ],
  stoneGolem: [
    { label: 'Health',          key: 'health',                     min: 20,   max: 500,  step: 10,   suffix: '', unit: 'HP',  tip: 'Hit points after shield is broken.' },
    { label: 'Speed',           key: 'speed',                      min: 0.3,  max: 4,    step: 0.05, suffix: '', unit: 'u/s', tip: 'Base movement speed in units per second.' },
    { label: 'Damage',          key: 'damage',                     min: 5,    max: 80,   step: 5,    suffix: '', unit: 'HP',  tip: 'Base melee damage per hit.' },
    { label: 'Attack Rate',     key: 'attackRate',                  min: 200,  max: 5000, step: 100,  suffix: 'ms', unit: 'ms', tip: 'Minimum time between melee hits.' },
    { label: 'KB Resist',       key: 'knockbackResist',             min: 0,    max: 1,    step: 0.05, suffix: '', unit: '',    tip: 'Knockback resistance. Golem barely moves when hit.' },
    { label: 'Charge Speed',    key: 'tank.chargeSpeedMult',        min: 1,    max: 6,    step: 0.5,  suffix: 'x', unit: 'x',  tip: 'Speed multiplier during charge attack.' },
    { label: 'Charge Dur',      key: 'tank.chargeDuration',         min: 100,  max: 2000, step: 50,   suffix: 'ms', unit: 'ms', tip: 'How long the charge lasts.' },
    { label: 'Charge CD Min',   key: 'tank.chargeCooldownMin',      min: 1000, max: 10000,step: 500,  suffix: 'ms', unit: 'ms', tip: 'Minimum cooldown between charges.' },
    { label: 'Charge CD Max',   key: 'tank.chargeCooldownMax',      min: 1000, max: 15000,step: 500,  suffix: 'ms', unit: 'ms', tip: 'Maximum cooldown between charges (random in range).' },
    { label: 'Charge Dmg',      key: 'tank.chargeDamageMult',       min: 1,    max: 4,    step: 0.25, suffix: 'x', unit: 'x',  tip: 'Damage multiplier when hitting player during charge.' },
    { label: 'Shield HP',       key: 'shield.maxHealth',            min: 0,    max: 200,  step: 5,    suffix: '', unit: 'HP',  tip: 'Shield hit points. Set to 0 to disable shield.' },
    { label: 'Stun Radius',     key: 'shield.stunRadius',           min: 1,    max: 15,   step: 0.5,  suffix: '', unit: 'u',   tip: 'AoE stun radius when shield breaks.' },
    { label: 'Stun Dur',        key: 'shield.stunDuration',         min: 500,  max: 5000, step: 250,  suffix: 'ms', unit: 'ms', tip: 'How long the golem + nearby enemies are stunned after shield break.' },
    { label: 'Explode Rad',    key: 'deathExplosion.radius',       min: 1,    max: 10,   step: 0.5,  suffix: '', unit: 'u',   tip: 'AoE radius of the death explosion. Damages nearby enemies and player.' },
    { label: 'Explode Dmg',    key: 'deathExplosion.damage',       min: 5,    max: 80,   step: 5,    suffix: '', unit: 'HP',  tip: 'Damage dealt by the death explosion.' },
    { label: 'Explode Stun',   key: 'deathExplosion.stunDuration', min: 0,    max: 3000, step: 250,  suffix: 'ms', unit: 'ms', tip: 'Stun duration applied to enemies caught in death explosion. 0 = no stun.' },
    { label: 'Explode Delay',  key: 'deathExplosion.telegraphDuration', min: 0, max: 3000, step: 100, suffix: 'ms', unit: 'ms', tip: 'Telegraph delay before explosion. Golem can be pushed during this window. 0 = instant.' },
  ],
};

// Nested key helpers
function getNestedValue(obj: any, path: string) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNestedValue(obj: any, path: string, value: any) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

let lastBuiltTuningType: string | null = null;

export function initSpawnEditor(scene: any, gameState: any) {
  sceneRef = scene;
  gameStateRef = gameState;

  // Marker geometry — small cylinder
  markerGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8);

  // Materials per enemy type
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    markerMats[name] = new THREE.MeshStandardMaterial({
      color: (cfg as any).color,
      emissive: (cfg as any).color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
    });
  }

  buildPanel();
  injectStyles();

  // Mouse handlers
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Keyboard shortcuts in editor
  window.addEventListener('keydown', onEditorKey);
}

export function updateSpawnEditor(dt: number) {
  const input = getInputState();

  // Check for toggle
  if (input.toggleEditor) {
    toggleEditor();
    consumeInput();
    return;
  }
}

// Also check toggle from main game loop (called even when not in editor)
export function checkEditorToggle() {
  const input = getInputState();
  if (input.toggleEditor) {
    toggleEditor();
  }
}

function toggleEditor() {
  if (active) {
    exitEditor();
  } else {
    enterEditor();
  }
}

function onEditorWheel(e: any) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1 : -1; // scroll down = zoom out (+frustum)
  setZoom(getCurrentFrustum() + delta);
}

function enterEditor() {
  active = true;
  previousPhase = gameStateRef.phase;
  gameStateRef.phase = 'editorPaused';
  panel.classList.remove('hidden');
  bannerEl.classList.add('visible');
  window.addEventListener('wheel', onEditorWheel, { passive: false });
  if (currentTab === 'spawn') {
    rebuildMarkers();
  } else {
    rebuildLevelMarkers();
  }
  refreshUI();
}

function exitEditor() {
  active = false;
  gameStateRef.phase = previousPhase;
  panel.classList.add('hidden');
  bannerEl.classList.remove('visible');
  window.removeEventListener('wheel', onEditorWheel);
  resetZoom();
  clearMarkers();
  clearLevelMarkers();
}

export function isEditorActive() {
  return active;
}

// ─── Tab Switching ───

function switchTab(tab: string) {
  if (tab === currentTab) return;
  currentTab = tab;

  // Clear old markers
  clearMarkers();
  clearLevelMarkers();

  // Reset selections
  editorState.selectedSpawnIdx = -1;
  levelState.selectedType = null;
  levelState.selectedIdx = -1;
  isDragging = false;
  dragStarted = false;

  // Show/hide tab contents
  if (spawnTabContent && levelTabContent) {
    spawnTabContent.style.display = tab === 'spawn' ? 'block' : 'none';
    levelTabContent.style.display = tab === 'level' ? 'block' : 'none';
  }

  // Update tab buttons
  const tabs = panel.querySelectorAll('.se-tab');
  tabs.forEach((t: any) => t.classList.toggle('active', t.dataset.tab === tab));

  // Rebuild appropriate markers
  if (tab === 'spawn') {
    rebuildMarkers();
  } else {
    rebuildLevelMarkers();
  }
  refreshUI();
}

// ─── Mouse → Select / Drag / Place ───

function mouseToWorld(e: any) {
  const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
  return screenToWorld(ndcX, ndcY);
}

function clampToArena(x: number, z: number) {
  const cx = ARENA_HALF_X - 1.5;
  const cz = ARENA_HALF_Z - 1.5;
  return {
    x: Math.round(Math.max(-cx, Math.min(cx, x))),
    z: Math.round(Math.max(-cz, Math.min(cz, z))),
  };
}

// Find nearest spawn in current group within radius
function findNearestSpawn(worldX: number, worldZ: number, radius: number) {
  const group = getCurrentGroup();
  if (!group) return -1;
  let bestIdx = -1, bestDist = radius * radius;
  for (let i = 0; i < group.spawns.length; i++) {
    const s = group.spawns[i];
    const dx = s.x - worldX;
    const dz = s.z - worldZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Find nearest spawn across ALL groups in the current wave within radius.
// Returns { groupIdx, spawnIdx } or null if nothing found.
function findNearestSpawnAcrossGroups(worldX: number, worldZ: number, radius: number) {
  const wave = WAVES[editorState.waveIndex];
  if (!wave) return null;
  let bestGroupIdx = -1, bestSpawnIdx = -1, bestDist = radius * radius;
  for (let gi = 0; gi < wave.groups.length; gi++) {
    const group = wave.groups[gi];
    for (let si = 0; si < group.spawns.length; si++) {
      const s = group.spawns[si];
      const dx = s.x - worldX;
      const dz = s.z - worldZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDist) {
        bestDist = distSq;
        bestGroupIdx = gi;
        bestSpawnIdx = si;
      }
    }
  }
  if (bestGroupIdx < 0) return null;
  return { groupIdx: bestGroupIdx, spawnIdx: bestSpawnIdx };
}

// ─── Level Tab Mouse Helpers ───

function findNearestLevelObject(worldX: number, worldZ: number, radius: number) {
  let bestType: string | null = null, bestIdx = -1, bestDist = radius * radius;

  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const dx = o.x - worldX;
    const dz = o.z - worldZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestType = 'obstacle';
      bestIdx = i;
    }
  }

  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    const dx = p.x - worldX;
    const dz = p.z - worldZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      bestType = 'pit';
      bestIdx = i;
    }
  }

  if (bestType === null) return null;
  return { type: bestType, idx: bestIdx };
}

function onMouseDown(e: any) {
  if (!active) return;
  if (e.target.closest('#spawn-editor')) return;

  if (currentTab === 'level') {
    onLevelMouseDown(e);
    return;
  }

  const worldPos = mouseToWorld(e);
  const group = getCurrentGroup();
  if (!group) return;

  // Right-click or shift-click: delete nearest spawn (search across groups)
  if (e.button === 2 || e.shiftKey) {
    // Try current group first
    let idx = findNearestSpawn(worldPos.x, worldPos.z, 1.5);
    if (idx >= 0) {
      pushUndo();
      group.spawns.splice(idx, 1);
      if (editorState.selectedSpawnIdx === idx) editorState.selectedSpawnIdx = -1;
      else if (editorState.selectedSpawnIdx > idx) editorState.selectedSpawnIdx--;
      rebuildMarkers();
      refreshUI();
    } else {
      // Check other groups
      const hit = findNearestSpawnAcrossGroups(worldPos.x, worldPos.z, 1.5);
      if (hit) {
        // Switch to that group and delete the spawn
        editorState.groupIndex = hit.groupIdx;
        editorState.selectedSpawnIdx = -1;
        const targetGroup = WAVES[editorState.waveIndex].groups[hit.groupIdx];
        pushUndo();
        targetGroup.spawns.splice(hit.spawnIdx, 1);
        rebuildMarkers();
        refreshUI();
      }
    }
    return;
  }

  // Left click: check if clicking on existing spawn in current group first
  const hitIdx = findNearestSpawn(worldPos.x, worldPos.z, 1.5);

  if (hitIdx >= 0) {
    // Select it and start potential drag
    editorState.selectedSpawnIdx = hitIdx;
    isDragging = true;
    dragStarted = false;
    dragStartWorld = { x: worldPos.x, z: worldPos.z };
    rebuildMarkers();
    refreshUI();
  } else {
    // Check other groups — only auto-switch if click is very close to an existing spawn
    // (tighter radius prevents accidental group switches when placing new spawns)
    const hit = findNearestSpawnAcrossGroups(worldPos.x, worldPos.z, 0.8);

    if (hit) {
      // Auto-switch to that group and select the spawn
      editorState.groupIndex = hit.groupIdx;
      editorState.selectedSpawnIdx = hit.spawnIdx;
      isDragging = true;
      dragStarted = false;
      dragStartWorld = { x: worldPos.x, z: worldPos.z };
      rebuildMarkers();
      refreshUI();
    } else {
      // Place new spawn in current group
      pushUndo();
      const clamped = clampToArena(worldPos.x, worldPos.z);
      group.spawns.push({ type: editorState.enemyType, x: clamped.x, z: clamped.z });
      editorState.selectedSpawnIdx = group.spawns.length - 1;
      rebuildMarkers();
      refreshUI();
    }
  }
}

function onLevelMouseDown(e: any) {
  const worldPos = mouseToWorld(e);

  // Right-click or shift-click: delete nearest object
  if (e.button === 2 || e.shiftKey) {
    const hit = findNearestLevelObject(worldPos.x, worldPos.z, 3);
    if (hit) {
      pushUndo();
      if (hit.type === 'obstacle') {
        OBSTACLES.splice(hit.idx, 1);
      } else {
        PITS.splice(hit.idx, 1);
      }
      // Clear selection if the deleted item was selected
      if (levelState.selectedType === hit.type && levelState.selectedIdx === hit.idx) {
        levelState.selectedType = null;
        levelState.selectedIdx = -1;
      } else if (levelState.selectedType === hit.type && levelState.selectedIdx > hit.idx) {
        levelState.selectedIdx--;
      }
      onArenaChanged();
      rebuildLevelMarkers();
      refreshUI();
    }
    return;
  }

  // Left click: select or add
  const hit = findNearestLevelObject(worldPos.x, worldPos.z, 3);

  if (hit) {
    levelState.selectedType = hit.type;
    levelState.selectedIdx = hit.idx;
    isDragging = true;
    dragStarted = false;
    dragStartWorld = { x: worldPos.x, z: worldPos.z };
    rebuildLevelMarkers();
    refreshUI();
  } else {
    // Click on empty space: deselect
    levelState.selectedType = null;
    levelState.selectedIdx = -1;
    rebuildLevelMarkers();
    refreshUI();
  }
}

function onMouseMove(e: any) {
  if (!active || !isDragging) return;

  if (currentTab === 'level') {
    onLevelMouseMove(e);
    return;
  }

  const worldPos = mouseToWorld(e);
  const group = getCurrentGroup();
  if (!group || editorState.selectedSpawnIdx < 0) return;

  // Check drag threshold (0.5 world units) before committing
  if (!dragStarted) {
    const dx = worldPos.x - dragStartWorld.x;
    const dz = worldPos.z - dragStartWorld.z;
    if (dx * dx + dz * dz < 0.25) return; // below threshold
    dragStarted = true;
    pushUndo(); // snapshot before drag begins
  }

  // Move the selected spawn
  const clamped = clampToArena(worldPos.x, worldPos.z);
  const spawn = group.spawns[editorState.selectedSpawnIdx];
  spawn.x = clamped.x;
  spawn.z = clamped.z;

  // Update marker position directly (avoid full rebuild every frame)
  const marker = markers.find((m: any) =>
    m.groupIdx === editorState.groupIndex && m.spawnIdx === editorState.selectedSpawnIdx
  );
  if (marker) {
    marker.mesh.position.set(clamped.x, 0, clamped.z);
  }
}

function onLevelMouseMove(e: any) {
  if (levelState.selectedType === null || levelState.selectedIdx < 0) return;

  const worldPos = mouseToWorld(e);

  // Check drag threshold
  if (!dragStarted) {
    const dx = worldPos.x - dragStartWorld.x;
    const dz = worldPos.z - dragStartWorld.z;
    if (dx * dx + dz * dz < 0.25) return;
    dragStarted = true;
    pushUndo();
  }

  // Move the selected object
  const arr = levelState.selectedType === 'obstacle' ? OBSTACLES : PITS;
  const obj = arr[levelState.selectedIdx];
  if (!obj) return;
  obj.x = Math.round(worldPos.x * 2) / 2; // snap to 0.5
  obj.z = Math.round(worldPos.z * 2) / 2;

  // Update marker position
  const marker = levelMarkers.find((m: any) =>
    m.type === levelState.selectedType && m.idx === levelState.selectedIdx
  );
  if (marker) {
    marker.mesh.position.set(obj.x, marker.mesh.position.y, obj.z);
  }
}

function onMouseUp(e: any) {
  if (!active) return;

  if (currentTab === 'level') {
    if (isDragging && dragStarted) {
      onArenaChanged();
      rebuildLevelMarkers();
      refreshUI();
    }
    isDragging = false;
    dragStarted = false;
    dragStartWorld = null;
    return;
  }

  if (isDragging && dragStarted) {
    // Drag finished — rebuild markers for clean state
    rebuildMarkers();
    refreshUI();
  }
  isDragging = false;
  dragStarted = false;
  dragStartWorld = null;
}

// ─── Arena Changed (rebuild visuals + invalidate physics) ───

function onArenaChanged() {
  rebuildArenaVisuals();
  invalidateCollisionBounds();
}

// ─── Arena Presets ───
// Note: Arena save/load requires a backend server. On static hosting (GitHub Pages,
// npx serve), these functions no-op silently. Set window.ARENA_BACKEND = true if
// you're running a backend that supports /arenas endpoints.

const hasArenaBackend = () => (window as any).ARENA_BACKEND === true;

async function fetchPresetList() {
  if (!hasArenaBackend()) return [];
  try {
    const res = await fetch('/arenas');
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.warn('[spawnEditor] Could not fetch preset list:', e);
    return [];
  }
}

async function refreshPresetDropdown() {
  const select = document.getElementById('se-preset-select') as any;
  if (!select) return;
  const list = await fetchPresetList();
  let html = '<option value="">(unsaved)</option>';
  for (const name of list) {
    const sel = name === currentPresetName ? ' selected' : '';
    html += `<option value="${name}"${sel}>${name}</option>`;
  }
  select.innerHTML = html;
}

async function loadPreset(name: string) {
  if (!name || !hasArenaBackend()) return;
  try {
    const res = await fetch(`/arenas/load?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();

    pushUndo();

    // Replace arrays in-place (same pattern as undo/redo)
    OBSTACLES.length = 0;
    for (const o of data.obstacles) OBSTACLES.push(o);
    PITS.length = 0;
    for (const p of data.pits) PITS.push(p);

    currentPresetName = name;
    levelState.selectedType = null;
    levelState.selectedIdx = -1;

    onArenaChanged();
    rebuildLevelMarkers();
    refreshLevelUI();
    refreshPresetDropdown();
  } catch (e) {
    console.error('[spawnEditor] Load preset failed:', e);
  }
}

async function savePreset(name: string) {
  if (!name || !hasArenaBackend()) return;
  try {
    const res = await fetch('/arenas/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, obstacles: OBSTACLES, pits: PITS }),
    });
    if (!res.ok) throw new Error(res.statusText);
    currentPresetName = name;
    refreshPresetDropdown();
  } catch (e) {
    console.error('[spawnEditor] Save preset failed:', e);
  }
}

async function deletePreset(name: string) {
  if (!name || !hasArenaBackend()) return;
  try {
    const res = await fetch('/arenas/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(res.statusText);
    if (currentPresetName === name) currentPresetName = null;
    refreshPresetDropdown();
  } catch (e) {
    console.error('[spawnEditor] Delete preset failed:', e);
  }
}

// ─── Keyboard Shortcuts ───

function onEditorKey(e: any) {
  if (!active) return;

  // Cmd/Ctrl+Z: undo
  if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
    e.preventDefault();
    popUndo();
    return;
  }

  // Ctrl+Y or Cmd+Shift+Z: redo
  if ((e.code === 'KeyY' && (e.metaKey || e.ctrlKey)) ||
      (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey) && e.shiftKey)) {
    e.preventDefault();
    popRedo();
    return;
  }

  // Escape: deselect
  if (e.code === 'Escape') {
    if (currentTab === 'level') {
      levelState.selectedType = null;
      levelState.selectedIdx = -1;
      rebuildLevelMarkers();
    } else {
      editorState.selectedSpawnIdx = -1;
      rebuildMarkers();
    }
    refreshUI();
    return;
  }

  // Tab-specific shortcuts
  if (currentTab === 'level') {
    onLevelKey(e);
    return;
  }

  // Spawn tab shortcuts below

  // 1/2/3/4 to select enemy type — also changes selected spawn's type
  const typeKeyMap: any = { 'Digit1': 0, 'Digit2': 1, 'Digit3': 2, 'Digit4': 3 };
  if (e.code in typeKeyMap) {
    const idx = typeKeyMap[e.code];
    if (idx < ENEMY_TYPE_KEYS.length) {
      editorState.enemyType = ENEMY_TYPE_KEYS[idx];
      // If a spawn is selected, change its type too
      if (editorState.selectedSpawnIdx >= 0) {
        const group = getCurrentGroup();
        if (group && group.spawns[editorState.selectedSpawnIdx]) {
          pushUndo();
          group.spawns[editorState.selectedSpawnIdx].type = ENEMY_TYPE_KEYS[idx];
          rebuildMarkers();
        }
      }
      refreshUI();
    }
  }

  // Delete/Backspace: remove selected spawn, or clear group if none selected
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (e.target.tagName === 'INPUT') return; // don't intercept slider input
    const group = getCurrentGroup();
    if (!group) return;

    if (editorState.selectedSpawnIdx >= 0 && editorState.selectedSpawnIdx < group.spawns.length) {
      // Delete just the selected spawn
      pushUndo();
      group.spawns.splice(editorState.selectedSpawnIdx, 1);
      editorState.selectedSpawnIdx = -1;
      rebuildMarkers();
      refreshUI();
    } else {
      // No selection — clear all spawns in group
      pushUndo();
      group.spawns = [];
      rebuildMarkers();
      refreshUI();
    }
  }

  // P: play current wave
  if (e.code === 'KeyP') {
    playCurrentWave();
  }
}

function onLevelKey(e: any) {
  // Delete/Backspace: delete selected level object
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (e.target.tagName === 'INPUT') return;
    if (levelState.selectedType && levelState.selectedIdx >= 0) {
      pushUndo();
      if (levelState.selectedType === 'obstacle') {
        OBSTACLES.splice(levelState.selectedIdx, 1);
      } else {
        PITS.splice(levelState.selectedIdx, 1);
      }
      levelState.selectedType = null;
      levelState.selectedIdx = -1;
      onArenaChanged();
      rebuildLevelMarkers();
      refreshUI();
    }
  }
}

// ─── 3D Markers (Spawn Tab) ───

function clearMarkers() {
  for (const m of markers) {
    sceneRef.remove(m.mesh);
    // dispose cloned materials
    m.mesh.children.forEach((c: any) => {
      if (c.material && c.material !== markerMats[m.type]) c.material.dispose();
    });
  }
  markers = [];
}

function rebuildMarkers() {
  clearMarkers();

  for (let wi = 0; wi < WAVES.length; wi++) {
    const wave = WAVES[wi];
    if (wi !== editorState.waveIndex) continue; // only show current wave

    for (let gi = 0; gi < wave.groups.length; gi++) {
      const group = wave.groups[gi];
      const isCurrent = (gi === editorState.groupIndex);

      for (let si = 0; si < group.spawns.length; si++) {
        const spawn = group.spawns[si];
        const mat = markerMats[spawn.type] || markerMats.goblin;
        const isSelected = isCurrent && si === editorState.selectedSpawnIdx;

        // Clone material for opacity control
        const clonedMat = mat.clone();
        clonedMat.opacity = isCurrent ? 0.85 : 0.25;
        if (isSelected) {
          clonedMat.emissiveIntensity = 1.0;
        }

        const mesh = new THREE.Group();

        // Cylinder body
        const body = new THREE.Mesh(markerGeo, clonedMat);
        body.position.y = 0.4;
        mesh.add(body);

        // Ground ring — white if selected, enemy color otherwise
        const ringColor = isSelected ? 0xffffff
          : ((ENEMY_TYPES as any)[spawn.type] ? (ENEMY_TYPES as any)[spawn.type].color : 0xffffff);
        const ringGeo = new THREE.RingGeometry(
          isSelected ? 0.55 : 0.5,
          isSelected ? 0.75 : 0.65,
          16
        );
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: isSelected ? 0.9 : (isCurrent ? 0.5 : 0.15),
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.02;
        mesh.add(ring);

        mesh.position.set(spawn.x, 0, spawn.z);
        sceneRef.add(mesh);

        markers.push({
          mesh,
          type: spawn.type,
          waveIdx: wi,
          groupIdx: gi,
          spawnIdx: si,
        });
      }
    }
  }
}

// ─── 3D Markers (Level Tab) ───

function clearLevelMarkers() {
  for (const m of levelMarkers) {
    sceneRef.remove(m.mesh);
    m.mesh.children.forEach((c: any) => {
      if (c.material) c.material.dispose();
      if (c.geometry) c.geometry.dispose();
    });
  }
  levelMarkers = [];
}

function rebuildLevelMarkers() {
  clearLevelMarkers();

  const isObsSelected = levelState.selectedType === 'obstacle';
  const isPitSelected = levelState.selectedType === 'pit';

  // Obstacle markers — wireframe boxes at obstacle positions
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    const selected = isObsSelected && levelState.selectedIdx === i;

    const group = new THREE.Group();

    // Wireframe outline
    const boxGeo = new THREE.BoxGeometry(o.w, o.h, o.d);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: selected ? 0x44ff88 : 0x66aaff,
      linewidth: 1,
    });
    const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
    wireframe.position.y = o.h / 2;
    group.add(wireframe);

    // Ground ring
    const ringGeo = new THREE.RingGeometry(
      selected ? 0.6 : 0.5,
      selected ? 0.85 : 0.7,
      16
    );
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: selected ? 0x44ff88 : 0x66aaff,
      transparent: true,
      opacity: selected ? 0.8 : 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.03;
    group.add(ring);

    group.position.set(o.x, 0, o.z);
    sceneRef.add(group);

    levelMarkers.push({ mesh: group, type: 'obstacle', idx: i });
  }

  // Pit markers — wireframe rectangles on ground
  for (let i = 0; i < PITS.length; i++) {
    const p = PITS[i];
    const selected = isPitSelected && levelState.selectedIdx === i;

    const group = new THREE.Group();

    // Wireframe rectangle at ground level
    const planeGeo = new THREE.PlaneGeometry(p.w, p.d);
    const edgesGeo = new THREE.EdgesGeometry(planeGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: selected ? 0xff44aa : 0xff4466,
      linewidth: 1,
    });
    const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
    wireframe.rotation.x = -Math.PI / 2;
    wireframe.position.y = 0.1;
    group.add(wireframe);

    // Ground ring
    const ringGeo = new THREE.RingGeometry(
      selected ? 0.6 : 0.5,
      selected ? 0.85 : 0.7,
      16
    );
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: selected ? 0xff44aa : 0xff4466,
      transparent: true,
      opacity: selected ? 0.8 : 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.03;
    group.add(ring);

    group.position.set(p.x, 0, p.z);
    sceneRef.add(group);

    levelMarkers.push({ mesh: group, type: 'pit', idx: i });
  }
}

// ─── UI Panel ───

function buildPanel() {
  panel = document.createElement('div');
  panel.id = 'spawn-editor';
  panel.className = 'hidden';

  // Prevent context menu on panel
  panel.addEventListener('contextmenu', (e: any) => e.preventDefault());

  // Banner
  bannerEl = document.createElement('div');
  bannerEl.id = 'editor-banner';
  document.body.appendChild(bannerEl);
  bannerEl.textContent = 'EDITOR MODE — press ` to exit';

  let html = '';

  // Tab bar
  html += '<div class="se-tabs">';
  html += '<div class="se-tab active" data-tab="spawn">Spawn</div>';
  html += '<div class="se-tab" data-tab="level">Level</div>';
  html += '</div>';

  // ─── Spawn Tab Content ───
  html += '<div id="se-spawn-content">';

  // Wave selector
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Wave</div>';
  html += '<div class="se-selector">';
  html += '<div class="se-btn" id="se-wave-prev">&lt;</div>';
  html += '<span id="se-wave-label">1</span>';
  html += '<div class="se-btn" id="se-wave-next">&gt;</div>';
  html += '<div class="se-btn se-add" id="se-wave-add">+</div>';
  html += '</div>';
  html += '<input type="text" id="se-wave-msg" class="se-wave-msg" placeholder="Wave announcement message...">';
  html += '</div>';

  // Group selector
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Group</div>';
  html += '<div class="se-selector">';
  html += '<div class="se-btn" id="se-group-prev">&lt;</div>';
  html += '<span id="se-group-label">g1</span>';
  html += '<div class="se-btn" id="se-group-next">&gt;</div>';
  html += '<div class="se-btn se-add" id="se-group-add">+</div>';
  html += '<div class="se-btn se-del" id="se-group-del">\u00d7</div>';
  html += '</div></div>';

  // Timing sliders
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Timing</div>';
  html += '<div class="se-slider-row"><span class="has-tooltip" data-tip="Time after wave starts before this group\'s telegraph begins. Use to stagger multiple groups.">Trigger Delay</span><input type="range" id="se-trigger" min="0" max="10000" step="250" value="0"><input type="text" class="se-timing-val" id="se-trigger-val" value="0 ms"></div>';
  html += '<div class="se-slider-row"><span class="has-tooltip" data-tip="How long the pulsing warning circles appear on the ground before enemies materialize. This is the player\'s reaction window.">Telegraph Time</span><input type="range" id="se-telegraph" min="500" max="5000" step="250" value="1500"><input type="text" class="se-timing-val" id="se-telegraph-val" value="1500 ms"></div>';
  html += '<div class="se-slider-row"><span class="has-tooltip" data-tip="Time between each individual enemy spawning within a group. 0 = all spawn simultaneously.">Spawn Stagger</span><input type="range" id="se-stagger" min="0" max="1000" step="50" value="200"><input type="text" class="se-timing-val" id="se-stagger-val" value="200 ms"></div>';
  html += '</div>';

  // Enemy type picker
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Enemy Type (1/2/3/4)</div>';
  html += '<div class="se-type-picker" id="se-type-picker">';
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    const short = TYPE_SHORT[name] || name[0].toUpperCase();
    html += `<div class="se-type-btn" data-type="${name}" style="border-color: #${(cfg as any).color.toString(16).padStart(6, '0')}">${short} ${(cfg as any).name}</div>`;
  }
  html += '</div></div>';

  // Per-enemy tuning (collapsible)
  html += '<div class="se-section" id="se-enemy-tuning">';
  html += '<div class="se-group-label se-collapsible" id="se-tuning-header">Enemy Properties &#x25BC;</div>';
  html += '<div id="se-tuning-body"></div>';
  html += '</div>';

  // Spawn count
  html += '<div class="se-section">';
  html += '<div class="se-spawn-count">Spawns: <span id="se-spawn-count">0</span></div>';
  html += '<div class="se-selected-info" id="se-selected-info"></div>';
  html += '<div class="se-btn se-action" id="se-clear">Clear Group</div>';
  html += '</div>';

  // Action buttons
  html += '<div class="se-section se-actions">';
  html += '<div class="se-btn se-action se-play" id="se-play">Play Wave</div>';
  html += '<div class="se-btn se-action se-save" id="se-save-spawns">Save All</div>';
  html += '<div class="se-btn se-action" id="se-copy-wave">Copy Wave</div>';
  html += '<div class="se-btn se-action" id="se-copy-all">Copy All</div>';
  html += '<div class="se-btn se-action" id="se-copy-enemies">Copy Enemy Config</div>';
  html += '</div>';

  html += '</div>'; // end se-spawn-content

  // ─── Level Tab Content ───
  html += '<div id="se-level-content" style="display:none">';

  // Arena preset selector
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Arena Preset</div>';
  html += '<div class="se-preset-row">';
  html += '<select id="se-preset-select" class="se-preset-select"><option value="">(unsaved)</option></select>';
  html += '<div class="se-btn se-action se-small" id="se-preset-load">Load</div>';
  html += '</div>';
  html += '<div class="se-preset-row" style="margin-top:4px">';
  html += '<div class="se-btn se-action se-save se-small" id="se-preset-save">Save Preset</div>';
  html += '<div class="se-btn se-action se-del se-small" id="se-preset-delete">Delete</div>';
  html += '</div>';
  html += '</div>';

  // Obstacles section
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Obstacles</div>';
  html += '<div id="se-obstacle-list" class="se-item-list"></div>';
  html += '<div class="se-btn se-action se-add" id="se-add-obstacle">+ Add Obstacle</div>';
  html += '</div>';

  // Pits section
  html += '<div class="se-section">';
  html += '<div class="se-group-label">Pits</div>';
  html += '<div id="se-pit-list" class="se-item-list"></div>';
  html += '<div class="se-btn se-action se-add" id="se-add-pit">+ Add Pit</div>';
  html += '</div>';

  // Selected object properties
  html += '<div class="se-section" id="se-level-props" style="display:none">';
  html += '<div class="se-group-label" id="se-level-props-label">Properties</div>';
  html += '<div id="se-level-props-body"></div>';
  html += '</div>';

  // Level actions
  html += '<div class="se-section se-actions">';
  html += '<div class="se-btn se-action se-save" id="se-save-arena">Save Arena</div>';
  html += '<div class="se-btn se-action" id="se-copy-arena">Copy Arena Config</div>';
  html += '</div>';

  html += '</div>'; // end se-level-content

  panel.innerHTML = html;
  document.body.appendChild(panel);

  // Cache tab content references
  spawnTabContent = document.getElementById('se-spawn-content');
  levelTabContent = document.getElementById('se-level-content');

  // Tooltip element
  const tooltipEl = document.createElement('div');
  tooltipEl.id = 'se-tooltip';
  document.body.appendChild(tooltipEl);

  // Wire up events after DOM is created
  setTimeout(() => wireEvents(), 0);
}

function wireEvents() {
  // Tab switching — "Level" tab hands off to the full Level Editor
  panel.querySelectorAll('.se-tab').forEach((tab: any) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'level') {
        // Close spawn editor, open the visual level editor instead
        exitEditor();
        toggleLevelEditor();
      } else {
        switchTab(tab.dataset.tab);
      }
    });
  });

  // Wave navigation
  document.getElementById('se-wave-prev')!.addEventListener('click', () => {
    editorState.waveIndex = Math.max(0, editorState.waveIndex - 1);
    editorState.groupIndex = 0;
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers(); refreshUI();
  });
  document.getElementById('se-wave-next')!.addEventListener('click', () => {
    editorState.waveIndex = Math.min(WAVES.length - 1, editorState.waveIndex + 1);
    editorState.groupIndex = 0;
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers(); refreshUI();
  });
  document.getElementById('se-wave-add')!.addEventListener('click', () => {
    const newWave = {
      wave: WAVES.length + 1,
      message: `Wave ${WAVES.length + 1}`,
      groups: [{
        id: `w${WAVES.length + 1}g1`,
        triggerDelay: 0,
        telegraphDuration: 1500,
        stagger: 200,
        spawns: [],
      }],
    };
    WAVES.push(newWave);
    editorState.waveIndex = WAVES.length - 1;
    editorState.groupIndex = 0;
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers(); refreshUI();
  });

  // Wave message input
  const waveMsgInput = document.getElementById('se-wave-msg') as any;
  waveMsgInput.addEventListener('input', () => {
    const wave = WAVES[editorState.waveIndex];
    if (wave) wave.message = waveMsgInput.value;
  });
  waveMsgInput.addEventListener('keydown', (e: any) => {
    e.stopPropagation();
    if (e.key === 'Enter') waveMsgInput.blur();
  });
  waveMsgInput.addEventListener('focus', () => waveMsgInput.select());

  // Group navigation
  document.getElementById('se-group-prev')!.addEventListener('click', () => {
    editorState.groupIndex = Math.max(0, editorState.groupIndex - 1);
    editorState.selectedSpawnIdx = -1;
    rebuildMarkers(); refreshUI();
  });
  document.getElementById('se-group-next')!.addEventListener('click', () => {
    const wave = WAVES[editorState.waveIndex];
    if (wave) {
      editorState.groupIndex = Math.min(wave.groups.length - 1, editorState.groupIndex + 1);
      editorState.selectedSpawnIdx = -1;
      rebuildMarkers(); refreshUI();
    }
  });
  document.getElementById('se-group-add')!.addEventListener('click', () => {
    const wave = WAVES[editorState.waveIndex];
    if (!wave) return;
    const newGroup = {
      id: `w${editorState.waveIndex + 1}g${wave.groups.length + 1}`,
      triggerDelay: 0,
      telegraphDuration: 1500,
      stagger: 200,
      spawns: [],
    };
    wave.groups.push(newGroup);
    editorState.groupIndex = wave.groups.length - 1;
    rebuildMarkers(); refreshUI();
  });
  document.getElementById('se-group-del')!.addEventListener('click', () => {
    const wave = WAVES[editorState.waveIndex];
    if (!wave || wave.groups.length <= 1) return; // keep at least 1 group
    wave.groups.splice(editorState.groupIndex, 1);
    editorState.groupIndex = Math.min(editorState.groupIndex, wave.groups.length - 1);
    rebuildMarkers(); refreshUI();
  });

  // Timing sliders
  const triggerSlider = document.getElementById('se-trigger') as any;
  const telegraphSlider = document.getElementById('se-telegraph') as any;
  const staggerSlider = document.getElementById('se-stagger') as any;

  // Push undo on mousedown (start of drag), not on every input tick
  const sliderUndoOnce = (slider: any) => {
    let pushed = false;
    slider.addEventListener('mousedown', () => { pushUndo(); pushed = true; });
    slider.addEventListener('touchstart', () => { if (!pushed) pushUndo(); pushed = true; });
    slider.addEventListener('mouseup', () => { pushed = false; });
    slider.addEventListener('touchend', () => { pushed = false; });
  };
  sliderUndoOnce(triggerSlider);
  sliderUndoOnce(telegraphSlider);
  sliderUndoOnce(staggerSlider);

  triggerSlider.addEventListener('input', () => {
    const group = getCurrentGroup();
    if (group) group.triggerDelay = parseInt(triggerSlider.value);
    (document.getElementById('se-trigger-val') as any).value = triggerSlider.value + ' ms';
  });
  telegraphSlider.addEventListener('input', () => {
    const group = getCurrentGroup();
    if (group) group.telegraphDuration = parseInt(telegraphSlider.value);
    (document.getElementById('se-telegraph-val') as any).value = telegraphSlider.value + ' ms';
  });
  staggerSlider.addEventListener('input', () => {
    const group = getCurrentGroup();
    if (group) group.stagger = parseInt(staggerSlider.value);
    (document.getElementById('se-stagger-val') as any).value = staggerSlider.value + ' ms';
  });

  // Wire text input handlers for timing sliders
  const timingInputs = [
    { inputId: 'se-trigger-val', sliderId: 'se-trigger', prop: 'triggerDelay', min: 0, max: 10000 },
    { inputId: 'se-telegraph-val', sliderId: 'se-telegraph', prop: 'telegraphDuration', min: 500, max: 5000 },
    { inputId: 'se-stagger-val', sliderId: 'se-stagger', prop: 'stagger', min: 0, max: 1000 },
  ];
  for (const t of timingInputs) {
    const inp = document.getElementById(t.inputId) as any;
    const slider = document.getElementById(t.sliderId) as any;
    const commitTimingValue = () => {
      const parsed = parseInt(inp.value);
      if (isNaN(parsed)) {
        const group = getCurrentGroup();
        inp.value = (group ? (group as any)[t.prop] : slider.value) + ' ms';
        return;
      }
      const clamped = Math.max(t.min, Math.min(t.max, parsed));
      const group = getCurrentGroup();
      if (group) (group as any)[t.prop] = clamped;
      slider.value = clamped;
      inp.value = clamped + ' ms';
    };
    inp.addEventListener('change', commitTimingValue);
    inp.addEventListener('blur', commitTimingValue);
    inp.addEventListener('keydown', (e: any) => {
      e.stopPropagation();
      if (e.key === 'Enter') inp.blur();
    });
    inp.addEventListener('focus', () => inp.select());
  }

  // Enemy type picker
  document.getElementById('se-type-picker')!.addEventListener('click', (e: any) => {
    const btn = e.target.closest('.se-type-btn');
    if (btn) {
      editorState.enemyType = btn.dataset.type;
      refreshUI();
    }
  });

  // Clear group
  document.getElementById('se-clear')!.addEventListener('click', () => {
    const group = getCurrentGroup();
    if (group) {
      pushUndo();
      group.spawns = [];
      rebuildMarkers(); refreshUI();
    }
  });

  // Play wave
  document.getElementById('se-play')!.addEventListener('click', playCurrentWave);

  // Copy wave
  document.getElementById('se-copy-wave')!.addEventListener('click', () => {
    const text = buildWaveText(editorState.waveIndex);
    copyToClipboard(text, document.getElementById('se-copy-wave')!);
  });

  // Copy all
  document.getElementById('se-copy-all')!.addEventListener('click', () => {
    const text = buildAllWavesText();
    copyToClipboard(text, document.getElementById('se-copy-all')!);
  });

  // Copy enemy config
  document.getElementById('se-copy-enemies')!.addEventListener('click', () => {
    const text = buildEnemyConfigText();
    copyToClipboard(text, document.getElementById('se-copy-enemies')!);
  });

  // Tuning section collapse toggle
  document.getElementById('se-tuning-header')!.addEventListener('click', () => {
    const body = document.getElementById('se-tuning-body')!;
    body.classList.toggle('collapsed');
    const header = document.getElementById('se-tuning-header')!;
    header.innerHTML = body.classList.contains('collapsed')
      ? 'Enemy Properties &#x25B6;'
      : 'Enemy Properties &#x25BC;';
  });

  // ─── Preset Events ───
  document.getElementById('se-preset-load')!.addEventListener('click', () => {
    const select = document.getElementById('se-preset-select') as any;
    if (select.value) loadPreset(select.value);
  });

  document.getElementById('se-preset-save')!.addEventListener('click', async () => {
    let name = currentPresetName;
    if (!name) {
      name = prompt('Preset name:');
      if (!name) return;
    }
    const btn = document.getElementById('se-preset-save')!;
    await savePreset(name);
    const orig = btn.textContent;
    btn.textContent = 'Saved \u2713';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
  });

  document.getElementById('se-preset-delete')!.addEventListener('click', async () => {
    const select = document.getElementById('se-preset-select') as any;
    const name = select.value;
    if (!name) return;
    if (!confirm(`Delete preset "${name}"?`)) return;
    await deletePreset(name);
  });

  // Fetch presets on startup
  refreshPresetDropdown();

  // ─── Level Tab Events ───
  document.getElementById('se-add-obstacle')!.addEventListener('click', () => {
    pushUndo();
    OBSTACLES.push({ x: 0, z: 0, w: 2, h: 1.5, d: 2 });
    levelState.selectedType = 'obstacle';
    levelState.selectedIdx = OBSTACLES.length - 1;
    onArenaChanged();
    rebuildLevelMarkers();
    refreshUI();
  });

  document.getElementById('se-add-pit')!.addEventListener('click', () => {
    pushUndo();
    PITS.push({ x: 0, z: 0, w: 3, d: 3 });
    levelState.selectedType = 'pit';
    levelState.selectedIdx = PITS.length - 1;
    onArenaChanged();
    rebuildLevelMarkers();
    refreshUI();
  });

  document.getElementById('se-copy-arena')!.addEventListener('click', () => {
    const text = buildArenaConfigText();
    copyToClipboard(text, document.getElementById('se-copy-arena')!);
  });

  // Save buttons
  document.getElementById('se-save-spawns')!.addEventListener('click', async () => {
    const btn = document.getElementById('se-save-spawns')!;
    const wavesText = buildAllWavesText();
    const enemiesText = buildEnemyConfigText();
    await saveToFile('config/waves.js', wavesText, btn);
    // Save enemies too (reuse same button — brief delay so "Saved" shows for waves)
    await saveToFile('config/enemies.js', enemiesText, btn);
  });

  document.getElementById('se-save-arena')!.addEventListener('click', () => {
    const text = buildArenaConfigText();
    saveToFile('config/arena.js', text, document.getElementById('se-save-arena')!);
  });

  // Prevent right-click context menu on canvas
  window.addEventListener('contextmenu', (e: any) => {
    if (active) e.preventDefault();
  });

  // Custom tooltip on hover — replaces native title for has-tooltip elements
  const tooltipEl = document.getElementById('se-tooltip')!;
  let tooltipTarget: any = null;

  panel.addEventListener('mouseover', (e: any) => {
    const el = e.target.closest('.has-tooltip');
    if (el && el.getAttribute('data-tip')) {
      tooltipTarget = el;
      tooltipEl.textContent = el.getAttribute('data-tip');
      tooltipEl.classList.add('visible');
      positionTooltip(el);
    }
  });

  panel.addEventListener('mouseout', (e: any) => {
    const el = e.target.closest('.has-tooltip');
    if (el === tooltipTarget) {
      tooltipTarget = null;
      tooltipEl.classList.remove('visible');
    }
  });

  function positionTooltip(targetEl: any) {
    const rect = targetEl.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    // Position to the right of the label, vertically centered
    let left = rect.right + 8;
    let top = rect.top + rect.height / 2 - tipRect.height / 2;
    // If it goes off-screen right, show below instead
    if (left + 200 > window.innerWidth) {
      left = rect.left;
      top = rect.bottom + 6;
    }
    // Clamp to viewport
    top = Math.max(4, Math.min(window.innerHeight - tipRect.height - 4, top));
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  // Cache DOM refs
  waveLabel = document.getElementById('se-wave-label');
  groupLabel = document.getElementById('se-group-label');
  spawnCountLabel = document.getElementById('se-spawn-count');
}

function getCurrentGroup() {
  const wave = WAVES[editorState.waveIndex];
  if (!wave) return null;
  return wave.groups[editorState.groupIndex] || null;
}

function refreshUI() {
  if (currentTab === 'spawn') {
    refreshSpawnUI();
  } else {
    refreshLevelUI();
  }
}

function refreshSpawnUI() {
  const wave = WAVES[editorState.waveIndex];

  // Wave label
  if (waveLabel) waveLabel.textContent = wave ? wave.wave : '?';

  // Wave message
  const waveMsgInput = document.getElementById('se-wave-msg') as any;
  if (waveMsgInput) waveMsgInput.value = wave ? (wave.message || '') : '';

  // Group label
  const group = getCurrentGroup();
  if (groupLabel) groupLabel.textContent = group ? group.id : '?';

  // Spawn count
  if (spawnCountLabel) spawnCountLabel.textContent = group ? group.spawns.length : 0;

  // Timing sliders
  const triggerSlider = document.getElementById('se-trigger') as any;
  const telegraphSlider = document.getElementById('se-telegraph') as any;
  const staggerSlider = document.getElementById('se-stagger') as any;
  if (group && triggerSlider) {
    triggerSlider.value = group.triggerDelay;
    (document.getElementById('se-trigger-val') as any).value = group.triggerDelay + ' ms';
    telegraphSlider.value = group.telegraphDuration;
    (document.getElementById('se-telegraph-val') as any).value = group.telegraphDuration + ' ms';
    staggerSlider.value = group.stagger;
    (document.getElementById('se-stagger-val') as any).value = group.stagger + ' ms';
  }

  // Enemy type buttons
  const btns = document.querySelectorAll('.se-type-btn');
  btns.forEach((btn: any) => {
    btn.classList.toggle('selected', btn.dataset.type === editorState.enemyType);
  });

  // Selected spawn info
  const infoEl = document.getElementById('se-selected-info') as any;
  if (infoEl) {
    if (editorState.selectedSpawnIdx >= 0 && group && group.spawns[editorState.selectedSpawnIdx]) {
      const s = group.spawns[editorState.selectedSpawnIdx];
      const typeName = (ENEMY_TYPES as any)[s.type] ? (ENEMY_TYPES as any)[s.type].name : s.type;
      infoEl.textContent = `Selected: ${typeName} (${s.x}, ${s.z})`;
      infoEl.style.display = 'block';
    } else {
      infoEl.style.display = 'none';
    }
  }

  // Per-enemy tuning sliders (rebuild only when type changes)
  rebuildEnemyTuningSliders();
}

function refreshLevelUI() {
  // Rebuild obstacle list
  const obsList = document.getElementById('se-obstacle-list');
  if (obsList) {
    let html = '';
    for (let i = 0; i < OBSTACLES.length; i++) {
      const o = OBSTACLES[i];
      const sel = levelState.selectedType === 'obstacle' && levelState.selectedIdx === i;
      html += `<div class="se-item-row${sel ? ' selected' : ''}" data-type="obstacle" data-idx="${i}">`;
      html += `<span class="se-item-label">Obs ${i + 1}</span>`;
      html += `<span class="se-item-coords">(${o.x}, ${o.z})</span>`;
      html += `<span class="se-item-dims">${o.w}\u00d7${o.d}\u00d7${o.h}</span>`;
      html += '</div>';
    }
    obsList.innerHTML = html;

    // Click handlers for list items
    obsList.querySelectorAll('.se-item-row').forEach((row: any) => {
      row.addEventListener('click', () => {
        levelState.selectedType = row.dataset.type;
        levelState.selectedIdx = parseInt(row.dataset.idx);
        rebuildLevelMarkers();
        refreshLevelUI();
      });
    });
  }

  // Rebuild pit list
  const pitList = document.getElementById('se-pit-list');
  if (pitList) {
    let html = '';
    for (let i = 0; i < PITS.length; i++) {
      const p = PITS[i];
      const sel = levelState.selectedType === 'pit' && levelState.selectedIdx === i;
      html += `<div class="se-item-row${sel ? ' selected' : ''}" data-type="pit" data-idx="${i}">`;
      html += `<span class="se-item-label">Pit ${i + 1}</span>`;
      html += `<span class="se-item-coords">(${p.x}, ${p.z})</span>`;
      html += `<span class="se-item-dims">${p.w}\u00d7${p.d}</span>`;
      html += '</div>';
    }
    pitList.innerHTML = html;

    pitList.querySelectorAll('.se-item-row').forEach((row: any) => {
      row.addEventListener('click', () => {
        levelState.selectedType = row.dataset.type;
        levelState.selectedIdx = parseInt(row.dataset.idx);
        rebuildLevelMarkers();
        refreshLevelUI();
      });
    });
  }

  // Properties panel for selected object
  const propsPanel = document.getElementById('se-level-props') as any;
  const propsLabel = document.getElementById('se-level-props-label') as any;
  const propsBody = document.getElementById('se-level-props-body') as any;

  if (propsPanel && levelState.selectedType && levelState.selectedIdx >= 0) {
    const arr = levelState.selectedType === 'obstacle' ? OBSTACLES : PITS;
    const obj = arr[levelState.selectedIdx] as any;
    if (!obj) {
      propsPanel.style.display = 'none';
      return;
    }

    propsPanel.style.display = 'block';
    const label = levelState.selectedType === 'obstacle'
      ? `Obstacle ${levelState.selectedIdx + 1}`
      : `Pit ${levelState.selectedIdx + 1}`;
    propsLabel.textContent = label;

    const sliders = levelState.selectedType === 'obstacle'
      ? [
          { label: 'X', key: 'x', min: -19, max: 19, step: 0.5, unit: '' },
          { label: 'Z', key: 'z', min: -19, max: 19, step: 0.5, unit: '' },
          { label: 'Width', key: 'w', min: 0.5, max: 10, step: 0.5, unit: 'u' },
          { label: 'Depth', key: 'd', min: 0.5, max: 10, step: 0.5, unit: 'u' },
          { label: 'Height', key: 'h', min: 0.5, max: 5, step: 0.5, unit: 'u' },
        ]
      : [
          { label: 'X', key: 'x', min: -19, max: 19, step: 0.5, unit: '' },
          { label: 'Z', key: 'z', min: -19, max: 19, step: 0.5, unit: '' },
          { label: 'Width', key: 'w', min: 1, max: 10, step: 0.5, unit: 'u' },
          { label: 'Depth', key: 'd', min: 1, max: 10, step: 0.5, unit: 'u' },
        ];

    let html = '';
    for (const s of sliders) {
      const val = obj[s.key];
      const display = Number.isInteger(val) ? val : parseFloat(val).toFixed(1);
      const unitDisplay = s.unit ? ' ' + s.unit : '';
      html += `<div class="se-slider-row">`;
      html += `<span>${s.label}</span>`;
      html += `<input type="range" class="se-level-slider" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${val}">`;
      html += `<input type="text" class="se-level-val" data-key="${s.key}" value="${display}${unitDisplay}">`;
      html += `</div>`;
    }

    // Delete button
    html += `<div class="se-btn se-action se-del" id="se-delete-level-obj">Delete ${levelState.selectedType === 'obstacle' ? 'Obstacle' : 'Pit'}</div>`;

    propsBody.innerHTML = html;

    // Wire slider events
    propsBody.querySelectorAll('.se-level-slider').forEach((el: any) => {
      const key = el.dataset.key;
      const sdef = sliders.find((s: any) => s.key === key)!;
      el.addEventListener('input', () => {
        const newVal = parseFloat(el.value);
        const arrRef = levelState.selectedType === 'obstacle' ? OBSTACLES : PITS;
        const objRef = arrRef[levelState.selectedIdx] as any;
        if (!objRef) return;
        objRef[key] = newVal;
        const unitDisplay = sdef.unit ? ' ' + sdef.unit : '';
        const display = Number.isInteger(newVal) ? newVal : parseFloat(newVal as any).toFixed(1);
        propsBody.querySelector(`.se-level-val[data-key="${key}"]`).value = display + unitDisplay;
        onArenaChanged();
        rebuildLevelMarkers();
      });

      // Undo on first mousedown
      let pushed = false;
      el.addEventListener('mousedown', () => { pushUndo(); pushed = true; });
      el.addEventListener('mouseup', () => { pushed = false; });
    });

    // Wire text input handlers
    propsBody.querySelectorAll('.se-level-val').forEach((inp: any) => {
      const key = inp.dataset.key;
      const sdef = sliders.find((s: any) => s.key === key)!;
      const commitValue = () => {
        const parsed = parseFloat(inp.value);
        if (isNaN(parsed)) {
          const arrRef = levelState.selectedType === 'obstacle' ? OBSTACLES : PITS;
          const objRef = arrRef[levelState.selectedIdx] as any;
          if (objRef) {
            const val = objRef[key];
            const unitDisplay = sdef.unit ? ' ' + sdef.unit : '';
            inp.value = (Number.isInteger(val) ? val : parseFloat(val).toFixed(1)) + unitDisplay;
          }
          return;
        }
        const clamped = Math.max(sdef.min, Math.min(sdef.max, parsed));
        const arrRef = levelState.selectedType === 'obstacle' ? OBSTACLES : PITS;
        const objRef = arrRef[levelState.selectedIdx] as any;
        if (!objRef) return;
        pushUndo();
        objRef[key] = clamped;
        const rangeEl = propsBody.querySelector(`.se-level-slider[data-key="${key}"]`);
        if (rangeEl) rangeEl.value = clamped;
        const unitDisplay = sdef.unit ? ' ' + sdef.unit : '';
        inp.value = (Number.isInteger(clamped) ? clamped : parseFloat(clamped as any).toFixed(1)) + unitDisplay;
        onArenaChanged();
        rebuildLevelMarkers();
      };
      inp.addEventListener('change', commitValue);
      inp.addEventListener('blur', commitValue);
      inp.addEventListener('keydown', (e: any) => {
        e.stopPropagation();
        if (e.key === 'Enter') inp.blur();
      });
      inp.addEventListener('focus', () => inp.select());
    });

    // Delete button
    const deleteBtn = document.getElementById('se-delete-level-obj');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        pushUndo();
        if (levelState.selectedType === 'obstacle') {
          OBSTACLES.splice(levelState.selectedIdx, 1);
        } else {
          PITS.splice(levelState.selectedIdx, 1);
        }
        levelState.selectedType = null;
        levelState.selectedIdx = -1;
        onArenaChanged();
        rebuildLevelMarkers();
        refreshLevelUI();
      });
    }
  } else if (propsPanel) {
    propsPanel.style.display = 'none';
  }
}

// ─── Per-Enemy Tuning Sliders ───

function rebuildEnemyTuningSliders() {
  const container = document.getElementById('se-tuning-body');
  if (!container) return;

  // Only rebuild if type changed
  if (lastBuiltTuningType === editorState.enemyType) {
    // Just update values without rebuilding DOM
    updateTuningSliderValues();
    return;
  }
  lastBuiltTuningType = editorState.enemyType;

  const sliders = ENEMY_TUNING_SLIDERS[editorState.enemyType];
  if (!sliders) {
    container.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:9px;padding:4px;">No tuning available</div>';
    return;
  }

  const cfg = (ENEMY_TYPES as any)[editorState.enemyType];
  let html = '';
  for (let i = 0; i < sliders.length; i++) {
    const s = sliders[i];
    const val = getNestedValue(cfg, s.key);
    const displayVal = (val != null) ? (Number.isInteger(s.step) ? val : parseFloat(val).toFixed(2)) : '?';
    const unitStr = s.unit || s.suffix || '';
    const unitDisplay = unitStr ? ' ' + unitStr : '';
    const tipAttr = s.tip ? ` data-tip="${s.tip.replace(/"/g, '&quot;')}"` : '';
    const tipClass = s.tip ? ' has-tooltip' : '';
    html += `<div class="se-slider-row">`;
    html += `<span class="${tipClass}"${tipAttr}>${s.label}</span>`;
    html += `<input type="range" class="se-tuning-slider" data-idx="${i}" min="${s.min}" max="${s.max}" step="${s.step}" value="${val != null ? val : s.min}">`;
    html += `<input type="text" class="se-tuning-val" data-idx="${i}" value="${displayVal}${unitDisplay}">`;
    html += `</div>`;
  }
  container.innerHTML = html;

  // Wire slider events
  const sliderEls = container.querySelectorAll('.se-tuning-slider');
  sliderEls.forEach((el: any) => {
    const idx = parseInt(el.dataset.idx);
    const s = sliders[idx];

    el.addEventListener('input', () => {
      const newVal = parseFloat(el.value);
      setNestedValue((ENEMY_TYPES as any)[editorState.enemyType], s.key, newVal);
      const unitStr = s.unit || s.suffix || '';
      const unitDisplay = unitStr ? ' ' + unitStr : '';
      const display = Number.isInteger(s.step) ? newVal : parseFloat(newVal as any).toFixed(2);
      container.querySelector(`.se-tuning-val[data-idx="${idx}"]`)!.setAttribute('value', display + unitDisplay);
      (container.querySelector(`.se-tuning-val[data-idx="${idx}"]`) as any).value = display + unitDisplay;
    });
  });

  // Wire text input handlers for direct value entry
  const valInputs = container.querySelectorAll('.se-tuning-val');
  valInputs.forEach((inp: any) => {
    const idx = parseInt(inp.dataset.idx);
    const s = sliders[idx];

    const commitValue = () => {
      const parsed = parseFloat(inp.value);
      if (isNaN(parsed)) {
        // Revert to current config value
        const cur = getNestedValue((ENEMY_TYPES as any)[editorState.enemyType], s.key);
        const unitStr = s.unit || s.suffix || '';
        const unitDisplay = unitStr ? ' ' + unitStr : '';
        const display = (cur != null) ? (Number.isInteger(s.step) ? cur : parseFloat(cur).toFixed(2)) : s.min;
        inp.value = display + unitDisplay;
        return;
      }
      const clamped = Math.max(s.min, Math.min(s.max, parsed));
      setNestedValue((ENEMY_TYPES as any)[editorState.enemyType], s.key, clamped);
      // Sync range slider
      const rangeEl = container.querySelector(`.se-tuning-slider[data-idx="${idx}"]`) as any;
      if (rangeEl) rangeEl.value = clamped;
      // Re-format display
      const unitStr = s.unit || s.suffix || '';
      const unitDisplay = unitStr ? ' ' + unitStr : '';
      const display = Number.isInteger(s.step) ? clamped : parseFloat(clamped as any).toFixed(2);
      inp.value = display + unitDisplay;
    };

    inp.addEventListener('change', commitValue);
    inp.addEventListener('blur', commitValue);

    // Stop keyboard events from reaching the game while typing in inputs
    inp.addEventListener('keydown', (e: any) => {
      e.stopPropagation();
      if (e.key === 'Enter') inp.blur();
    });

    // Select all text on focus for easy overwriting
    inp.addEventListener('focus', () => inp.select());
  });
}

function updateTuningSliderValues() {
  const container = document.getElementById('se-tuning-body');
  if (!container) return;
  const sliders = ENEMY_TUNING_SLIDERS[editorState.enemyType];
  if (!sliders) return;
  const cfg = (ENEMY_TYPES as any)[editorState.enemyType];

  const sliderEls = container.querySelectorAll('.se-tuning-slider');
  sliderEls.forEach((el: any) => {
    const idx = parseInt(el.dataset.idx);
    const s = sliders[idx];
    if (!s) return;
    const val = getNestedValue(cfg, s.key);
    if (val != null) {
      el.value = val;
      const unitStr = s.unit || s.suffix || '';
      const unitDisplay = unitStr ? ' ' + unitStr : '';
      const display = Number.isInteger(s.step) ? val : parseFloat(val).toFixed(2);
      (container.querySelector(`.se-tuning-val[data-idx="${idx}"]`) as any).value = display + unitDisplay;
    }
  });
}

function buildEnemyConfigText() {
  let text = 'export const ENEMY_TYPES = {\n';
  for (const [name, cfg] of Object.entries(ENEMY_TYPES)) {
    text += `  ${name}: ${JSON.stringify(cfg, null, 4).split('\n').map((l: string, i: number) => i === 0 ? l : '  ' + l).join('\n')},\n`;
  }
  text += '};\n';
  return text;
}

function buildArenaConfigText() {
  let text = '// Arena layout — shared between renderer (meshes) and physics (collision)\n';
  text += '// All obstacles and walls defined here so designer can rearrange the arena\n\n';
  text += `export let ARENA_HALF_X = ${ARENA_HALF_X};\n`;
  text += `export let ARENA_HALF_Z = ${ARENA_HALF_Z};\n`;
  text += `export let ARENA_HALF = ${ARENA_HALF_X}; // legacy alias\n\n`;
  text += '// Obstacles: x, z = center position; w, d = width/depth on xz plane; h = height (visual only)\n';
  text += 'export const OBSTACLES = [\n';
  for (const o of OBSTACLES) {
    text += `  { x: ${o.x}, z: ${o.z}, w: ${o.w}, h: ${o.h}, d: ${o.d} },\n`;
  }
  text += '];\n\n';
  text += '// Walls: auto-generated from ARENA_HALF\n';
  text += 'export const WALL_THICKNESS = 0.5;\n';
  text += 'export const WALL_HEIGHT = 2;\n\n';
  text += '// Pits: x, z = center position; w, d = width/depth on xz plane\n';
  text += '// Entities that enter a pit die instantly. Enemies edge-slide around them.\n';
  text += 'export const PITS = [\n';
  for (const p of PITS) {
    text += `  { x: ${p.x}, z: ${p.z}, w: ${p.w}, d: ${p.d} },\n`;
  }
  text += '];\n';
  // Static helper functions — appended verbatim
  text += ARENA_STATIC_SUFFIX;
  return text;
}

// Static portion of arena.js (helper functions that don't change)
const ARENA_STATIC_SUFFIX = `
// Convert pits to AABB format for collision
export function getPitBounds() {
  return PITS.map(p => ({
    minX: p.x - p.w / 2,
    maxX: p.x + p.w / 2,
    minZ: p.z - p.d / 2,
    maxZ: p.z + p.d / 2,
  }));
}

// Pre-computed AABB list for collision (obstacles + walls)
// Each entry: { minX, maxX, minZ, maxZ }
export function getCollisionBounds() {
  const bounds = [];

  // Obstacles
  for (const o of OBSTACLES) {
    bounds.push({
      minX: o.x - o.w / 2,
      maxX: o.x + o.w / 2,
      minZ: o.z - o.d / 2,
      maxZ: o.z + o.d / 2,
    });
  }

  // Walls
  const hx = ARENA_HALF_X;
  const hz = ARENA_HALF_Z;
  const t = WALL_THICKNESS;
  // North wall (far end, +Z)
  bounds.push({ minX: -hx - t/2, maxX: hx + t/2, minZ: hz - t/2, maxZ: hz + t/2 });
  // South wall (near end, -Z)
  bounds.push({ minX: -hx - t/2, maxX: hx + t/2, minZ: -hz - t/2, maxZ: -hz + t/2 });
  // East wall (+X)
  bounds.push({ minX: hx - t/2, maxX: hx + t/2, minZ: -hz - t/2, maxZ: hz + t/2 });
  // West wall (-X)
  bounds.push({ minX: -hx - t/2, maxX: -hx + t/2, minZ: -hz - t/2, maxZ: hz + t/2 });

  return bounds;
}
`;

// ─── Play Wave ───

function playCurrentWave() {
  exitEditor();
  // Clear enemies and projectiles, then start the wave
  clearEnemies(gameStateRef);
  releaseAllProjectiles();
  resetWaveRunner();
  gameStateRef.phase = 'playing';
  startWave(editorState.waveIndex, gameStateRef);
}

// ─── Save to File (via dev server) ───

async function saveToFile(filename: string, content: string, btnEl: any) {
  const orig = btnEl.textContent;
  btnEl.textContent = 'Saving...';
  try {
    const res = await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, content }),
    });
    if (!res.ok) throw new Error(res.statusText);
    btnEl.textContent = 'Saved \u2713';
    btnEl.classList.add('copied');
  } catch (e) {
    btnEl.textContent = 'Error!';
    console.error('[spawnEditor] Save failed:', filename, e);
  }
  setTimeout(() => { btnEl.textContent = orig; btnEl.classList.remove('copied'); }, 1200);
}

// ─── Copy to Clipboard ───

function copyToClipboard(text: string, btnEl: any) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = 'Copied!';

    btnEl.classList.add('copied');
    setTimeout(() => {
      btnEl.textContent = orig;
      btnEl.classList.remove('copied');
    }, 1200);
  });
}

function buildWaveText(waveIdx: number) {
  const wave = WAVES[waveIdx];
  if (!wave) return '';
  return formatWaveObj(wave);
}

function buildAllWavesText() {
  const lines = [
    '// Wave definitions — each wave has groups of spawns with independent timing',
    '// Designer edits this file or uses the spawn editor (backtick key) to place visually',
    '',
    'export const WAVES = [',
  ];
  for (let i = 0; i < WAVES.length; i++) {
    lines.push('  ' + formatWaveObj(WAVES[i]).split('\n').join('\n  ') + ',');
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

function formatWaveObj(wave: any) {
  let s = '{\n';
  s += `  wave: ${wave.wave},\n`;
  s += `  message: '${wave.message}',\n`;
  s += `  groups: [\n`;
  for (const g of wave.groups) {
    s += `    {\n`;
    s += `      id: '${g.id}',\n`;
    s += `      triggerDelay: ${g.triggerDelay},\n`;
    s += `      telegraphDuration: ${g.telegraphDuration},\n`;
    s += `      stagger: ${g.stagger},\n`;
    s += `      spawns: [\n`;
    for (const sp of g.spawns) {
      s += `        { type: '${sp.type}', x: ${sp.x}, z: ${sp.z} },\n`;
    }
    s += `      ],\n`;
    s += `    },\n`;
  }
  s += `  ]\n`;
  s += `}`;
  return s;
}

// ─── Styles ───

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #spawn-editor {
      position: fixed;
      top: 60px;
      left: 20px;
      width: 320px;
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      z-index: 200;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      pointer-events: all;
      background: rgba(10, 10, 26, 0.94);
      border: 1px solid rgba(68, 255, 136, 0.2);
      border-radius: 6px;
      padding: 14px;
      backdrop-filter: blur(8px);
    }

    #spawn-editor.hidden {
      display: none;
    }

    #spawn-editor::-webkit-scrollbar {
      width: 4px;
    }
    #spawn-editor::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    #spawn-editor::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 2px;
    }

    /* ─── Tabs ─── */
    .se-tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 12px;
      border-bottom: 1px solid rgba(68, 255, 136, 0.15);
      padding-bottom: 0;
    }

    .se-tab {
      flex: 1;
      text-align: center;
      padding: 6px 0;
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      user-select: none;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
      margin-bottom: -1px;
    }

    .se-tab:hover {
      color: rgba(255, 255, 255, 0.7);
    }

    .se-tab.active {
      color: rgba(68, 255, 136, 0.9);
      border-bottom-color: rgba(68, 255, 136, 0.8);
    }

    .se-title {
      font-size: 10px;
      color: rgba(68, 255, 136, 0.8);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 12px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(68, 255, 136, 0.15);
    }

    .se-section {
      margin-bottom: 10px;
    }

    .se-group-label {
      font-size: 9px;
      color: rgba(68, 255, 136, 0.5);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .se-wave-msg {
      width: 100%;
      margin-top: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      padding: 4px 6px;
      outline: none;
      box-sizing: border-box;
    }
    .se-wave-msg:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }
    .se-wave-msg:focus {
      border-color: rgba(68, 255, 136, 0.5);
      background: rgba(0, 0, 0, 0.3);
    }

    .se-selector {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .se-selector span {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
      min-width: 30px;
      text-align: center;
    }

    .se-btn {
      padding: 3px 8px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      cursor: pointer;
      user-select: none;
      transition: all 0.12s ease;
    }

    .se-btn:hover {
      background: rgba(68, 255, 136, 0.1);
      border-color: rgba(68, 255, 136, 0.4);
      color: rgba(255, 255, 255, 0.9);
    }

    .se-btn.se-add {
      color: rgba(68, 255, 136, 0.7);
    }

    .se-btn.se-del {
      color: rgba(255, 68, 102, 0.7);
    }
    .se-btn.se-del:hover {
      background: rgba(255, 68, 102, 0.1);
      border-color: rgba(255, 68, 102, 0.4);
    }

    .se-slider-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;
    }

    .se-slider-row span:first-child {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      width: 75px;
      flex-shrink: 0;
    }

    .se-slider-row span.has-tooltip {
      cursor: help;
      text-decoration: underline dotted rgba(255, 255, 255, 0.2);
      text-underline-offset: 2px;
    }

    .se-slider-row input[type="range"] {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(100, 100, 160, 0.3);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .se-slider-row input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #44ff88;
      cursor: pointer;
      border: none;
    }

    .se-slider-row span:last-child {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.7);
      min-width: 55px;
      text-align: right;
      flex-shrink: 0;
    }

    .se-slider-row input[type="text"] {
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      min-width: 55px;
      max-width: 65px;
      text-align: right;
      padding: 1px 4px;
      flex-shrink: 0;
      outline: none;
    }
    .se-slider-row input[type="text"]:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }
    .se-slider-row input[type="text"]:focus {
      border-color: rgba(68, 255, 136, 0.5);
      color: rgba(255, 255, 255, 0.9);
      background: rgba(0, 0, 0, 0.3);
    }

    .se-type-picker {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .se-type-btn {
      padding: 4px 8px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      cursor: pointer;
      user-select: none;
      transition: all 0.12s ease;
    }

    .se-type-btn:hover {
      opacity: 1;
      color: rgba(255, 255, 255, 0.9);
    }

    .se-type-btn.selected {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border-width: 2px;
      opacity: 1;
    }

    .se-collapsible {
      cursor: pointer;
      user-select: none;
    }
    .se-collapsible:hover {
      color: rgba(68, 255, 136, 0.8);
    }

    #se-tuning-body {
      max-height: 300px;
      overflow-y: auto;
      transition: max-height 0.2s ease;
    }
    #se-tuning-body.collapsed {
      max-height: 0;
      overflow: hidden;
    }
    #se-tuning-body::-webkit-scrollbar {
      width: 4px;
    }
    #se-tuning-body::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    #se-tuning-body::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 2px;
    }

    /* .se-tuning-val styling handled by input[type="text"] rule above */

    .se-spawn-count {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 4px;
    }

    .se-selected-info {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.8);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      padding: 4px 6px;
      margin-bottom: 6px;
      display: none;
    }

    .se-action {
      margin-top: 4px;
      text-align: center;
      padding: 5px 0;
    }

    .se-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .se-play {
      color: rgba(68, 255, 136, 0.8) !important;
      border-color: rgba(68, 255, 136, 0.3) !important;
    }
    .se-play:hover {
      background: rgba(68, 255, 136, 0.12) !important;
      border-color: rgba(68, 255, 136, 0.6) !important;
    }

    .se-save {
      color: rgba(68, 200, 255, 0.8) !important;
      border-color: rgba(68, 200, 255, 0.3) !important;
    }
    .se-save:hover {
      background: rgba(68, 200, 255, 0.12) !important;
      border-color: rgba(68, 200, 255, 0.6) !important;
    }

    .se-btn.copied {
      color: #ffcc44 !important;
      border-color: rgba(255, 204, 68, 0.4) !important;
    }

    /* ─── Preset Selector ─── */
    .se-preset-row {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .se-preset-select {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      padding: 4px 6px;
      outline: none;
    }

    .se-preset-select:focus {
      border-color: rgba(68, 200, 255, 0.5);
    }

    .se-btn.se-small {
      font-size: 9px;
      padding: 3px 8px;
    }

    /* ─── Level Tab Item List ─── */
    .se-item-list {
      max-height: 180px;
      overflow-y: auto;
      margin-bottom: 6px;
    }

    .se-item-list::-webkit-scrollbar {
      width: 4px;
    }
    .se-item-list::-webkit-scrollbar-thumb {
      background: rgba(68, 255, 136, 0.3);
      border-radius: 2px;
    }

    .se-item-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.6);
      border: 1px solid transparent;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.1s ease;
      margin-bottom: 2px;
    }

    .se-item-row:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .se-item-row.selected {
      background: rgba(68, 255, 136, 0.08);
      border-color: rgba(68, 255, 136, 0.3);
      color: rgba(255, 255, 255, 0.9);
    }

    .se-item-label {
      flex-shrink: 0;
      width: 50px;
    }

    .se-item-coords {
      color: rgba(255, 255, 255, 0.4);
      flex: 1;
    }

    .se-item-dims {
      color: rgba(100, 180, 255, 0.6);
      flex-shrink: 0;
    }

    #se-tooltip {
      position: fixed;
      z-index: 300;
      max-width: 220px;
      padding: 6px 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 10px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(10, 10, 30, 0.95);
      border: 1px solid rgba(68, 255, 136, 0.4);
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease;
      backdrop-filter: blur(6px);
    }

    #se-tooltip.visible {
      opacity: 1;
    }

    #editor-banner {
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(68, 255, 136, 0.8);
      background: rgba(10, 10, 26, 0.85);
      border: 1px solid rgba(68, 255, 136, 0.3);
      border-radius: 4px;
      padding: 5px 16px;
      z-index: 250;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    #editor-banner.visible {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}
