import { initRoomSelector } from './roomSelector';

let startScreen: any, startBtn: any;
let gameOverScreen: any, restartBtn: any, gameOverStats: any;

export function initScreens(
  onRestart: () => void,
  onStart: () => void,
  onStartAtRoom?: (roomIndex: number) => void
) {
  // Start screen
  startScreen = document.getElementById('start-screen');
  startBtn = document.getElementById('start-btn');

  const handleStart = () => {
    hideStartScreen();
    onStart();
  };
  startBtn.addEventListener('click', handleStart);
  startBtn.addEventListener('touchend', (e: any) => {
    e.preventDefault();
    handleStart();
  });

  // Room selector
  if (onStartAtRoom) {
    initRoomSelector((roomIndex) => {
      hideStartScreen();
      onStartAtRoom(roomIndex);
    });
  }

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

export function showGameOver(gameState: any) {
  gameOverStats.textContent = `Enemies defeated: ${gameState.currency} gold earned`;
  gameOverScreen.classList.remove('hidden');
}

export function hideScreens() {
  gameOverScreen.classList.add('hidden');
}
