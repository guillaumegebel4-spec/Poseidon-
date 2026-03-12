// ============================================================
// POSEIDON — DIALOG SYSTEM
// Rich NPC dialog with portraits, choices, and typewriter FX.
// ============================================================

import Phaser from 'phaser';
import { INT, PALETTE } from '../data/Palette.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/Constants.js';
import { audioEngine } from '../audio/AudioEngine.js';

// ─────────────────────────────────────────────────────────────────
export class DialogSystem {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene     = scene;
    this._queue    = [];
    this._open     = false;
    this._skip     = false;
    this._resolve  = null;

    this._typeSpeed    = 28;    // ms per character
    this._typeTimer    = null;
    this._currentLine  = '';
    this._lineProgress = 0;

    this._container = null;
    this._built     = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  /**
   * Show a dialog and return a Promise that resolves when it closes.
   * @param {object} config
   * @param {string}   config.speaker      NPC name
   * @param {string[]} config.lines        Lines of dialogue
   * @param {string}   [config.portrait]   Texture key for portrait image
   * @param {string}   [config.mood]       'neutral'|'happy'|'angry'|'sad'
   * @param {Array}    [config.choices]    [{label, value}] — shown after last line
   * @returns {Promise<string|null>}  Resolves with chosen value or null
   */
  show(config) {
    return new Promise(resolve => {
      this._queue.push({ ...config, resolve });
      if (!this._open) this._processNext();
    });
  }

  /**
   * Queue multiple dialogs in sequence.
   * @param {Array<object>} configs
   */
  async showSequence(configs) {
    for (const cfg of configs) {
      await this.show(cfg);
    }
  }

  /** Close the current dialog immediately. */
  close() {
    if (!this._open) return;
    this._closeDialog();
  }

  get isOpen() { return this._open; }

  // ═══════════════════════════════════════════════════════════════
  // BUILD
  // ═══════════════════════════════════════════════════════════════

  _build() {
    if (this._built) return;
    this._built = true;

    const dW = GAME_WIDTH - 24;
    const dH = 120;
    const dX = 12;
    const dY = GAME_HEIGHT - dH - 68;
    const portW = 52;

    this._container = this.scene.add.container(0, 0)
      .setDepth(200)
      .setVisible(false);

    // ── Background panel ──────────────────────────────────────
    this._bgG = this.scene.add.graphics();
    this._bgG.fillStyle(INT.inkMid, 0.96);
    this._bgG.fillRoundedRect(dX, dY, dW, dH, 8);
    this._bgG.lineStyle(2, INT.red, 0.85);
    this._bgG.strokeRoundedRect(dX, dY, dW, dH, 8);
    // Inner border highlight
    this._bgG.lineStyle(1, INT.inkLight || 0x3A2F28, 0.4);
    this._bgG.strokeRoundedRect(dX + 2, dY + 2, dW - 4, dH - 4, 7);

    this._container.add(this._bgG);

    // ── Portrait frame ────────────────────────────────────────
    this._portraitFrame = this.scene.add.graphics();
    this._portraitFrame.fillStyle(INT.ink, 1);
    this._portraitFrame.fillRoundedRect(dX + 8, dY + 8, portW, portW, 5);
    this._portraitFrame.lineStyle(1.5, INT.red, 0.8);
    this._portraitFrame.strokeRoundedRect(dX + 8, dY + 8, portW, portW, 5);
    this._container.add(this._portraitFrame);

    // Portrait placeholder (drawn per-dialog)
    this._portraitG = this.scene.add.graphics();
    this._container.add(this._portraitG);

    // ── Speaker name ──────────────────────────────────────────
    const nameBg = this.scene.add.graphics();
    nameBg.fillStyle(INT.red, 1);
    nameBg.fillRoundedRect(dX + portW + 14, dY - 14, 130, 20, 4);
    nameBg.lineStyle(1, INT.ink, 0.7);
    nameBg.strokeRoundedRect(dX + portW + 14, dY - 14, 130, 20, 4);
    this._container.add(nameBg);

    this._speakerText = this.scene.add.text(dX + portW + 22, dY - 9, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: PALETTE.cream,
    });
    this._container.add(this._speakerText);

    // ── Dialog text ───────────────────────────────────────────
    this._dialogText = this.scene.add.text(
      dX + portW + 14,
      dY + 12,
      '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: PALETTE.cream,
        wordWrap: { width: dW - portW - 30 },
        lineSpacing: 3,
      }
    );
    this._container.add(this._dialogText);

    // ── Continue indicator ────────────────────────────────────
    this._continueArrow = this.scene.add.text(
      dX + dW - 12,
      dY + dH - 12,
      '▼',
      {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: PALETTE.gold,
      }
    ).setOrigin(1, 1).setAlpha(0);
    this._container.add(this._continueArrow);

    this.scene.tweens.add({
      targets: this._continueArrow,
      y: this._continueArrow.y - 3,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // ── Choices panel (hidden initially) ─────────────────────
    this._choicesContainer = this.scene.add.container(0, 0).setVisible(false);
    this._container.add(this._choicesContainer);

    this._dX = dX; this._dY = dY; this._dW = dW; this._dH = dH; this._portW = portW;
  }

  // ═══════════════════════════════════════════════════════════════
  // DIALOG FLOW
  // ═══════════════════════════════════════════════════════════════

  _processNext() {
    if (this._queue.length === 0) return;

    const config = this._queue.shift();
    this._currentConfig = config;
    this._currentLineIdx = 0;
    this._open = true;

    if (!this._built) this._build();

    this._container.setVisible(true);
    this._container.setAlpha(0);
    this.scene.tweens.add({ targets: this._container, alpha: 1, duration: 250, ease: 'Power2' });

    this._updatePortrait(config.portrait, config.mood, config.speaker);
    this._speakerText.setText(config.speaker || 'Unknown');
    this._choicesContainer.setVisible(false);
    this._clearChoices();

    this._showLine(config.lines[0] || '');

    // Register input
    this._pointerHandler = () => this._advance();
    this._keyHandler     = (event) => {
      if (event.key === 'Enter' || event.key === ' ') this._advance();
      if (event.key === 'Escape') this._closeDialog(null);
    };

    this.scene.input.on('pointerdown', this._pointerHandler);
    this.scene.input.keyboard.on('keydown', this._keyHandler);
  }

  _showLine(text) {
    this._currentLine  = text;
    this._lineProgress = 0;
    this._dialogText.setText('');
    this._continueArrow.setAlpha(0);

    audioEngine.playSfx('menu_hover');

    if (this._typeTimer) { this._typeTimer.remove(); this._typeTimer = null; }

    this._typeTimer = this.scene.time.addEvent({
      delay: this._typeSpeed,
      repeat: text.length - 1,
      callback: () => {
        this._lineProgress++;
        this._dialogText.setText(text.substring(0, this._lineProgress));

        // Tap sfx on punctuation
        if (['.', '!', '?', ','].includes(text[this._lineProgress - 1])) {
          audioEngine.playSfx('menu_hover');
        }

        if (this._lineProgress >= text.length) {
          this._onTypewriterDone();
        }
      },
    });
  }

  _onTypewriterDone() {
    const cfg = this._currentConfig;
    const isLastLine = this._currentLineIdx >= (cfg.lines?.length ?? 1) - 1;

    if (isLastLine && cfg.choices?.length > 0) {
      this._showChoices(cfg.choices);
    } else {
      this.scene.tweens.add({ targets: this._continueArrow, alpha: 1, duration: 200 });
    }
  }

  _advance() {
    // If typewriter still running — show full text first
    if (this._typeTimer && this._lineProgress < this._currentLine.length) {
      if (this._typeTimer) { this._typeTimer.remove(); this._typeTimer = null; }
      this._lineProgress = this._currentLine.length;
      this._dialogText.setText(this._currentLine);
      this._onTypewriterDone();
      return;
    }

    // If choices are showing — wait for choice input
    if (this._choicesVisible) return;

    const cfg = this._currentConfig;
    this._currentLineIdx++;

    if (this._currentLineIdx < (cfg.lines?.length ?? 0)) {
      this._showLine(cfg.lines[this._currentLineIdx]);
    } else if (!cfg.choices?.length) {
      this._closeDialog(null);
    }
  }

  _showChoices(choices) {
    this._choicesVisible = true;
    this._continueArrow.setAlpha(0);

    // Clear previous
    this._clearChoices();
    this._choicesContainer.setVisible(true);

    const startY = this._dY + this._dH + 8;
    const btnW = this._dW - 24;

    choices.forEach((choice, i) => {
      const by = startY + i * 42;

      const btnBg = this.scene.add.graphics();
      btnBg.fillStyle(INT.inkMid, 0.95);
      btnBg.fillRoundedRect(this._dX, by, btnW, 36, 5);
      btnBg.lineStyle(1.5, INT.uiBorder || 0x3A2F28, 1);
      btnBg.strokeRoundedRect(this._dX, by, btnW, 36, 5);

      const btnText = this.scene.add.text(this._dX + 14, by + 18, choice.label, {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: PALETTE.cream,
      }).setOrigin(0, 0.5);

      // Arrow indicator
      const arrow = this.scene.add.text(this._dX + btnW - 14, by + 18, '›', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: PALETTE.gold,
      }).setOrigin(1, 0.5).setAlpha(0);

      const zone = this.scene.add.zone(this._dX, by, btnW, 36).setOrigin(0).setInteractive();
      zone.on('pointerover', () => {
        btnBg.clear();
        btnBg.fillStyle(INT.steelDark, 0.95);
        btnBg.fillRoundedRect(this._dX, by, btnW, 36, 5);
        btnBg.lineStyle(1.5, INT.red, 0.9);
        btnBg.strokeRoundedRect(this._dX, by, btnW, 36, 5);
        arrow.setAlpha(1);
        audioEngine.playSfx('menu_hover');
      });
      zone.on('pointerout', () => {
        btnBg.clear();
        btnBg.fillStyle(INT.inkMid, 0.95);
        btnBg.fillRoundedRect(this._dX, by, btnW, 36, 5);
        btnBg.lineStyle(1.5, INT.uiBorder || 0x3A2F28, 1);
        btnBg.strokeRoundedRect(this._dX, by, btnW, 36, 5);
        arrow.setAlpha(0);
      });
      zone.on('pointerdown', () => {
        audioEngine.playSfx('menu_confirm');
        this._selectChoice(choice.value);
      });

      this._choicesContainer.add([btnBg, btnText, arrow, zone]);
      this._choiceObjects = this._choiceObjects || [];
      this._choiceObjects.push(btnBg, btnText, arrow, zone);

      // Keyboard shortcut (1-4)
      const keyCode = `${i + 1}`;
      const keyListener = (e) => { if (e.key === keyCode) { this._selectChoice(choice.value); } };
      this.scene.input.keyboard.on('keydown', keyListener);
      this._choiceKeyListeners = this._choiceKeyListeners || [];
      this._choiceKeyListeners.push(keyListener);

      // Slide in animation
      this.scene.tweens.add({
        targets: [btnBg, btnText, arrow],
        alpha: { from: 0, to: 1 },
        x: `+=${8}`,
        duration: 200,
        delay: i * 60,
        ease: 'Power2',
      });
    });
  }

  _selectChoice(value) {
    this._choicesVisible = false;
    this._clearChoices();
    this._choicesContainer.setVisible(false);
    this._closeDialog(value);
  }

  _clearChoices() {
    if (this._choiceObjects) {
      this._choiceObjects.forEach(o => o.destroy());
      this._choiceObjects = [];
    }
    if (this._choiceKeyListeners) {
      this._choiceKeyListeners.forEach(l => this.scene.input.keyboard.off('keydown', l));
      this._choiceKeyListeners = [];
    }
    this._choicesVisible = false;
  }

  _closeDialog(choiceValue = null) {
    this._open = false;

    if (this._typeTimer) { this._typeTimer.remove(); this._typeTimer = null; }
    this._clearChoices();

    // Remove input handlers
    if (this._pointerHandler) this.scene.input.off('pointerdown', this._pointerHandler);
    if (this._keyHandler)     this.scene.input.keyboard.off('keydown', this._keyHandler);

    this.scene.tweens.add({
      targets: this._container,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this._container.setVisible(false);
      },
    });

    audioEngine.playSfx('menu_cancel');

    // Resolve the promise
    if (this._currentConfig?.resolve) {
      this._currentConfig.resolve(choiceValue);
      this._currentConfig.resolve = null;
    }

    // Process next queued dialog
    this.scene.time.delayedCall(250, () => {
      if (this._queue.length > 0) this._processNext();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PORTRAIT
  // ═══════════════════════════════════════════════════════════════

  _updatePortrait(textureKey, mood, speakerName) {
    this._portraitG.clear();

    const px = this._dX + 8;
    const py = this._dY + 8;
    const pw = this._portW;

    if (textureKey && this.scene.textures.exists(textureKey)) {
      // Use provided texture
      if (!this._portraitImage) {
        this._portraitImage = this.scene.add.image(px + pw / 2, py + pw / 2, textureKey);
        this._container.add(this._portraitImage);
      } else {
        this._portraitImage.setTexture(textureKey).setVisible(true);
      }
      this._portraitImage.setScale(Math.min(pw / this._portraitImage.width, pw / this._portraitImage.height) * 0.9);
    } else {
      // Generated portrait based on speaker name hash
      this._generatePortrait(px, py, pw, speakerName, mood);
      if (this._portraitImage) this._portraitImage.setVisible(false);
    }

    // Mood border glow
    const moodColors = {
      happy:   INT.gold,
      angry:   INT.red,
      sad:     INT.steel,
      scared:  INT.volcanic || 0x7B6A9C,
      neutral: INT.uiBorder || 0x3A2F28,
    };
    this._portraitFrame.clear();
    const borderColor = moodColors[mood || 'neutral'] || INT.uiBorder || 0x3A2F28;
    this._portraitFrame.fillStyle(INT.ink, 1);
    this._portraitFrame.fillRoundedRect(px, py, pw, pw, 5);
    this._portraitFrame.lineStyle(2, borderColor, 1);
    this._portraitFrame.strokeRoundedRect(px, py, pw, pw, 5);
  }

  _generatePortrait(px, py, pw, name, mood) {
    // Generate a simple face based on speaker name hash
    const hash = this._hashName(name);
    const g = this._portraitG;

    // Skin tone palette
    const skinTones = [0xD4A87A, 0xC4905A, 0xA06840, 0x8A5030, 0x6A3820];
    const hairTones = [INT.ink, INT.brown, INT.gold, INT.red, INT.steel];
    const skinColor = skinTones[hash % skinTones.length];
    const hairColor = hairTones[(hash >> 2) % hairTones.length];

    const cx = px + pw / 2;
    const cy = py + pw / 2;
    const r  = pw * 0.38;

    // Head
    g.fillStyle(skinColor, 1);
    g.fillCircle(cx, cy, r);

    // Hair
    g.fillStyle(hairColor, 1);
    g.fillRect(cx - r, cy - r - 2, r * 2, r * 0.6);
    g.fillCircle(cx, cy - r * 0.7, r * 0.9);

    // Eyes
    g.fillStyle(INT.ink, 1);
    g.fillCircle(cx - r * 0.3, cy - r * 0.1, 2.5);
    g.fillCircle(cx + r * 0.3, cy - r * 0.1, 2.5);

    // Eye whites
    g.fillStyle(0xFFFFFF, 1);
    g.fillCircle(cx - r * 0.3 - 0.5, cy - r * 0.1 - 0.5, 1.5);
    g.fillCircle(cx + r * 0.3 - 0.5, cy - r * 0.1 - 0.5, 1.5);

    // Mouth based on mood
    g.lineStyle(1.5, INT.ink, 1);
    if (mood === 'happy') {
      g.beginPath();
      g.arc(cx, cy + r * 0.2, r * 0.25, 0.2, Math.PI - 0.2, false);
      g.strokePath();
    } else if (mood === 'angry') {
      g.beginPath();
      g.arc(cx, cy + r * 0.4, r * 0.2, Math.PI + 0.2, 2 * Math.PI - 0.2, false);
      g.strokePath();
      // Angry brow
      g.beginPath();
      g.moveTo(cx - r * 0.4, cy - r * 0.25);
      g.lineTo(cx - r * 0.15, cy - r * 0.18);
      g.moveTo(cx + r * 0.15, cy - r * 0.18);
      g.lineTo(cx + r * 0.4, cy - r * 0.25);
      g.strokePath();
    } else if (mood === 'sad') {
      g.beginPath();
      g.arc(cx, cy + r * 0.45, r * 0.22, Math.PI + 0.3, 2 * Math.PI - 0.3, false);
      g.strokePath();
    } else {
      // Neutral
      g.beginPath();
      g.moveTo(cx - r * 0.22, cy + r * 0.28);
      g.lineTo(cx + r * 0.22, cy + r * 0.28);
      g.strokePath();
    }

    // Nose dot
    g.fillStyle(INT.ink, 0.5);
    g.fillCircle(cx, cy + r * 0.1, 1.5);

    // Outline
    g.lineStyle(1.5, INT.ink, 0.9);
    g.strokeCircle(cx, cy, r);
  }

  _hashName(name) {
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) {
      h = (h * 31 + name.charCodeAt(i)) & 0xFFFFFFFF;
    }
    return Math.abs(h);
  }

  // ═══════════════════════════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════════════════════════

  destroy() {
    this._clearChoices();
    if (this._typeTimer) this._typeTimer.remove();
    if (this._container) this._container.destroy();
    this._built = false;
  }
}

// ─── CONVENIENCE NPC DIALOG BUILDER ──────────────────────────────

/**
 * Pre-built dialog configurations for common NPC types.
 */
export const NPC_DIALOGS = {
  merchant: (name = 'Merchant') => ({
    speaker: name,
    mood: 'neutral',
    lines: [
      'Greetings, traveller! I have wares to trade.',
      'From the depths of the ruins, the finest goods in all of Steelpine.',
    ],
    choices: [
      { label: 'Browse wares',   value: 'shop' },
      { label: 'Ask for info',   value: 'info' },
      { label: 'Farewell',       value: null },
    ],
  }),

  guard: (name = 'Guard') => ({
    speaker: name,
    mood: 'neutral',
    lines: [
      "Halt! State your business in Steelpine.",
      "The tribes are restless... proceed with caution.",
    ],
  }),

  sage: (name = 'Sage') => ({
    speaker: name,
    mood: 'happy',
    lines: [
      "Ah, a seeker of ancient wisdom! The crystals have foretold your arrival.",
      "The Steel Tribes once commanded these lands. Now their ruins hold great power.",
      "Seek the four portals — they will show you the way forward.",
    ],
  }),

  survivor: (name = 'Survivor') => ({
    speaker: name,
    mood: 'scared',
    lines: [
      "Please... the golems are everywhere. I can barely breathe.",
      "They came from the Ember Wastes — the Gear Golem Lord leads them.",
    ],
  }),
};
