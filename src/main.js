// ============================================================
// POSEIDON — Entry Point
// Rise of the Steel Tribes
// ============================================================
import Phaser from 'phaser';
import { GameConfig } from './GameConfig.js';

// Global audio context (must be started on user interaction)
export let audioCtx = null;

export function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Start the game
const game = new Phaser.Game(GameConfig);

// Expose for debugging
window.PoseidonGame = game;

// Remove loading screen once Phaser boots
const hideLoadingScreen = () => {
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.classList.add('hidden');
    setTimeout(() => screen.remove(), 1000);
  }
};

game.events.once('ready', () => {
  setTimeout(hideLoadingScreen, 500);
});

// Fallback: force hide after 5s regardless
setTimeout(hideLoadingScreen, 5000);

// Loading bar simulation
const bar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const messages = [
  'Forging the world...',
  'Awakening the automatons...',
  'Reading binary scrolls...',
  'Charging the crystals...',
  'Opening the portals...',
];
let loadProgress = 0;
let msgIndex = 0;

const loadInterval = setInterval(() => {
  loadProgress = Math.min(loadProgress + Math.random() * 15, 95);
  if (bar) bar.style.width = loadProgress + '%';
  if (loadingText && loadProgress > msgIndex * 20 && msgIndex < messages.length) {
    loadingText.textContent = messages[msgIndex];
    msgIndex++;
  }
  if (loadProgress >= 95) clearInterval(loadInterval);
}, 200);

export { game };
