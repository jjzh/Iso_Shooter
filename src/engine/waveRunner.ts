// Wave runner — state machine that drives wave progression
// idle → announce → running → cleared → next wave / victory

import { WAVES } from '../config/waves';
import { spawnEnemy } from '../entities/enemy';
import { initTelegraph, createTelegraph, updateTelegraph, removeTelegraph } from './telegraph';
import { emit } from './events';

let sceneRef: any;

const waveState = {
  status: 'idle' as string,          // 'idle' | 'announce' | 'running' | 'cleared' | 'victory'
  waveIndex: 0,
  elapsedMs: 0,            // ms since wave entered 'running'
  announceTimer: 0,
  clearPauseTimer: 0,
  groups: [] as any[],              // runtime state per group
};

// Announce UI element
let announceEl: HTMLElement | null;

export function initWaveRunner(scene: any) {
  sceneRef = scene;
  initTelegraph(scene);

  // Get or create announce element
  announceEl = document.getElementById('wave-announce');
}

export function startWave(index: number, gameState: any) {
  if (index >= WAVES.length) {
    waveState.status = 'victory';
    showAnnounce('VICTORY');
    return;
  }

  waveState.waveIndex = index;
  waveState.status = 'announce';
  waveState.announceTimer = 2000;
  waveState.elapsedMs = 0;
  waveState.groups = [];

  gameState.currentWave = WAVES[index].wave;

  // Show wave announcement
  showAnnounce(WAVES[index].message);
}

export function updateWaveRunner(dt: number, gameState: any) {
  const dtMs = dt * 1000;

  switch (waveState.status) {
    case 'idle':
    case 'victory':
      return;

    case 'announce':
      waveState.announceTimer -= dtMs;
      if (waveState.announceTimer <= 0) {
        hideAnnounce();
        waveState.status = 'running';
        emit({ type: 'waveBegan', waveIndex: waveState.waveIndex });
        initGroupRuntimes();
      }
      break;

    case 'running':
      waveState.elapsedMs += dtMs;
      let allGroupsDone = true;

      for (const g of waveState.groups) {
        updateGroup(g, dt, dtMs, gameState);
        if (g.phase !== 'done') allGroupsDone = false;
      }

      // Wave cleared: all groups spawned AND no enemies alive
      if (allGroupsDone && gameState.enemies.length === 0) {
        waveState.status = 'cleared';
        waveState.clearPauseTimer = 2000;
        emit({ type: 'waveCleared', waveIndex: waveState.waveIndex });
        showAnnounce('Wave cleared!');
      }
      break;

    case 'cleared':
      waveState.clearPauseTimer -= dtMs;
      if (waveState.clearPauseTimer <= 0) {
        hideAnnounce();
        startWave(waveState.waveIndex + 1, gameState);
      }
      break;
  }
}

function initGroupRuntimes() {
  const waveCfg = WAVES[waveState.waveIndex];
  waveState.groups = waveCfg.groups.map((groupCfg: any) => ({
    config: groupCfg,
    phase: 'waiting',    // 'waiting' | 'telegraphing' | 'spawning' | 'done'
    timer: 0,
    spawnIndex: 0,
    staggerTimer: 0,
    telegraphs: [] as any[],
  }));
}

function updateGroup(g: any, dt: number, dtMs: number, gameState: any) {
  switch (g.phase) {
    case 'waiting':
      if (waveState.elapsedMs >= g.config.triggerDelay) {
        g.phase = 'telegraphing';
        g.timer = g.config.telegraphDuration;

        // Create telegraph markers for each spawn in this group
        for (const s of g.config.spawns) {
          const t = createTelegraph(s.x, s.z, s.type);
          g.telegraphs.push(t);
        }
      }
      break;

    case 'telegraphing':
      g.timer -= dtMs;
      const progress = 1.0 - Math.max(0, g.timer / g.config.telegraphDuration);

      // Update all telegraph animations
      for (const t of g.telegraphs) {
        updateTelegraph(t, progress, dt);
      }

      if (g.timer <= 0) {
        // Remove telegraphs
        for (const t of g.telegraphs) {
          removeTelegraph(t);
        }
        g.telegraphs = [];

        // Transition to spawning
        g.phase = 'spawning';
        g.spawnIndex = 0;
        g.staggerTimer = 0;
      }
      break;

    case 'spawning':
      g.staggerTimer -= dtMs;
      while (g.staggerTimer <= 0 && g.spawnIndex < g.config.spawns.length) {
        const s = g.config.spawns[g.spawnIndex];
        spawnEnemy(s.type, new THREE.Vector3(s.x, 0, s.z), gameState);
        g.spawnIndex++;
        if (g.spawnIndex < g.config.spawns.length) {
          g.staggerTimer += g.config.stagger;
        }
      }
      if (g.spawnIndex >= g.config.spawns.length) {
        g.phase = 'done';
      }
      break;
  }
}

export function resetWaveRunner() {
  // Clean up any active telegraphs
  for (const g of waveState.groups) {
    for (const t of g.telegraphs) {
      removeTelegraph(t);
    }
  }
  waveState.status = 'idle';
  waveState.waveIndex = 0;
  waveState.elapsedMs = 0;
  waveState.groups = [];
  hideAnnounce();
}

export function getWaveState() {
  return waveState;
}

export function isWaveRunnerActive() {
  return waveState.status === 'running' || waveState.status === 'announce';
}

// Announce text overlay
function showAnnounce(text: string) {
  if (!announceEl) return;
  announceEl.textContent = text;
  announceEl.classList.add('visible');
}

function hideAnnounce() {
  if (!announceEl) return;
  announceEl.classList.remove('visible');
}
