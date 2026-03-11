// ============================================================
// POSEIDON — UI SCENE
// Persistent overlay HUD — runs on top of WorldScene.
// Health, mana, minimap, ability bar, notifications.
// ============================================================

import Phaser from 'phaser';
import { audioEngine } from '../audio/AudioEngine.js';
import { INT, PALETTE } from '../data/Palette.js';
import { ABILITIES }    from '../data/GameData.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../GameConfig.js';

// ─────────────────────────────────────────────────────────────────
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });

    this._player         = null;
    this._notifications  = [];
    this._dialogQueue    = [];
    this._dialogOpen     = false;
    this._minimapDots    = [];
  }

  // ─── LIFECYCLE ───────────────────────────────────────────────

  create() {
    // Transparent background — this scene is an overlay
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    this._buildHPMPBars();
    this._buildAbilityBar();
    this._buildMinimap();
    this._buildNotificationArea();
    this._buildMenuButton();
    this._buildXPBar();
    this._buildLevelBadge();

    // Listen for events from WorldScene
    const worldScene = this.scene.get('WorldScene');
    if (worldScene) {
      worldScene.events.on('playerStatsUpdate', this._onPlayerStats, this);
      worldScene.events.on('playerAbilityUsed', this._onAbilityUsed, this);
      worldScene.events.on('showNotification',  this._onNotification, this);
      worldScene.events.on('showDialog',        this._onDialog, this);
      worldScene.events.on('minimapUpdate',     this._onMinimapUpdate, this);
      worldScene.events.on('levelUp',           this._onLevelUp, this);
      worldScene.events.on('xpGain',            this._onXPGain, this);
    }

    // Keyboard shortcut for pause / menu
    this.input.keyboard.on('keydown-ESC', () => this._togglePauseMenu(), this);
    this.input.keyboard.on('keydown-M',   () => this._toggleMinimap(), this);
  }

  update(time, delta) {
    this._tickNotifications(delta);
    this._tickDialogQueue(delta);
    this._animateAbilityBar(time);
  }

  // ─── HP / MP BARS ────────────────────────────────────────────

  _buildHPMPBars() {
    const panelX = 12, panelY = 12;
    const panelW = 180, panelH = 56;

    // Panel bg
    const panelG = this.add.graphics();
    panelG.fillStyle(INT.ink, 0.82);
    panelG.fillRoundedRect(panelX, panelY, panelW, panelH, 7);
    panelG.lineStyle(1.5, INT.uiBorder || 0x3A2F28, 1);
    panelG.strokeRoundedRect(panelX, panelY, panelW, panelH, 7);

    // HP label
    this.add.text(panelX + 10, panelY + 8, 'HP', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.red,
      fontStyle: 'bold',
    });

    // HP bar track
    const hpTrack = this.add.graphics();
    hpTrack.fillStyle(0x000000, 0.6);
    hpTrack.fillRoundedRect(panelX + 28, panelY + 7, 140, 11, 3);

    this._hpFill = this.add.graphics();
    this._hpFill.fillStyle(INT.red, 1);
    this._hpFill.fillRoundedRect(panelX + 28, panelY + 7, 140, 11, 3);

    // HP shine
    const hpShine = this.add.graphics();
    hpShine.fillStyle(0xFFFFFF, 0.12);
    hpShine.fillRect(panelX + 28, panelY + 7, 140, 4);

    this._hpText = this.add.text(panelX + 175, panelY + 7, '100/100', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.cream,
    }).setOrigin(1, 0);

    // MP label
    this.add.text(panelX + 10, panelY + 27, 'MP', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.steel,
      fontStyle: 'bold',
    });

    const mpTrack = this.add.graphics();
    mpTrack.fillStyle(0x000000, 0.6);
    mpTrack.fillRoundedRect(panelX + 28, panelY + 27, 140, 11, 3);

    this._mpFill = this.add.graphics();
    this._mpFill.fillStyle(INT.steel, 1);
    this._mpFill.fillRoundedRect(panelX + 28, panelY + 27, 140, 11, 3);

    this._mpText = this.add.text(panelX + 175, panelY + 27, '100/100', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.cream,
    }).setOrigin(1, 0);

    // Stamina bar (thin)
    this.add.text(panelX + 10, panelY + 46, 'ST', {
      fontFamily: '"Courier New", monospace',
      fontSize: '7px',
      color: PALETTE.green,
    });

    const stTrack = this.add.graphics();
    stTrack.fillStyle(0x000000, 0.5);
    stTrack.fillRect(panelX + 28, panelY + 47, 140, 6);

    this._stFill = this.add.graphics();
    this._stFill.fillStyle(INT.green, 1);
    this._stFill.fillRect(panelX + 28, panelY + 47, 140, 6);
  }

  _updateHPBar(current, max) {
    const panelX = 12, panelY = 12;
    const pct = Math.max(0, Math.min(1, current / max));
    this._hpFill.clear();

    // Color shifts: green → yellow → red
    let color = INT.red;
    if (pct > 0.6) color = INT.green;
    else if (pct > 0.3) color = INT.gold;

    this._hpFill.fillStyle(color, 1);
    this._hpFill.fillRoundedRect(panelX + 28, panelY + 7, Math.round(140 * pct), 11, 3);
    this._hpText.setText(`${Math.max(0, Math.round(current))}/${max}`);
  }

  _updateMPBar(current, max) {
    const panelX = 12, panelY = 12;
    const pct = Math.max(0, Math.min(1, current / max));
    this._mpFill.clear();
    this._mpFill.fillStyle(INT.steel, 1);
    this._mpFill.fillRoundedRect(panelX + 28, panelY + 27, Math.round(140 * pct), 11, 3);
    this._mpText.setText(`${Math.max(0, Math.round(current))}/${max}`);
  }

  _updateStaminaBar(current, max) {
    const panelX = 12, panelY = 12;
    const pct = Math.max(0, Math.min(1, current / max));
    this._stFill.clear();
    this._stFill.fillStyle(INT.green, 1);
    this._stFill.fillRect(panelX + 28, panelY + 47, Math.round(140 * pct), 6);
  }

  // ─── XP BAR ──────────────────────────────────────────────────

  _buildXPBar() {
    const barX = 12, barY = GAME_HEIGHT - 8;
    const barW = GAME_WIDTH - 24;

    const track = this.add.graphics();
    track.fillStyle(INT.ink, 0.75);
    track.fillRect(barX, barY - 5, barW, 4);

    this._xpFill = this.add.graphics();
    this._xpFill.fillStyle(INT.gold, 1);
    this._xpFill.fillRect(barX, barY - 5, 0, 4);
  }

  _updateXPBar(current, max) {
    const barX = 12;
    const barW = GAME_WIDTH - 24;
    const pct = Math.max(0, Math.min(1, current / max));
    this._xpFill.clear();
    this._xpFill.fillStyle(INT.gold, 1);
    this._xpFill.fillRect(barX, GAME_HEIGHT - 13, Math.round(barW * pct), 4);
  }

  // ─── LEVEL BADGE ─────────────────────────────────────────────

  _buildLevelBadge() {
    const bx = GAME_WIDTH - 14, by = 14;

    const bg = this.add.graphics();
    bg.fillStyle(INT.red, 1);
    bg.fillCircle(bx, by, 16);
    bg.lineStyle(2, INT.cream, 0.7);
    bg.strokeCircle(bx, by, 16);

    this._levelLabel = this.add.text(bx, by, '1', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: PALETTE.cream,
    }).setOrigin(0.5);

    this.add.text(bx, by + 19, 'LVL', {
      fontFamily: '"Courier New", monospace',
      fontSize: '7px',
      color: PALETTE.uiTextMuted,
    }).setOrigin(0.5);
  }

  // ─── ABILITY BAR ─────────────────────────────────────────────

  _buildAbilityBar() {
    const barY = GAME_HEIGHT - 60;
    const slotW = 50, slotH = 50;
    const count = 4;
    const startX = GAME_WIDTH / 2 - (count * (slotW + 4)) / 2;

    this._abilitySlots = [];

    for (let i = 0; i < count; i++) {
      const sx = startX + i * (slotW + 4);

      const bg = this.add.graphics();
      bg.fillStyle(INT.inkMid, 0.88);
      bg.fillRoundedRect(sx, barY, slotW, slotH, 5);
      bg.lineStyle(1.5, INT.uiBorder || 0x3A2F28, 1);
      bg.strokeRoundedRect(sx, barY, slotW, slotH, 5);

      // Icon placeholder
      const icon = this.add.graphics();
      const colors = [INT.crystal, INT.red, INT.gold, INT.magic || 0xA060D0];
      icon.fillStyle(colors[i], 0.8);
      icon.beginPath();
      icon.moveTo(sx + slotW / 2, barY + 10);
      icon.lineTo(sx + slotW / 2 + 10, barY + slotH / 2);
      icon.lineTo(sx + slotW / 2, barY + slotH - 10);
      icon.lineTo(sx + slotW / 2 - 10, barY + slotH / 2);
      icon.closePath();
      icon.fillPath();

      // Hotkey label
      this.add.text(sx + 4, barY + 3, `${i + 1}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '8px',
        color: PALETTE.uiTextMuted,
      });

      // Cooldown overlay
      const cooldown = this.add.graphics();
      cooldown.setAlpha(0);

      this._abilitySlots.push({ bg, icon, cooldown, sx, barY, slotW, slotH, cooldownPct: 0, active: false });
    }
  }

  _animateAbilityBar(time) {
    this._abilitySlots.forEach((slot, i) => {
      // Pulse the active slot
      if (slot.active) {
        const pulse = 0.85 + 0.15 * Math.sin(time / 300 + i);
        slot.bg.setAlpha(pulse);
      }

      // Draw cooldown overlay
      if (slot.cooldownPct > 0) {
        slot.cooldown.clear();
        slot.cooldown.fillStyle(INT.ink, 0.65);
        const h = slot.slotH * slot.cooldownPct;
        slot.cooldown.fillRoundedRect(slot.sx + 1, slot.barY + slot.slotH - h, slot.slotW - 2, h, 4);
        slot.cooldown.setAlpha(1);
      } else {
        slot.cooldown.setAlpha(0);
      }
    });
  }

  // ─── MINIMAP ─────────────────────────────────────────────────

  _buildMinimap() {
    const S = 84;
    const mx = GAME_WIDTH - S - 8;
    const my = 32;

    // Circular clip bg
    const mmBg = this.add.graphics();
    mmBg.fillStyle(INT.ink, 0.82);
    mmBg.fillCircle(mx + S / 2, my + S / 2, S / 2);
    mmBg.lineStyle(2, INT.steelMid, 0.7);
    mmBg.strokeCircle(mx + S / 2, my + S / 2, S / 2);

    this._minimapContainer = this.add.container(mx + S / 2, my + S / 2);
    this._minimapBounds = { x: mx, y: my, w: S, h: S };

    // Player dot
    this._minimapPlayer = this.add.graphics();
    this._minimapPlayer.fillStyle(INT.red, 1);
    this._minimapPlayer.fillCircle(0, 0, 3);
    this._minimapContainer.add(this._minimapPlayer);

    // Compass label
    this.add.text(mx + S / 2, my + 2, 'N', {
      fontFamily: '"Courier New", monospace',
      fontSize: '7px',
      color: PALETTE.red,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.add.text(mx + S / 2, my + S - 4, 'S', {
      fontFamily: '"Courier New", monospace',
      fontSize: '7px',
      color: PALETTE.uiTextMuted,
    }).setOrigin(0.5, 1);

    this._minimapVisible = true;
  }

  _toggleMinimap() {
    this._minimapVisible = !this._minimapVisible;
    this._minimapContainer.setVisible(this._minimapVisible);
  }

  _onMinimapUpdate(data) {
    if (!data) return;

    // Clear old dots
    this._minimapDots.forEach(d => d.destroy());
    this._minimapDots = [];

    const { playerNorm, entities, mapW, mapH } = data;
    const S = this._minimapBounds.w;
    const r = S / 2 - 6;

    // Move player dot
    if (playerNorm) {
      const px = (playerNorm.x - 0.5) * r * 2;
      const py = (playerNorm.y - 0.5) * r * 2;
      this._minimapPlayer.x = px;
      this._minimapPlayer.y = py;
    }

    // Draw entity dots
    if (entities) {
      entities.forEach(e => {
        const dot = this.add.graphics();
        dot.fillStyle(e.isEnemy ? INT.red : INT.gold, 0.8);
        dot.fillCircle(0, 0, 2);
        const ex = (e.normX - 0.5) * r * 2;
        const ey = (e.normY - 0.5) * r * 2;
        dot.x = ex;
        dot.y = ey;
        this._minimapContainer.add(dot);
        this._minimapDots.push(dot);
      });
    }
  }

  // ─── NOTIFICATIONS ───────────────────────────────────────────

  _buildNotificationArea() {
    this._notifY = GAME_HEIGHT * 0.25;
  }

  _onNotification(data) {
    const { message, type = 'info', duration = 3000 } = data;
    const colors = {
      info:    PALETTE.cream,
      success: PALETTE.gold,
      warning: PALETTE.red,
      xp:      PALETTE.gold,
      level:   PALETTE.gold,
      item:    PALETTE.steelLight,
    };
    const color = colors[type] || PALETTE.cream;

    const notif = {
      text: this.add.text(GAME_WIDTH / 2, this._notifY - this._notifications.length * 22, message, {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        fontStyle: type === 'level' ? 'bold' : 'normal',
        color,
        stroke: PALETTE.ink,
        strokeThickness: 2,
        shadow: { offsetX: 0, offsetY: 2, color: PALETTE.ink, blur: 4, fill: true },
      }).setOrigin(0.5).setAlpha(0),
      elapsed: 0,
      duration,
    };

    this.tweens.add({ targets: notif.text, alpha: 1, y: notif.text.y - 10, duration: 250, ease: 'Power2' });
    this._notifications.push(notif);

    if (type === 'level') {
      this.cameras.main.flash(300, 200, 180, 80, true);
    }
  }

  _tickNotifications(delta) {
    this._notifications = this._notifications.filter(n => {
      n.elapsed += delta;
      if (n.elapsed >= n.duration - 500) {
        n.text.setAlpha(Math.max(0, 1 - (n.elapsed - (n.duration - 500)) / 500));
      }
      if (n.elapsed >= n.duration) {
        n.text.destroy();
        return false;
      }
      return true;
    });
  }

  // ─── DIALOG SYSTEM ───────────────────────────────────────────

  _buildDialogBox() {
    const dW = GAME_WIDTH - 24;
    const dH = 110;
    const dX = 12, dY = GAME_HEIGHT - dH - 70;

    this._dialogContainer = this.add.container(0, 0).setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(INT.inkMid, 0.95);
    bg.fillRoundedRect(dX, dY, dW, dH, 8);
    bg.lineStyle(2, INT.red, 0.8);
    bg.strokeRoundedRect(dX, dY, dW, dH, 8);

    // Speaker name panel
    const nameBg = this.add.graphics();
    nameBg.fillStyle(INT.red, 1);
    nameBg.fillRoundedRect(dX + 8, dY - 14, 120, 20, 4);

    this._dialogSpeaker = this.add.text(dX + 14, dY - 10, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: PALETTE.cream,
    });

    this._dialogText = this.add.text(dX + 12, dY + 12, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px',
      color: PALETTE.cream,
      wordWrap: { width: dW - 24 },
      lineSpacing: 3,
    });

    this._dialogContinue = this.add.text(dX + dW - 12, dY + dH - 10, '▼ TAP', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.gold,
    }).setOrigin(1, 1);

    this.tweens.add({
      targets: this._dialogContinue,
      alpha: 0.4,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this._dialogContainer.add([bg, nameBg, this._dialogSpeaker, this._dialogText, this._dialogContinue]);

    // Click/tap to advance
    this.input.on('pointerdown', () => {
      if (this._dialogOpen) this._advanceDialog();
    });
    this.input.keyboard.on('keydown-ENTER', () => {
      if (this._dialogOpen) this._advanceDialog();
    });
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this._dialogOpen) this._advanceDialog();
    });
  }

  _onDialog(data) {
    // data = { speaker, lines: [] }
    if (!this._dialogContainer) this._buildDialogBox();
    this._dialogQueue.push(data);
  }

  _tickDialogQueue(_delta) {
    if (!this._dialogOpen && this._dialogQueue.length > 0) {
      const next = this._dialogQueue.shift();
      this._openDialog(next);
    }
  }

  _openDialog(data) {
    if (!this._dialogContainer) this._buildDialogBox();
    this._dialogOpen = true;
    this._currentDialog = data;
    this._dialogLineIdx = 0;

    this._dialogContainer.setVisible(true);
    this._showDialogLine();

    // Pause world scene
    const ws = this.scene.get('WorldScene');
    if (ws) ws.scene.pause();

    audioEngine.playSfx('menu_confirm');
  }

  _showDialogLine() {
    const d = this._currentDialog;
    if (!d) return;

    this._dialogSpeaker.setText(d.speaker || '');
    const line = d.lines?.[this._dialogLineIdx] || '';
    this._dialogText.setText('');

    // Typewriter effect
    let i = 0;
    if (this._typewriterTimer) this._typewriterTimer.remove();
    this._typewriterTimer = this.time.addEvent({
      delay: 28,
      repeat: line.length - 1,
      callback: () => {
        this._dialogText.setText(line.substring(0, ++i));
      },
    });
  }

  _advanceDialog() {
    const d = this._currentDialog;
    if (!d) return;

    // If typewriter still running, show full line first
    if (this._typewriterTimer && this._typewriterTimer.getProgress() < 1) {
      this._typewriterTimer.remove();
      this._dialogText.setText(d.lines[this._dialogLineIdx]);
      return;
    }

    this._dialogLineIdx++;
    if (this._dialogLineIdx < d.lines.length) {
      this._showDialogLine();
      audioEngine.playSfx('menu_hover');
    } else {
      this._closeDialog();
    }
  }

  _closeDialog() {
    this._dialogOpen = false;
    this._dialogContainer.setVisible(false);
    audioEngine.playSfx('menu_cancel');

    // Resume world
    const ws = this.scene.get('WorldScene');
    if (ws) ws.scene.resume();

    // Emit event so WorldScene can react
    ws?.events.emit('dialogClosed', { speaker: this._currentDialog?.speaker });
  }

  // ─── PAUSE MENU ──────────────────────────────────────────────

  _buildMenuButton() {
    const btn = this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 130, '≡', {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px',
      color: PALETTE.cream,
    }).setOrigin(1, 0.5).setAlpha(0.7).setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => this._togglePauseMenu());
    btn.on('pointerover', () => btn.setAlpha(1));
    btn.on('pointerout',  () => btn.setAlpha(0.7));
  }

  _togglePauseMenu() {
    if (this._pauseOpen) {
      this._closePauseMenu();
    } else {
      this._openPauseMenu();
    }
  }

  _openPauseMenu() {
    this._pauseOpen = true;
    audioEngine.playSfx('menu_confirm');

    const ws = this.scene.get('WorldScene');
    if (ws) ws.scene.pause();

    const overlay = this.add.graphics();
    overlay.fillStyle(INT.ink, 0.7);
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const panelW = 220, panelH = 280;
    const panelX = (GAME_WIDTH - panelW) / 2;
    const panelY = (GAME_HEIGHT - panelH) / 2;

    const panelG = this.add.graphics();
    panelG.fillStyle(INT.inkMid, 0.97);
    panelG.fillRoundedRect(panelX, panelY, panelW, panelH, 10);
    panelG.lineStyle(2, INT.red, 0.9);
    panelG.strokeRoundedRect(panelX, panelY, panelW, panelH, 10);

    const title = this.add.text(GAME_WIDTH / 2, panelY + 24, 'PAUSED', {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: PALETTE.cream,
      letterSpacing: 4,
    }).setOrigin(0.5);

    const menuItems = [
      { label: 'Resume',       action: () => this._closePauseMenu() },
      { label: 'Music: On',    action: () => this._toggleMusic(menuItems[1]) },
      { label: 'Back to Menu', action: () => this._gotoMainMenu() },
    ];

    const menuTexts = menuItems.map((item, i) => {
      const t = this.add.text(GAME_WIDTH / 2, panelY + 80 + i * 48, item.label, {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: PALETTE.cream,
        letterSpacing: 1,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      t.on('pointerover', () => { t.setColor(PALETTE.gold); audioEngine.playSfx('menu_hover'); });
      t.on('pointerout',  () => t.setColor(PALETTE.cream));
      t.on('pointerdown', () => { audioEngine.playSfx('menu_confirm'); item.action(); });
      return t;
    });

    this._pauseObjects = [overlay, panelG, title, ...menuTexts];
  }

  _closePauseMenu() {
    this._pauseOpen = false;
    if (this._pauseObjects) {
      this._pauseObjects.forEach(o => o.destroy());
      this._pauseObjects = null;
    }

    const ws = this.scene.get('WorldScene');
    if (ws) ws.scene.resume();
    audioEngine.playSfx('menu_cancel');
  }

  _toggleMusic(menuItem) {
    if (audioEngine._muted) {
      audioEngine.unmute();
      menuItem.label = 'Music: On';
    } else {
      audioEngine.mute();
      menuItem.label = 'Music: Off';
    }
    this._closePauseMenu();
    this._openPauseMenu();
  }

  _gotoMainMenu() {
    audioEngine.stopMusic();
    this._closePauseMenu();

    this.cameras.main.fade(400, 0, 0, 0);
    this.time.delayedCall(420, () => {
      this.scene.stop('WorldScene');
      this.scene.stop('UIScene');
      this.scene.start('MainMenuScene');
    });
  }

  // ─── EVENT HANDLERS ──────────────────────────────────────────

  _onPlayerStats(stats) {
    if (!stats) return;
    this._updateHPBar(stats.currentHp, stats.maxHp);
    this._updateMPBar(stats.currentMp, stats.maxMp);
    if (stats.stamina !== undefined) this._updateStaminaBar(stats.stamina, 100);
    if (stats.xp !== undefined) this._updateXPBar(stats.xp, stats.xpToNext);
    if (stats.level !== undefined && this._levelLabel) {
      this._levelLabel.setText(`${stats.level}`);
    }
  }

  _onAbilityUsed(data) {
    const { index, cooldownMs } = data;
    if (!this._abilitySlots[index]) return;

    const slot = this._abilitySlots[index];
    slot.cooldownPct = 1;

    const steps = Math.ceil(cooldownMs / 50);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      slot.cooldownPct = Math.max(0, 1 - step / steps);
      if (step >= steps) {
        slot.cooldownPct = 0;
        clearInterval(interval);
      }
    }, 50);
  }

  _onLevelUp(data) {
    if (this._levelLabel) this._levelLabel.setText(`${data.level}`);
    this._onNotification({ message: `LEVEL UP! → ${data.level}`, type: 'level', duration: 4000 });
    audioEngine.playSfx('level_up');
  }

  _onXPGain(data) {
    if (data.xp !== undefined) this._updateXPBar(data.xp, data.xpToNext);
    if (data.gained) {
      this._onNotification({ message: `+${data.gained} XP`, type: 'xp', duration: 1500 });
    }
  }
}
