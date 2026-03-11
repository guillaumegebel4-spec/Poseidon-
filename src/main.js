// ============================================================
// POSEIDON — Entry Point
// Rise of the Steel Tribes
// ============================================================
import Phaser from 'phaser';
import { GameConfig } from './GameConfig.js';

// Hide loading screen — also calls the inline fallback if available
const hideLoadingScreen = () => {
  // Cancel the HTML inline fallback timer (it already ran window._hideLoader)
  if (window._hideLoader) {
    try { window._hideLoader(); } catch (_) {}
    window._hideLoader = null;
  }
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.classList.add('hidden');
    setTimeout(() => { if (screen.parentNode) screen.parentNode.removeChild(screen); }, 1000);
  }
};

// Start the game
let game;
try {
  game = new Phaser.Game(GameConfig);
  window.PoseidonGame = game;
  game.events.once('ready', () => setTimeout(hideLoadingScreen, 300));
} catch (err) {
  console.error('Phaser init error:', err);
  hideLoadingScreen();
}

export { game as default };
