let gameOverScreen, restartBtn, gameOverStats;

export function initScreens(onRestart) {
  gameOverScreen = document.getElementById('game-over-screen');
  restartBtn = document.getElementById('restart-btn');
  gameOverStats = document.getElementById('game-over-stats');

  restartBtn.addEventListener('click', () => {
    hideScreens();
    onRestart();
  });
}

export function showGameOver(gameState) {
  gameOverStats.textContent = `Enemies defeated: ${gameState.currency} gold earned`;
  gameOverScreen.classList.remove('hidden');
}

export function hideScreens() {
  gameOverScreen.classList.add('hidden');
}
