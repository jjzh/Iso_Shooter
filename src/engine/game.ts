import { initRenderer, updateCamera, getScene, getRendererInstance, getCamera } from './renderer';
import { initInput, updateInput, consumeInput, getInputState, autoAimClosestEnemy } from './input';
import { createPlayer, updatePlayer, getPlayerPos, resetPlayer } from '../entities/player';
import { initProjectilePool, updateProjectiles } from '../entities/projectile';
import { initEnemySystem, updateEnemies } from '../entities/enemy';
import { initMortarSystem, updateMortarProjectiles, updateIcePatches } from '../entities/mortarProjectile';
import { initRoomManager, loadRoom, updateRoomManager, resetRoomManager } from './roomManager';
import { checkCollisions, checkPitFalls, updateEffectGhosts, applyVelocities, resolveEnemyCollisions } from './physics';
import { initAoeTelegraph, updateAoeTelegraphs, updatePendingEffects } from './aoeTelegraph';
import { initHUD, updateHUD } from '../ui/hud';
import { initScreens, showGameOver, hideScreens } from '../ui/screens';
import { initDamageNumbers, updateDamageNumbers } from '../ui/damageNumbers';
import { initTuningPanel } from '../ui/tuning';
import { initSpawnEditor, checkEditorToggle, updateSpawnEditor, isEditorActive } from '../ui/spawnEditor';
import { initAudio, resumeAudio } from './audio';
import { initParticles, updateParticles } from './particles';
import { PLAYER, MELEE } from '../config/player';
import { on } from './events';
import { applyUrlParams, snapshotDefaults } from './urlParams';
import { GameState } from '../types/index';

const gameState: GameState = {
  phase: 'waiting',
  playerHealth: PLAYER.maxHealth,
  playerMaxHealth: PLAYER.maxHealth,
  currency: 0,
  currentWave: 1,
  enemies: [],
  abilities: {
    dash:     { cooldownRemaining: 0 },
    ultimate: { cooldownRemaining: 0, active: false, activeRemaining: 0, charging: false, chargeT: 0 }
  }
};

let lastTime = 0;
let hitPauseTimer = 0; // ms remaining — freeze frame on melee hit

function gameLoop(timestamp: number): void {
  requestAnimationFrame(gameLoop);

  if (gameState.phase === 'waiting') {
    getRendererInstance().render(getScene(), getCamera());
    return;
  }

  if (gameState.phase === 'gameOver') {
    getRendererInstance().render(getScene(), getCamera());
    return;
  }

  if (gameState.phase === 'editorPaused') {
    updateInput();
    updateSpawnEditor(0);
    getRendererInstance().render(getScene(), getCamera());
    consumeInput();
    return;
  }

  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  dt = Math.min(dt, 0.05);

  if (dt <= 0) return;

  // Hit pause (freeze frame on melee hit)
  if (hitPauseTimer > 0) {
    hitPauseTimer -= dt * 1000;
    getRendererInstance().render(getScene(), getCamera());
    return;
  }

  // 1. Input
  updateInput();
  autoAimClosestEnemy(gameState.enemies);
  const input = getInputState();

  // 2. Player
  updatePlayer(input, dt, gameState);

  // 3. Projectiles
  updateProjectiles(dt);

  // 4. Room Manager (replaces wave runner)
  updateRoomManager(dt, gameState);

  // 5. Enemies
  updateEnemies(dt, getPlayerPos(), gameState);

  // 6. Collisions
  checkCollisions(gameState);

  // 6a. Physics velocities (knockback sliding, wall slam detection)
  applyVelocities(dt, gameState);

  // 6a2. Enemy-enemy collision (separation + momentum transfer)
  resolveEnemyCollisions(gameState);

  // 6b. Pit falls
  checkPitFalls(gameState);

  // 6c. Effect ghosts
  updateEffectGhosts(dt);

  // 6d. Particles
  updateParticles(dt);

  // 7. AoE telegraphs
  updateAoeTelegraphs(dt);
  updatePendingEffects(dt);

  // 8. Mortar projectiles
  updateMortarProjectiles(dt);

  // 8b. Ice patches
  updateIcePatches(dt);

  // 9. Check for game over (phase may have changed during collision checks)
  if ((gameState.phase as string) === 'gameOver') {
    showGameOver(gameState);
  }

  // 10. Camera
  updateCamera(getPlayerPos(), dt);

  // 11. HUD
  updateHUD(gameState);

  // 12. Check editor toggle
  checkEditorToggle();

  // 13. Consume edge-triggered inputs
  consumeInput();

  // 14. Render
  getRendererInstance().render(getScene(), getCamera());

  // 15. Damage numbers
  updateDamageNumbers(dt);
}

function restart(): void {
  gameState.phase = 'playing';
  gameState.playerHealth = PLAYER.maxHealth;
  gameState.playerMaxHealth = PLAYER.maxHealth;
  gameState.currency = 0;
  gameState.currentWave = 1;
  gameState.abilities.dash.cooldownRemaining = 0;
  gameState.abilities.ultimate.cooldownRemaining = 0;
  gameState.abilities.ultimate.active = false;
  gameState.abilities.ultimate.activeRemaining = 0;
  gameState.abilities.ultimate.charging = false;
  gameState.abilities.ultimate.chargeT = 0;

  resetPlayer();
  resetRoomManager();
  loadRoom(0, gameState);
}

function init(): void {
  try {
    (window as any).__configDefaults = snapshotDefaults();
    applyUrlParams();

    const { scene } = initRenderer();

    initInput();
    createPlayer(scene);
    initProjectilePool(scene);
    initEnemySystem(scene);
    initMortarSystem(scene);
    initAoeTelegraph(scene);
    initRoomManager(scene);
    initAudio();
    initParticles(scene);

    // Melee hit pause — subscribe to meleeHit event
    on('meleeHit', () => {
      hitPauseTimer = MELEE.hitPause;
    });
    initHUD();
    initDamageNumbers();
    initTuningPanel();
    initSpawnEditor(scene, gameState);
    initScreens(restart, () => {
      resumeAudio(); // AudioContext requires user gesture to start
      gameState.phase = 'playing';
      document.getElementById('hud')!.style.visibility = 'visible';
      loadRoom(0, gameState);
      lastTime = performance.now();
    });

    document.getElementById('hud')!.style.visibility = 'hidden';

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  } catch (err) {
    console.error('[init] Fatal error during initialization:', err);
  }
}

init();

// DEBUG: Expose game state for verification scripts (localhost only)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  (window as any).gameState = gameState;
  (window as any).getPlayerPos = getPlayerPos;
}
