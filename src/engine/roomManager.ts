// Room Manager — loads rooms, incremental pack spawning, door integration
// Replaces the old wave-based system with escalating pack dispatch
// Player enters from +Z (bottom-left in iso), progresses toward -Z (top-right)
// Door is at -Z end; unlocks when room is cleared, requires interact to enter

import { ROOMS, RoomDefinition } from '../config/rooms';
import { setHeightZones } from '../config/terrain';
import { resetAerialVerbs } from './aerialVerbs';
import { clearAllTags } from './tags';
import { clearCarriers } from './entityCarrier';
import { cleanupGroundShadows, initGroundShadows } from './groundShadows';
import { clearVisionCones } from './visionCone';
import { clearLaunchPillars } from '../effects/launchPillar';
import { clearLaunchIndicator } from '../effects/launchIndicator';
import { setProfile } from './profileManager';
import { setArenaConfig, ARENA_HALF_X, ARENA_HALF_Z } from '../config/arena';
import { SPAWN_CONFIG } from '../config/spawn';
import { spawnEnemy, clearEnemies } from '../entities/enemy';
import { getPlayerPos, setPlayerVisual } from '../entities/player';
import { setPlayerPosition } from '../entities/player';
import { getInputState } from './input';
import { releaseAllProjectiles } from '../entities/projectile';
import { clearMortarProjectiles, clearIcePatches } from '../entities/mortarProjectile';
import { clearAoeTelegraphs } from './aoeTelegraph';
import { clearDamageNumbers } from '../ui/damageNumbers';
import { clearEffectGhosts } from './physics';
import { clearParticles } from './particles';
import { invalidateCollisionBounds, getBounds, getPits } from './physics';
import { rebuildArenaVisuals, setFrustumSize } from './renderer';
import { emit, on } from './events';
import { createTelegraph, updateTelegraph, removeTelegraph, initTelegraph } from './telegraph';
import { triggerRoomHighlights, clearHighlights } from './roomHighlights';
import { initDoor, createDoor, unlockDoor, updateDoor, removeDoor } from './door';
import { DOOR_CONFIG } from '../config/door';
import { SpawnPack } from '../types/index';
import { createPhysicsObject, createPhysicsObjectMesh, clearPhysicsObjects, resetPhysicsObjectIds } from '../entities/physicsObject';
import { resetBendMode, setLockedBends } from './bendMode';
import { createPressurePlate, createPressurePlateMesh, clearPressurePlates } from './pressurePlate';
import { initRoomIntro, showRoomIntro } from '../ui/roomIntro';

// ─── State ───

let currentRoomIndex = 0;
let packIndex = 0;           // next pack to dispatch
let totalKills = 0;          // enemies killed in this room
let roomBudgetTotal = 0;     // total enemies in all packs for this room
let roomCleared = false;
let spawnCooldownTimer = 0;  // ms remaining before next pack can dispatch
let finalWaveAnnounced = false;
let restRoomTimer = 0;       // timer for rest room door auto-open

// Active telegraphs — packs being telegraphed before enemies materialize
interface ActiveTelegraphGroup {
  telegraphs: any[];          // telegraph visual objects (one per enemy)
  pack: SpawnPack;
  positions: { x: number; z: number }[];
  timer: number;              // ms remaining
  duration: number;           // total telegraph duration
  packIdx: number;
}
let activeTelegraphs: ActiveTelegraphGroup[] = [];

let announceEl: HTMLElement | null = null;
let sceneRef: any = null;
let onContinueCallback: (() => void) | null = null;

// ─── Public API ───

export function initRoomManager(scene: any, onIntroComplete?: () => void) {
  sceneRef = scene;
  onContinueCallback = onIntroComplete ?? null;
  announceEl = document.getElementById('wave-announce');
  initTelegraph(scene);
  initDoor(scene);
  initRoomIntro();

  // Track enemy deaths for spawn dispatch
  on('enemyDied', () => {
    totalKills++;
  });
}

export function loadRoom(index: number, gameState: any) {
  if (index >= ROOMS.length) {
    showAnnounce('VICTORY!');
    return;
  }

  const room = ROOMS[index];
  currentRoomIndex = index;
  packIndex = 0;
  totalKills = 0;
  roomCleared = false;
  spawnCooldownTimer = 0;
  finalWaveAnnounced = false;
  activeTelegraphs = [];

  // Count total enemies in budget
  roomBudgetTotal = room.spawnBudget.packs.reduce(
    (sum, p) => sum + p.enemies.length, 0
  );

  restRoomTimer = 0;

  // Clear everything from previous room
  clearHighlights();
  clearEnemies(gameState)
  releaseAllProjectiles();
  clearMortarProjectiles();
  clearIcePatches();
  clearAoeTelegraphs();
  clearDamageNumbers();
  clearEffectGhosts();
  clearParticles();
  removeDoor();
  resetAerialVerbs();
  clearAllTags();
  clearCarriers();
  clearLaunchPillars();
  clearLaunchIndicator();
  cleanupGroundShadows();
  clearVisionCones();
  clearPhysicsObjects(gameState, sceneRef);
  clearPressurePlates(gameState, sceneRef);
  resetBendMode();
  if (room.lockedBends && room.lockedBends.length > 0) {
    setLockedBends(room.lockedBends);
  }
  resetPhysicsObjectIds();

  // Swap arena layout
  setArenaConfig(room.obstacles, room.pits, room.arenaHalfX, room.arenaHalfZ);
  setHeightZones(room.heightZones ?? []);
  invalidateCollisionBounds();
  rebuildArenaVisuals();
  setFrustumSize(room.frustumSize ?? 12);
  initGroundShadows();

  // Spawn physics objects (if room defines them)
  if (room.physicsObjects) {
    for (const placement of room.physicsObjects) {
      const obj = createPhysicsObject(placement);
      createPhysicsObjectMesh(obj, sceneRef);
      gameState.physicsObjects.push(obj);
    }
  }

  // Spawn pressure plates (if room defines them)
  if (room.pressurePlates) {
    for (const placement of room.pressurePlates) {
      const plate = createPressurePlate(placement);
      createPressurePlateMesh(plate, sceneRef);
      gameState.pressurePlates.push(plate);
    }
  }

  // Set player position
  setPlayerPosition(room.playerStart.x, room.playerStart.z);

  // Update game state
  gameState.currentWave = index + 1;

  // Profile switch (before special room handling so it applies to all rooms)
  setProfile(room.profile);
  setPlayerVisual(room.profile);

  // Show room intro modal — gameplay paused until Continue
  gameState.phase = 'intro';
  showRoomIntro(room, () => {
    gameState.phase = 'playing';
    if (onContinueCallback) onContinueCallback();
  });

  // Handle special rooms
  if (room.isRestRoom) {
    // Heal player
    gameState.playerHealth = gameState.playerMaxHealth;
    emit({ type: 'playerHealed', amount: gameState.playerMaxHealth, position: { x: room.playerStart.x, z: room.playerStart.z } });
    emit({ type: 'restRoomEntered', roomIndex: index });
    roomCleared = true; // no enemies to fight
    // Create door that auto-opens after a delay
    if (index + 1 < ROOMS.length) {
      createDoor(room.arenaHalfX, room.arenaHalfZ, index);
      restRoomTimer = DOOR_CONFIG.restPause;
    }
    return;
  }

  if (room.isVictoryRoom) {
    showAnnounce('VICTORY!');
    emit({ type: 'roomCleared', roomIndex: index });
    roomCleared = true;
    // No door — victory room is the end
    return;
  }

  // Combat room — create locked door at far end
  if (index + 1 < ROOMS.length) {
    createDoor(room.arenaHalfX, room.arenaHalfZ, index);
  }

  // Sandbox mode — door starts unlocked, enemies still spawn
  if (room.sandboxMode) {
    unlockDoor();
  }

  // Trigger feature highlights (pits, obstacles, etc.)
  if (room.highlights && room.highlights.length > 0) {
    triggerRoomHighlights(room.highlights);
  }
}

export function updateRoomManager(dt: number, gameState: any) {
  if (gameState.phase !== 'playing') return;

  const room = ROOMS[currentRoomIndex];
  if (!room) return;

  // ─── Handle rest room door auto-open ───
  if (room.isRestRoom && restRoomTimer > 0) {
    restRoomTimer -= dt * 1000;
    if (restRoomTimer <= 0) {
      unlockDoor();
    }
  }

  // ─── Update door + check for room transition ───
  const playerPos = getPlayerPos();
  const input = getInputState();
  const doorTriggered = updateDoor(dt, playerPos, input.interact);
  if (doorTriggered) {
    loadRoom(currentRoomIndex + 1, gameState);
    return;
  }

  // ─── Update active telegraphs ───
  for (let i = activeTelegraphs.length - 1; i >= 0; i--) {
    const tg = activeTelegraphs[i];
    tg.timer -= dt * 1000;
    const progress = 1 - (tg.timer / tg.duration);

    // Update telegraph visuals
    for (const tel of tg.telegraphs) {
      updateTelegraph(tel, Math.min(progress, 1), dt);
    }

    // Telegraph expired — spawn enemies
    if (tg.timer <= 0) {
      for (const tel of tg.telegraphs) {
        removeTelegraph(tel);
      }
      // Spawn enemies at resolved positions
      for (let j = 0; j < tg.pack.enemies.length; j++) {
        const enemy = tg.pack.enemies[j];
        const pos = tg.positions[j];
        const spawnPos = new THREE.Vector3(pos.x, 0, pos.z);
        spawnEnemy(enemy.type, spawnPos, gameState, enemy.patrolWaypoints);
      }
      emit({ type: 'spawnPackSpawned', packIndex: tg.packIdx, roomIndex: currentRoomIndex });
      activeTelegraphs.splice(i, 1);
    }
  }

  // ─── Skip dispatch logic for special rooms ───
  if (room.isRestRoom || room.isVictoryRoom) return;

  // ─── Count alive enemies ───
  const aliveCount = gameState.enemies.length;
  const budget = room.spawnBudget;
  const effectiveMaxConcurrent = Math.round(budget.maxConcurrent * SPAWN_CONFIG.maxConcurrentMult);

  // ─── Announce final wave ───
  if (!finalWaveAnnounced && packIndex >= budget.packs.length && activeTelegraphs.length === 0 && aliveCount > 0) {
    finalWaveAnnounced = true;
    showAnnounce('FINAL WAVE');
    setTimeout(hideAnnounce, 1500);
  }

  // ─── Dispatch new packs ───
  spawnCooldownTimer -= dt * 1000;

  if (packIndex < budget.packs.length && spawnCooldownTimer <= 0) {
    const nextPack = budget.packs[packIndex];
    // Count enemies being telegraphed (not yet spawned)
    const telegraphingCount = activeTelegraphs.reduce(
      (sum, tg) => sum + tg.pack.enemies.length, 0
    );
    const totalActive = aliveCount + telegraphingCount;

    if (totalActive + nextPack.enemies.length <= effectiveMaxConcurrent + 1) {
      // Dispatch this pack: resolve positions, create telegraphs
      const positions = resolveSpawnPositions(nextPack, room);
      const telegraphs = positions.map((pos, idx) =>
        createTelegraph(pos.x, pos.z, nextPack.enemies[idx].type)
      );

      const duration = budget.telegraphDuration || SPAWN_CONFIG.telegraphDuration;
      activeTelegraphs.push({
        telegraphs,
        pack: nextPack,
        positions,
        timer: duration,
        duration,
        packIdx: packIndex,
      });

      emit({ type: 'spawnPackTelegraph', packIndex, roomIndex: currentRoomIndex });
      packIndex++;
      spawnCooldownTimer = SPAWN_CONFIG.spawnCooldown;
    }
  }

  // ─── Check room cleared ───
  if (!roomCleared && packIndex >= budget.packs.length && activeTelegraphs.length === 0 && aliveCount === 0) {
    roomCleared = true;
    emit({ type: 'roomCleared', roomIndex: currentRoomIndex });
    emit({ type: 'roomClearComplete', roomIndex: currentRoomIndex });

    if (currentRoomIndex + 1 >= ROOMS.length) {
      // Last combat room cleared — victory
      showAnnounce('VICTORY!');
    } else {
      showAnnounce('Room Cleared!');
      setTimeout(hideAnnounce, 1500);
      // Unlock the door — player walks through to proceed
      unlockDoor();
    }
  }
}

// ─── Spawn Position Resolution ───

function resolveSpawnPositions(pack: SpawnPack, room: RoomDefinition): { x: number; z: number }[] {
  const playerPos = getPlayerPos();
  const playerZ = playerPos ? playerPos.z : room.playerStart.z;
  const playerX = playerPos ? playerPos.x : room.playerStart.x;

  const hx = room.arenaHalfX - 1.5;  // margin from walls
  const hz = room.arenaHalfZ - 1.5;

  return pack.enemies.map((enemyDef) => {
    // Fixed position overrides zone-based spawning
    if (enemyDef.fixedPos) {
      return { x: enemyDef.fixedPos.x, z: enemyDef.fixedPos.z };
    }

    let x: number, z: number;

    for (let attempt = 0; attempt < 10; attempt++) {
      switch (pack.spawnZone) {
        case 'ahead': {
          // Ahead = toward -Z (the exit / top-right in iso)
          const aheadMin = SPAWN_CONFIG.spawnAheadMin;
          const aheadMax = SPAWN_CONFIG.spawnAheadMax;
          x = (Math.random() * 2 - 1) * hx;
          z = playerZ - aheadMin - Math.random() * (aheadMax - aheadMin);
          break;
        }
        case 'sides': {
          // Near the X walls, slightly ahead (-Z) of player
          const side = Math.random() < 0.5 ? -1 : 1;
          x = side * (hx * 0.6 + Math.random() * hx * 0.3);
          z = playerZ - 3 - Math.random() * 10;
          break;
        }
        case 'far': {
          // Near the far end of the room (-Z exit wall)
          x = (Math.random() * 2 - 1) * hx;
          z = -hz + 2 + Math.random() * 5;
          break;
        }
        case 'behind': {
          // Behind = toward +Z (entrance / bottom-left in iso)
          x = (Math.random() * 2 - 1) * hx;
          z = playerZ + 5 + Math.random() * 5;
          break;
        }
        default: {
          x = (Math.random() * 2 - 1) * hx;
          z = playerZ - 5 - Math.random() * 10;
        }
      }

      // Clamp to arena bounds
      x = Math.max(-hx, Math.min(hx, x));
      z = Math.max(-hz, Math.min(hz, z));

      // Validate: not inside obstacle or pit
      if (!isInsideObstacle(x, z) && !isInsidePit(x, z)) {
        return { x, z };
      }
    }

    // Fallback: spawn at room center-ish
    return { x: (Math.random() * 2 - 1) * 3, z: 0 };
  });
}

function isInsideObstacle(x: number, z: number): boolean {
  const bounds = getBounds();
  // Only check obstacle bounds, not walls (first N entries before the 4 wall entries)
  const obstacleCount = bounds.length - 4;
  for (let i = 0; i < obstacleCount; i++) {
    const b = bounds[i];
    if (x >= b.minX - 1 && x <= b.maxX + 1 && z >= b.minZ - 1 && z <= b.maxZ + 1) {
      return true;
    }
  }
  return false;
}

function isInsidePit(x: number, z: number): boolean {
  const pits = getPits();
  for (const p of pits) {
    if (x >= p.minX - 0.5 && x <= p.maxX + 0.5 && z >= p.minZ - 0.5 && z <= p.maxZ + 0.5) {
      return true;
    }
  }
  return false;
}

// ─── Public Getters ───

export function getCurrentRoom(): RoomDefinition | null {
  return ROOMS[currentRoomIndex] ?? null;
}

export function getCurrentRoomIndex(): number {
  return currentRoomIndex;
}

export function getCurrentRoomName(): string {
  const room = ROOMS[currentRoomIndex];
  return room ? room.name : '';
}

export function getRoomCount(): number {
  return ROOMS.length;
}

export function isRoomCleared(): boolean {
  return roomCleared;
}

export function resetRoomManager() {
  currentRoomIndex = 0;
  packIndex = 0;
  totalKills = 0;
  roomBudgetTotal = 0;
  roomCleared = false;
  spawnCooldownTimer = 0;
  finalWaveAnnounced = false;
  restRoomTimer = 0;
  activeTelegraphs = [];
  removeDoor();
}

// ─── Announce UI ───

function showAnnounce(text: string) {
  if (!announceEl) return;
  announceEl.textContent = text;
  announceEl.classList.add('visible');
}

function hideAnnounce() {
  if (!announceEl) return;
  announceEl.classList.remove('visible');
}
