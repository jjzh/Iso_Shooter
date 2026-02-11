import { initRenderer, updateCamera, getScene, getRendererInstance, getCamera } from './renderer.js';
import { initInput, updateInput, consumeInput, getInputState, autoAimClosestEnemy } from './input.js';
import { createPlayer, updatePlayer, getPlayerPos, resetPlayer } from '../entities/player.js';
import { initProjectilePool, updateProjectiles, releaseAllProjectiles } from '../entities/projectile.js';
import { initEnemySystem, updateEnemies, clearEnemies } from '../entities/enemy.js';
import { initMortarSystem, updateMortarProjectiles, clearMortarProjectiles } from '../entities/mortarProjectile.js';
import { initWaveRunner, updateWaveRunner, startWave, resetWaveRunner } from './waveRunner.js';
import { checkCollisions, checkPitFalls, updateEffectGhosts, clearEffectGhosts } from './physics.js';
import { initAoeTelegraph, updateAoeTelegraphs, updatePendingEffects, clearAoeTelegraphs } from './aoeTelegraph.js';
import { initHUD, updateHUD } from '../ui/hud.js?v=2';
import { initScreens, showGameOver, hideScreens } from '../ui/screens.js';
import { initDamageNumbers, updateDamageNumbers, clearDamageNumbers } from '../ui/damageNumbers.js';
import { initTuningPanel } from '../ui/tuning.js?v=4';
import { initSpawnEditor, checkEditorToggle, updateSpawnEditor, isEditorActive } from '../ui/spawnEditor.js?v=5';
import { PLAYER } from '../config/player.js';
import { applyUrlParams, snapshotDefaults } from './urlParams.js';

const gameState = {
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

function gameLoop(timestamp) {
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
    // Editor mode — render scene, update editor, skip gameplay
    updateInput();
    updateSpawnEditor(0);
    getRendererInstance().render(getScene(), getCamera());
    consumeInput();
    return;
  }

  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  dt = Math.min(dt, 0.05); // Cap at 50ms

  // Skip first frame (large dt from init)
  if (dt <= 0) return;

  // 1. Input
  updateInput();
  autoAimClosestEnemy(gameState.enemies);
  const input = getInputState();

  // 2. Player
  updatePlayer(input, dt, gameState);

  // 3. Projectiles
  updateProjectiles(dt);

  // 4. Wave Runner
  updateWaveRunner(dt, gameState);

  // 5. Enemies
  updateEnemies(dt, getPlayerPos(), gameState);

  // 6. Collisions
  checkCollisions(gameState);

  // 6b. Pit falls (after all position resolution — knockback can push into pits)
  checkPitFalls(gameState);

  // 6c. Effect ghosts (push afterimages + pit fall animations)
  updateEffectGhosts(dt);

  // 7. AoE telegraphs (expanding rings, pending cascade effects)
  updateAoeTelegraphs(dt);
  updatePendingEffects(dt);

  // 8. Mortar projectiles (in-flight arcs)
  updateMortarProjectiles(dt);

  // 9. Check for game over (set by physics)
  if (gameState.phase === 'gameOver') {
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

  // 15. Damage numbers (canvas 2D overlay, after 3D render)
  updateDamageNumbers(dt);
}

function restart() {
  // Reset state
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

  // Clean up
  clearEnemies(gameState);
  releaseAllProjectiles();
  resetPlayer();
  clearDamageNumbers();
  clearAoeTelegraphs();
  clearMortarProjectiles();
  clearEffectGhosts();
  resetWaveRunner();

  // Start waves
  startWave(0, gameState);
}

function init() {
  window.__configDefaults = snapshotDefaults();
  applyUrlParams();

  const { scene } = initRenderer();

  initInput();
  createPlayer(scene);
  initProjectilePool(scene);
  initEnemySystem(scene);
  initMortarSystem(scene);
  initAoeTelegraph(scene);
  initWaveRunner(scene);
  initHUD();
  initDamageNumbers();
  initTuningPanel();
  initSpawnEditor(scene, gameState);
  initScreens(restart, () => {
    // Called when Start button is pressed
    gameState.phase = 'playing';
    document.getElementById('hud').style.visibility = 'visible';
    startWave(0, gameState);
    lastTime = performance.now();
  });

  // Hide HUD until game starts
  document.getElementById('hud').style.visibility = 'hidden';

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

init();

// =============================================================================
// DEBUG: Expose game state for verification scripts (localhost only)
// TODO(production): Remove or disable this block before deploying to production
// Decision documented in CLAUDE_project.md
// =============================================================================
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.gameState = gameState;
  window.getPlayerPos = getPlayerPos;
}
