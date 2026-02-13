// Room Manager — loads rooms, detects clears, handles transitions
// Replaces the wave runner for the Hades prototype branch
// Each room can have multiple waves — next wave spawns when current is cleared

import { ROOMS, RoomDefinition } from '../config/rooms';
import { setArenaConfig } from '../config/arena';
import { spawnEnemy, clearEnemies } from '../entities/enemy';
import { setPlayerPosition } from '../entities/player';
import { releaseAllProjectiles } from '../entities/projectile';
import { clearMortarProjectiles, clearIcePatches } from '../entities/mortarProjectile';
import { clearAoeTelegraphs } from './aoeTelegraph';
import { clearDamageNumbers } from '../ui/damageNumbers';
import { clearEffectGhosts } from './physics';
import { clearParticles } from './particles';
import { invalidateCollisionBounds } from './physics';
import { rebuildArenaVisuals } from './renderer';
import { emit } from './events';

// ─── State ───

let currentRoomIndex = 0;
let currentWaveIndex = 0;   // which wave within the room
let transitioning = false;
let transitionTimer = 0;
const TRANSITION_PAUSE = 1500; // ms pause between rooms
const WAVE_PAUSE = 800;        // ms pause between waves within a room

let announceEl: HTMLElement | null = null;

// ─── Public API ───

export function initRoomManager() {
  announceEl = document.getElementById('wave-announce');
}

export function loadRoom(index: number, gameState: any) {
  if (index >= ROOMS.length) {
    // All rooms cleared — victory
    showAnnounce('VICTORY!');
    return;
  }

  const room = ROOMS[index];
  currentRoomIndex = index;
  currentWaveIndex = 0;
  transitioning = false;
  transitionTimer = 0;

  // Clear everything from previous room
  clearEnemies(gameState);
  releaseAllProjectiles();
  clearMortarProjectiles();
  clearIcePatches();
  clearAoeTelegraphs();
  clearDamageNumbers();
  clearEffectGhosts();
  clearParticles();

  // Swap arena layout
  setArenaConfig(room.obstacles, room.pits, room.arenaHalf);
  invalidateCollisionBounds();
  rebuildArenaVisuals();

  // Set player position
  setPlayerPosition(room.playerStart.x, room.playerStart.z);

  // Spawn first wave
  spawnWave(room.waves[0], gameState);

  // Update game state
  gameState.currentWave = index + 1;

  // Show room announce
  showAnnounce(room.name);
  setTimeout(hideAnnounce, 2000);
}

function spawnWave(spawns: { type: string; x: number; z: number }[], gameState: any) {
  for (const spawn of spawns) {
    const pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    spawnEnemy(spawn.type, pos, gameState);
  }
}

export function updateRoomManager(dt: number, gameState: any) {
  if (transitioning) {
    transitionTimer -= dt * 1000;
    if (transitionTimer <= 0) {
      transitioning = false;
      loadRoom(currentRoomIndex + 1, gameState);
    }
    return;
  }

  // Check if current wave is cleared (all enemies dead)
  if (gameState.phase === 'playing' && gameState.enemies.length === 0) {
    const room = ROOMS[currentRoomIndex];
    const hasMoreWaves = currentWaveIndex + 1 < room.waves.length;

    if (hasMoreWaves) {
      // Spawn next wave within this room
      currentWaveIndex++;
      const waveNum = currentWaveIndex + 1;
      const totalWaves = room.waves.length;
      showAnnounce(`Wave ${waveNum}/${totalWaves}`);
      setTimeout(hideAnnounce, 1200);

      // Brief pause then spawn — use setTimeout so enemies don't pop in instantly
      // We spawn immediately but could add a delay here if desired
      spawnWave(room.waves[currentWaveIndex], gameState);
    } else {
      // All waves in this room cleared — transition to next room
      transitioning = true;
      transitionTimer = TRANSITION_PAUSE;

      emit({ type: 'roomCleared', roomIndex: currentRoomIndex });

      if (currentRoomIndex + 1 >= ROOMS.length) {
        // Last room cleared — victory after pause
        showAnnounce('VICTORY!');
      } else {
        showAnnounce('Room Cleared!');
        setTimeout(hideAnnounce, 1200);
      }
    }
  }
}

export function getCurrentRoomIndex(): number {
  return currentRoomIndex;
}

export function getRoomCount(): number {
  return ROOMS.length;
}

export function resetRoomManager() {
  currentRoomIndex = 0;
  currentWaveIndex = 0;
  transitioning = false;
  transitionTimer = 0;
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
