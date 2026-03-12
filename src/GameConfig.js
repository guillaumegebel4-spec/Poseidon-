// ============================================================
// POSEIDON — PHASER 3 GAME CONFIGURATION
// Mobile-first, portrait oriented, high quality
// ============================================================
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { CombatScene } from './scenes/CombatScene.js';
import { UIScene } from './scenes/UIScene.js';
import {
  GAME_WIDTH, GAME_HEIGHT,
  TILE_W, TILE_H, TILE_DEPTH,
  ARENA_COLS, ARENA_ROWS,
} from './data/Constants.js';

// Re-export constants for backward compatibility
export { GAME_WIDTH, GAME_HEIGHT, TILE_W, TILE_H, TILE_DEPTH, ARENA_COLS, ARENA_ROWS };

export const GameConfig = {
  type: Phaser.CANVAS,   // Force Canvas — avoids WebGL init failures on mobile Safari
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#0D0A08',
  pixelArt: false,
  antialias: true,
  roundPixels: false,

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },

  scene: [
    BootScene,
    MainMenuScene,
    WorldScene,
    CombatScene,
    UIScene,
  ],
};
