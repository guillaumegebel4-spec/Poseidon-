// ============================================================
// POSEIDON — BOOT SCENE
// Rise of the Steel Tribes
// Initializes textures, state, audio, then launches MainMenu
// ============================================================
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../GameConfig.js';
import { PALETTE, INT } from '../data/Palette.js';
import { TextureFactory } from '../graphics/TextureFactory.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
    this._audioUnlocked = false;
  }

  // Nothing to load from disk — all textures are procedural
  preload() {}

  create() {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;

    // ── Solid background ──────────────────────────────────────
    this.cameras.main.setBackgroundColor(PALETTE.bgDark);

    // ── Loading visual container ──────────────────────────────
    this._buildLoadingVisual(W, H);

    // ── Animate progress then generate everything ─────────────
    this._runBootSequence();
  }

  // ─────────────────────────────────────────────────────────────
  // Loading Visual
  // ─────────────────────────────────────────────────────────────
  _buildLoadingVisual(W, H) {
    const cx = W / 2;

    // Subtle grid pattern in background for visual depth
    this._drawGrid(W, H);

    // Logo / title word-mark
    this._logoText = this.add.text(cx, H * 0.32, 'POSEIDON', {
      fontFamily: 'Georgia, serif',
      fontSize: '52px',
      fontStyle: 'bold',
      color: PALETTE.red,
      stroke: PALETTE.ink,
      strokeThickness: 3,
      shadow: { offsetX: 3, offsetY: 3, color: PALETTE.redDark, blur: 0, fill: true },
    }).setOrigin(0.5).setAlpha(0).setScale(0.6);

    this._subtitleText = this.add.text(cx, H * 0.32 + 64, 'Rise of the Steel Tribes', {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      color: PALETTE.gold,
      stroke: PALETTE.ink,
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    // Ornamental separator line under subtitle
    this._drawSeparator(cx, H * 0.32 + 86, 120);

    // Progress bar frame
    const barW = W * 0.6;
    const barH = 6;
    const barX = cx - barW / 2;
    const barY = H * 0.62;

    this._barBg = this.add.graphics();
    this._barBg.lineStyle(1, INT.inkLight, 0.8);
    this._barBg.strokeRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 3);
    this._barBg.fillStyle(INT.inkMid, 0.6);
    this._barBg.fillRoundedRect(barX - 1, barY - 1, barW + 2, barH + 2, 3);

    this._barFill = this.add.graphics();
    this._barWidth = barW;
    this._barX = barX;
    this._barY = barY;
    this._barH = barH;
    this._drawBar(0);

    // Status message
    this._statusText = this.add.text(cx, barY + 22, 'Forging the world…', {
      fontFamily: 'Georgia, serif',
      fontSize: '13px',
      color: PALETTE.cream,
    }).setOrigin(0.5).setAlpha(0.7);

    // Small corner rune decorations (cosmetic)
    this._drawCornerRunes(W, H);

    // Gear decoration near the title
    this._drawGearDecoration(cx, H * 0.32 - 70);

    // Fade logo in
    this.tweens.add({
      targets: [this._logoText, this._subtitleText],
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 700,
      ease: 'Back.easeOut',
    });
  }

  _drawGrid(W, H) {
    const g = this.add.graphics();
    g.lineStyle(1, INT.inkLight, 0.06);
    const step = 32;
    for (let x = 0; x <= W; x += step) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += step) g.lineBetween(0, y, W, y);
  }

  _drawSeparator(cx, y, halfW) {
    const g = this.add.graphics();
    g.lineStyle(1, INT.gold, 0.4);
    g.lineBetween(cx - halfW, y, cx + halfW, y);
    // Diamond end caps
    g.fillStyle(INT.gold, 0.6);
    const d = 3;
    [[cx - halfW, y], [cx + halfW, y]].forEach(([px, py]) => {
      g.fillTriangle(px - d, py, px, py - d, px, py + d);
      g.fillTriangle(px + d, py, px, py - d, px, py + d);
    });
  }

  _drawBar(progress) {
    const filled = Math.floor(this._barWidth * progress);
    this._barFill.clear();
    if (filled <= 0) return;
    // Gold fill
    this._barFill.fillStyle(INT.gold, 1);
    this._barFill.fillRoundedRect(this._barX, this._barY, filled, this._barH, 3);
    // Bright highlight on top third
    this._barFill.fillStyle(INT.goldLight, 0.5);
    this._barFill.fillRoundedRect(this._barX, this._barY, filled, Math.ceil(this._barH * 0.4), 2);
    // Leading edge glow
    if (filled > 4) {
      this._barFill.fillStyle(INT.goldLight, 0.9);
      this._barFill.fillRoundedRect(this._barX + filled - 3, this._barY, 3, this._barH, 1);
    }
  }

  _drawCornerRunes(W, H) {
    const g = this.add.graphics();
    g.lineStyle(1, INT.brown, 0.45);

    const corners = [
      [16, 16, 1, 1],
      [W - 16, 16, -1, 1],
      [16, H - 16, 1, -1],
      [W - 16, H - 16, -1, -1],
    ];
    corners.forEach(([x, y, sx, sy]) => {
      // Outer corner bracket
      g.strokeRect(x, y, sx * 20, sy * 20);
      // Inner accent dot
      g.fillStyle(INT.red, 0.55);
      g.fillRect(x + sx * 2, y + sy * 2, sx * 5, sy * 5);
      // Extra cross hair lines
      g.lineStyle(1, INT.gold, 0.25);
      g.lineBetween(x + sx * 4, y, x + sx * 4, y + sy * 20);
      g.lineBetween(x, y + sy * 4, x + sx * 20, y + sy * 4);
    });
  }

  _drawGearDecoration(cx, y) {
    const g = this.add.graphics();
    const r = 22;
    const teeth = 8;

    g.lineStyle(1, INT.gold, 0.3);
    g.fillStyle(INT.inkMid, 0.5);

    // Draw a rough gear shape
    const pts = [];
    for (let i = 0; i < teeth * 2; i++) {
      const angle = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r - 6;
      pts.push({ x: cx + Math.cos(angle) * rad, y: y + Math.sin(angle) * rad });
    }

    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => g.lineTo(p.x, p.y));
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Center hole
    g.fillStyle(INT.bgDark || 0x0D0A08, 1);
    g.fillCircle(cx, y, 8);
    g.lineStyle(1, INT.gold, 0.4);
    g.strokeCircle(cx, y, 8);
  }

  // ─────────────────────────────────────────────────────────────
  // Boot Sequence
  // ─────────────────────────────────────────────────────────────
  _runBootSequence() {
    const messages = [
      'Forging the world…',
      'Awakening the automatons…',
      'Reading binary scrolls…',
      'Charging the crystals…',
      'Opening the portals…',
      'Calibrating the Steel Tribes…',
    ];

    let step = 0;
    const totalSteps = messages.length;

    const advance = () => {
      if (step >= totalSteps) {
        this._drawBar(1);
        this._statusText.setText('Ready.');
        this.time.delayedCall(320, () => this._finalize());
        return;
      }

      const progress = (step + 1) / (totalSteps + 1);
      this._statusText.setText(messages[step]);
      this._drawBar(progress);

      // Run the actual heavy work on step 1 (texture generation)
      if (step === 1) {
        try {
          TextureFactory.generate(this);
        } catch (e) {
          console.warn('[BootScene] TextureFactory error:', e);
        }
      }

      step++;
      // Stagger each step for visual feedback
      this.time.delayedCall(step === 2 ? 400 : 180, advance);
    };

    // Start after logo fades in
    this.time.delayedCall(600, advance);
  }

  // ─────────────────────────────────────────────────────────────
  // Finalize — set up global state, then transition
  // ─────────────────────────────────────────────────────────────
  _finalize() {
    // ── Global Player Data ────────────────────────────────────
    if (!this.registry.has('playerData')) {
      this.registry.set('playerData', {
        characterId: null,
        characterData: null,
        currentBiome: 'forest',
        level: 1,
        xp: 0,
        xpToNext: 100,
        gold: 50,
        inventory: [],
        completedBiomes: [],
        deaths: 0,
      });
    }

    // ── Global Game State ─────────────────────────────────────
    if (!this.registry.has('gameState')) {
      this.registry.set('gameState', {
        started: false,
        paused: false,
        musicVolume: 0.6,
        sfxVolume: 0.8,
        audioUnlocked: false,
        currentScene: 'MainMenuScene',
        sessionStartTime: Date.now(),
        highScore: 0,
        settings: {
          vibration: true,
          showDamageNumbers: true,
          autoAttack: false,
        },
      });
    }

    // ── Audio context — unlock on first touch ─────────────────
    this._setupAudioUnlock();

    // ── Transition to MainMenu ────────────────────────────────
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Audio Context Unlock
  // ─────────────────────────────────────────────────────────────
  _setupAudioUnlock() {
    if (this._audioUnlocked) return;

    const unlock = () => {
      if (this._audioUnlocked) return;
      this._audioUnlocked = true;

      // Resume Phaser's WebAudio context if it exists
      if (this.sound && this.sound.context && this.sound.context.state === 'suspended') {
        this.sound.context.resume().then(() => {
          const gs = this.registry.get('gameState');
          if (gs) {
            gs.audioUnlocked = true;
            this.registry.set('gameState', gs);
          }
          this.registry.set('audioUnlocked', true);
        });
      } else {
        this.registry.set('audioUnlocked', true);
      }

      // Attempt to create a standalone AudioContext for procedural audio
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx && !window._poseidonAudioCtx) {
          window._poseidonAudioCtx = new AudioCtx();
          window._poseidonAudioCtx.resume();
        }
      } catch (_) {}

      document.removeEventListener('touchstart', unlock, { capture: true });
      document.removeEventListener('mousedown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    };

    document.addEventListener('touchstart', unlock, { capture: true, once: true });
    document.addEventListener('mousedown', unlock, { capture: true, once: true });
    document.addEventListener('keydown', unlock, { capture: true, once: true });
  }
}
