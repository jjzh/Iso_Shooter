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
import { initBulletTime, toggleBulletTime, updateBulletTime, getBulletTimeScale, resetBulletTime } from './bulletTime';
import { initAerialVerbs, updateAerialVerbs, resetAerialVerbs } from './aerialVerbs';
import { clearAllTags } from './tags';
import { dunkVerb } from '../verbs/dunk';
import { floatSelectorVerb } from '../verbs/floatSelector';
import { spikeVerb } from '../verbs/spike';
import { updateCarriers, clearCarriers } from './entityCarrier';
import { initGroundShadows, updateGroundShadows } from './groundShadows';
import { PLAYER, MELEE, DUNK } from '../config/player';
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

  // 1b. Bullet Time toggle + update
  if (input.bulletTime) toggleBulletTime();
  updateBulletTime(dt);
  const gameDt = dt * getBulletTimeScale(); // slowed dt for world systems

  // 2. Player (uses real dt — player moves at normal speed)
  updatePlayer(input, dt, gameState);

  // 2b. Aerial verbs (dunk, spike, etc.) — uses real dt like player
  // Attach gameState to input so verb onComplete can access enemies for AoE
  (input as any)._gameState = gameState;
  updateAerialVerbs(dt, getPlayerPos(), input);

  // 2c. Entity carriers (spiked enemies as projectiles) — real dt like player
  updateCarriers(dt, gameState);

  // 3. Projectiles (slowed)
  updateProjectiles(gameDt);

  // 4. Room Manager (slowed)
  updateRoomManager(gameDt, gameState);

  // 5. Enemies (slowed)
  updateEnemies(gameDt, getPlayerPos(), gameState);

  // 6. Collisions
  checkCollisions(gameState);

  // 6a. Physics velocities — knockback sliding, wall slam detection (slowed)
  applyVelocities(gameDt, gameState);

  // 6a2. Enemy-enemy collision (separation + momentum transfer)
  resolveEnemyCollisions(gameState);

  // 6b. Pit falls
  checkPitFalls(gameState);

  // 6c. Effect ghosts (slowed)
  updateEffectGhosts(gameDt);

  // 6d. Particles (slowed)
  updateParticles(gameDt);

  // 7. AoE telegraphs (slowed)
  updateAoeTelegraphs(gameDt);
  updatePendingEffects(gameDt);

  // 8. Mortar projectiles (slowed)
  updateMortarProjectiles(gameDt);

  // 8b. Ice patches (slowed)
  updateIcePatches(gameDt);

  // 9. Check for game over (phase may have changed during collision checks)
  if ((gameState.phase as string) === 'gameOver') {
    showGameOver(gameState);
  }

  // 10. Camera (real dt — smooth camera)
  updateCamera(getPlayerPos(), dt);

  // 10b. Ground shadows (track entity positions)
  updateGroundShadows(gameState);

  // 11. HUD
  updateHUD(gameState);

  // 12. Check editor toggle
  checkEditorToggle();

  // 13. Consume edge-triggered inputs
  consumeInput();

  // 14. Render
  getRendererInstance().render(getScene(), getCamera());

  // 15. Damage numbers (slowed)
  updateDamageNumbers(gameDt);
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
  resetAerialVerbs();
  clearCarriers();
  clearAllTags();
  resetRoomManager();
  resetBulletTime();
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
    initBulletTime();
    initAerialVerbs([floatSelectorVerb, dunkVerb, spikeVerb]);
    initGroundShadows();

    // Hit pause — subscribe to impact events
    on('meleeHit', () => {
      hitPauseTimer = MELEE.hitPause;
    });
    on('dunkGrab', () => {
      hitPauseTimer = DUNK.grabPause;
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
