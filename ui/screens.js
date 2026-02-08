let startScreen, startBtn;
let gameOverScreen, restartBtn, gameOverStats;

export function initScreens(onRestart, onStart) {
  // Start screen
  startScreen = document.getElementById('start-screen');
  startBtn = document.getElementById('start-btn');

  const handleStart = () => {
    hideStartScreen();
    onStart();
  };
  startBtn.addEventListener('click', handleStart);
  startBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleStart();
  });

  // Game over screen
  gameOverScreen = document.getElementById('game-over-screen');
  restartBtn = document.getElementById('restart-btn');
  gameOverStats = document.getElementById('game-over-stats');

  restartBtn.addEventListener('click', () => {
    hideScreens();
    onRestart();
  });
}

export function hideStartScreen() {
  startScreen.classList.add('hidden');
}

export function showGameOver(gameState) {
  gameOverStats.textContent = `Enemies defeated: ${gameState.currency} gold earned`;
  gameOverScreen.classList.remove('hidden');
}

export function hideScreens() {
  gameOverScreen.classList.add('hidden');
}
