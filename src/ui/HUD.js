// ============================================================
// POSEIDON — HUD (Heads-Up Display)
// Standalone HUD component — embeds directly in UIScene.
// Provides: bars, ability slots, minimap wrapper, status icons.
// ============================================================

import Phaser from 'phaser';
import { INT, PALETTE } from '../data/Palette.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/Constants.js';

// ─────────────────────────────────────────────────────────────────
export class HUD {
  /**
   * @param {Phaser.Scene} scene   Scene that owns this HUD
   */
  constructor(scene) {
    this.scene  = scene;
    this._depth = 100;

    this._container    = scene.add.container(0, 0).setDepth(this._depth);
    this._statusIcons  = [];
    this._comboCount   = 0;
    this._comboTimer   = 0;
    this._initialized  = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════

  init(playerData) {
    this._playerData = playerData;
    this._initialized = true;

    this._buildStatusBar();
    this._buildCoordLabel();
    this._buildBiomeLabel();
    this._buildComboDisplay();
    this._buildStatusIcons();
    this._buildBossHealthBar();

    return this;
  }

  // ═══════════════════════════════════════════════════════════════
  // STATUS BAR (top-right)
  // ═══════════════════════════════════════════════════════════════

  _buildStatusBar() {
    const x = GAME_WIDTH - 12, y = 55;

    // Clock / time of day icon
    this._timeLabel = this.scene.add.text(x, y, '☀ DAY', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.gold,
    }).setOrigin(1, 0).setDepth(this._depth);

    this._container.add(this._timeLabel);

    // Location
    this._locationLabel = this.scene.add.text(x, y + 13, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.uiTextMuted,
    }).setOrigin(1, 0).setDepth(this._depth);

    this._container.add(this._locationLabel);
  }

  setTimeOfDay(normalizedTime) {
    // normalizedTime: 0→dawn, 0.25→noon, 0.5→dusk, 0.75→night, 1→dawn
    if (!this._timeLabel) return;
    const phases = [
      { thresh: 0.05, icon: '🌅', label: 'DAWN',    color: PALETTE.gold },
      { thresh: 0.45, icon: '☀',  label: 'DAY',     color: PALETTE.gold },
      { thresh: 0.55, icon: '🌇', label: 'DUSK',    color: PALETTE.red },
      { thresh: 0.95, icon: '🌙', label: 'NIGHT',   color: PALETTE.steel },
      { thresh: 1.0,  icon: '🌅', label: 'DAWN',    color: PALETTE.gold },
    ];
    const phase = phases.find(p => normalizedTime <= p.thresh) || phases[0];
    this._timeLabel.setText(`${phase.icon} ${phase.label}`);
    this._timeLabel.setColor(phase.color);
  }

  setLocation(biomeId) {
    if (!this._locationLabel) return;
    const names = { forest: 'Steelpine Forest', volcanic: 'Ember Wastes', cyber: 'Neon Hub', ruins: 'Ancient Ruins' };
    this._locationLabel.setText(names[biomeId] || biomeId.toUpperCase());
  }

  // ═══════════════════════════════════════════════════════════════
  // COORDINATES (debug / exploration)
  // ═══════════════════════════════════════════════════════════════

  _buildCoordLabel() {
    this._coordLabel = this.scene.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 30, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.uiTextMuted,
    }).setOrigin(1, 1).setAlpha(0.5).setDepth(this._depth);

    this._container.add(this._coordLabel);
  }

  updateCoords(col, row) {
    if (this._coordLabel) this._coordLabel.setText(`[${col}, ${row}]`);
  }

  // ═══════════════════════════════════════════════════════════════
  // BIOME LABEL (center top, fades in/out on biome change)
  // ═══════════════════════════════════════════════════════════════

  _buildBiomeLabel() {
    this._biomeLabel = this.scene.add.text(GAME_WIDTH / 2, 55, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: PALETTE.cream,
      stroke: PALETTE.ink,
      strokeThickness: 3,
      letterSpacing: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(this._depth);

    this._container.add(this._biomeLabel);
  }

  showBiomeLabel(biomeId) {
    const names = { forest: 'STEELPINE FOREST', volcanic: 'EMBER WASTES', cyber: 'NEON HUB', ruins: 'ANCIENT RUINS' };
    this._biomeLabel.setText(names[biomeId] || biomeId.toUpperCase());

    this.scene.tweens.add({
      targets: this._biomeLabel,
      alpha: 1,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        this.scene.time.delayedCall(2000, () => {
          this.scene.tweens.add({ targets: this._biomeLabel, alpha: 0, duration: 800 });
        });
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // COMBO DISPLAY
  // ═══════════════════════════════════════════════════════════════

  _buildComboDisplay() {
    this._comboContainer = this.scene.add.container(GAME_WIDTH - 12, 100).setDepth(this._depth);

    this._comboText = this.scene.add.text(0, 0, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: PALETTE.gold,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    }).setOrigin(1, 0).setAlpha(0);

    this._comboSubText = this.scene.add.text(0, 26, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.uiTextMuted,
    }).setOrigin(1, 0).setAlpha(0);

    this._comboContainer.add([this._comboText, this._comboSubText]);
    this._container.add(this._comboContainer);
  }

  addCombo() {
    this._comboCount++;
    this._comboTimer = 3000; // reset timer

    if (this._comboCount >= 2) {
      this._comboText.setText(`x${this._comboCount} COMBO`);
      this._comboSubText.setText(this._comboCount >= 5 ? 'BLAZING!' : this._comboCount >= 3 ? 'GREAT!' : '');

      this.scene.tweens.killTweensOf([this._comboText, this._comboSubText]);
      this.scene.tweens.add({ targets: [this._comboText, this._comboSubText], alpha: 1, scaleX: 1.2, scaleY: 1.2, duration: 100, ease: 'Power2',
        onComplete: () => {
          this.scene.tweens.add({ targets: [this._comboText, this._comboSubText], scaleX: 1, scaleY: 1, duration: 150 });
        },
      });
    }
  }

  resetCombo() {
    if (this._comboCount > 0) {
      this._comboCount = 0;
      this.scene.tweens.add({ targets: [this._comboText, this._comboSubText], alpha: 0, duration: 400 });
    }
  }

  tickCombo(delta) {
    if (this._comboCount > 0) {
      this._comboTimer -= delta;
      if (this._comboTimer <= 0) this.resetCombo();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STATUS ICONS (debuffs / buffs)
  // ═══════════════════════════════════════════════════════════════

  _buildStatusIcons() {
    this._statusIconContainer = this.scene.add.container(12, 76).setDepth(this._depth);
    this._container.add(this._statusIconContainer);
  }

  addStatusEffect(id, icon, color, duration) {
    // Remove existing same id
    this.removeStatusEffect(id);

    const existing = this._statusIcons.length;
    const ox = existing * 22;

    const g = this.scene.add.graphics();
    g.fillStyle(parseInt(color.replace('#', ''), 16), 0.85);
    g.fillRoundedRect(0, 0, 18, 18, 3);
    g.lineStyle(1, INT.ink, 0.8);
    g.strokeRoundedRect(0, 0, 18, 18, 3);
    g.x = ox;

    const label = this.scene.add.text(ox + 9, 9, icon, {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      color: PALETTE.cream,
    }).setOrigin(0.5);

    this._statusIconContainer.add([g, label]);
    this._statusIcons.push({ id, g, label, elapsed: 0, duration, ox });

    return this;
  }

  removeStatusEffect(id) {
    this._statusIcons = this._statusIcons.filter(s => {
      if (s.id === id) { s.g.destroy(); s.label.destroy(); return false; }
      return true;
    });
    this._relayoutStatusIcons();
  }

  tickStatusEffects(delta) {
    this._statusIcons = this._statusIcons.filter(s => {
      s.elapsed += delta;
      const remaining = s.duration - s.elapsed;
      if (remaining < 500) {
        s.g.setAlpha(0.4 + 0.6 * Math.sin(s.elapsed / 80));
      }
      if (s.elapsed >= s.duration) {
        s.g.destroy(); s.label.destroy();
        return false;
      }
      return true;
    });
    this._relayoutStatusIcons();
  }

  _relayoutStatusIcons() {
    this._statusIcons.forEach((s, i) => {
      s.g.x = i * 22;
      s.label.x = i * 22 + 9;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // BOSS HEALTH BAR (full-width, top of screen)
  // ═══════════════════════════════════════════════════════════════

  _buildBossHealthBar() {
    const barW = GAME_WIDTH - 40;
    const barX = 20, barY = 48;

    this._bossBarContainer = this.scene.add.container(0, 0).setVisible(false).setDepth(this._depth + 1);

    const bg = this.scene.add.graphics();
    bg.fillStyle(INT.ink, 0.9);
    bg.fillRoundedRect(barX, barY, barW, 14, 4);
    bg.lineStyle(2, INT.red, 0.8);
    bg.strokeRoundedRect(barX, barY, barW, 14, 4);

    this._bossBarFg = this.scene.add.graphics();
    this._bossBarFg.fillStyle(INT.red, 1);
    this._bossBarFg.fillRoundedRect(barX + 1, barY + 1, barW - 2, 12, 3);

    this._bossNameText = this.scene.add.text(GAME_WIDTH / 2, barY - 6, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: PALETTE.red,
      letterSpacing: 2,
    }).setOrigin(0.5, 1);

    this._bossBarContainer.add([bg, this._bossBarFg, this._bossNameText]);
    this._bossBarW = barW;
    this._bossBarX = barX;
    this._bossBarY = barY;

    this._container.add(this._bossBarContainer);
  }

  showBossBar(name, currentHp, maxHp) {
    this._bossBarContainer.setVisible(true);
    this._bossNameText.setText(name.toUpperCase());
    this._updateBossBar(currentHp, maxHp);

    this.scene.tweens.add({ targets: this._bossBarContainer, alpha: 1, duration: 400 });
  }

  hideBossBar() {
    this.scene.tweens.add({
      targets: this._bossBarContainer,
      alpha: 0,
      duration: 600,
      onComplete: () => this._bossBarContainer.setVisible(false),
    });
  }

  _updateBossBar(current, max) {
    if (!this._bossBarFg) return;
    const pct = Math.max(0, Math.min(1, current / max));
    this._bossBarFg.clear();

    const color = pct > 0.5 ? INT.red : pct > 0.25 ? INT.lava || 0xE87840 : INT.ember || 0xE84020;
    this._bossBarFg.fillStyle(color, 1);
    this._bossBarFg.fillRoundedRect(
      this._bossBarX + 1,
      this._bossBarY + 1,
      Math.round((this._bossBarW - 2) * pct),
      12,
      3
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════

  update(time, delta) {
    if (!this._initialized) return;
    this.tickCombo(delta);
    this.tickStatusEffects(delta);
  }

  // ═══════════════════════════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════════════════════════

  destroy() {
    this._container.destroy();
    this._bossBarContainer?.destroy();
    this._comboContainer?.destroy();
    this._statusIconContainer?.destroy();
  }
}
