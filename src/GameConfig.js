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

// Base game dimensions (portrait mobile)
export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

// Isometric tile dimensions
export const TILE_W = 64;
export const TILE_H = 32;
export const TILE_DEPTH = 24;

// Combat arena
export const ARENA_COLS = 9;
export const ARENA_ROWS = 9;

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
