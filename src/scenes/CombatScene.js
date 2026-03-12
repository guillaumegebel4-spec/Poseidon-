// ============================================================
// POSEIDON — COMBAT SCENE
// Turn-based tactical combat arena — Steelpine style.
// Launched on top of WorldScene; returns control on exit.
// ============================================================

import Phaser from 'phaser';
import { TextureFactory }  from '../graphics/TextureFactory.js';
import { audioEngine }     from '../audio/AudioEngine.js';
import { INT, PALETTE, BIOME_PALETTES } from '../data/Palette.js';
import { CHARACTERS, ENEMIES, ABILITIES } from '../data/GameData.js';
import { CombatSystem }    from '../systems/CombatSystem.js';
import {
  GAME_WIDTH, GAME_HEIGHT,
  TILE_W, TILE_H, TILE_DEPTH,
  ARENA_COLS, ARENA_ROWS,
} from '../data/Constants.js';

// ─── CONSTANTS ───────────────────────────────────────────────────
const PHASES = {
  INTRO:     'intro',
  PLAYER:    'player_turn',
  ENEMY:     'enemy_turn',
  ANIMATING: 'animating',
  VICTORY:   'victory',
  DEFEAT:    'defeat',
};

const ARENA_TILE_W = 44;
const ARENA_TILE_H = 22;
const ARENA_DEPTH  = 14;
// Hardcoded to avoid circular-import TDZ (GameConfig imports CombatScene which imports GameConfig)
const ARENA_ORIGIN_X = 195;   // = GAME_WIDTH / 2   (390 / 2)
const ARENA_ORIGIN_Y = 354;   // = GAME_HEIGHT * 0.42  (844 * 0.42)

// ─────────────────────────────────────────────────────────────────
export class CombatScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CombatScene' });

    this.phase       = PHASES.INTRO;
    this.player      = null;
    this.enemies     = [];
    this.selectedAbility = 0;
    this.turnCount   = 0;

    this._combatLog  = [];
    this._logTexts   = [];
    this._abilityBtns = [];
    this._floatingNums = [];
  }

  // ─── LIFECYCLE ───────────────────────────────────────────────

  init(data) {
    this.playerData    = data.playerData    || {};
    this.enemyData     = data.enemyData     || {};
    this.biomeId       = data.biomeId       || 'forest';
    this.returnScene   = data.returnScene   || 'WorldScene';
    this.isBoss        = data.isBoss        || false;
  }

  create() {
    const tf = new TextureFactory(this);
    tf.generateAll();

    audioEngine.playMusic(this.isBoss ? 'boss' : 'combat');

    this._buildArenaBackground();
    this._buildArenaGrid();
    this._buildCombatants();
    this._buildUI();
    this._buildAbilityBar();
    this._buildCombatLog();

    this._initInput();
    this._startIntro();
  }

  update(time, delta) {
    this._updateFloatingNums(delta);
    this._updateCombatantAnimations(time);

    if (this.phase === PHASES.PLAYER) {
      this._pollKeyboardInput();
    }
  }

  // ─── BACKGROUND & ARENA ──────────────────────────────────────

  _buildArenaBackground() {
    const pal = BIOME_PALETTES[this.biomeId] || BIOME_PALETTES.forest;

    // Solid dark background (fillGradientStyle unreliable in Canvas mode on iOS)
    this.cameras.main.setBackgroundColor('#0D0A08');
    const bg = this.add.graphics();
    bg.fillStyle(0x0D0A08, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Atmospheric fog
    bg.fillStyle(parseInt((pal.fog || 'rgba(90,140,90,0.15)').replace(/[^0-9,]/g, '').split(',').slice(0,3).reduce((h, c, i) => h + Math.round(parseInt(c)).toString(16).padStart(2,'0'), '0x'), 16) || 0x2A3A1A, 0.12);
    bg.fillRect(0, GAME_HEIGHT * 0.3, GAME_WIDTH, GAME_HEIGHT * 0.7);

    // Title bar
    bg.fillStyle(INT.ink, 0.85);
    bg.fillRect(0, 0, GAME_WIDTH, 42);
    bg.lineStyle(1, INT.uiBorder || 0x3A2F28, 1);
    bg.lineBetween(0, 42, GAME_WIDTH, 42);

    this.add.text(GAME_WIDTH / 2, 21, this.isBoss ? '⚔  BOSS BATTLE' : '⚔  COMBAT', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: PALETTE.cream,
      letterSpacing: 2,
    }).setOrigin(0.5);

    const biomeLabel = this.biomeId.toUpperCase();
    this.add.text(GAME_WIDTH - 12, 21, biomeLabel, {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.uiTextMuted,
      letterSpacing: 1,
    }).setOrigin(1, 0.5);
  }

  _buildArenaGrid() {
    this._arenaLayer = this.add.container(0, 0);
    const bPal = BIOME_PALETTES[this.biomeId] || BIOME_PALETTES.forest;

    // Draw a smaller isometric grid for the combat arena
    for (let row = 0; row < ARENA_ROWS; row++) {
      for (let col = 0; col < ARENA_COLS; col++) {
        const { x, y } = this._arenaToScreen(col, row);
        const tile = this._makeArenaTile(col, row, bPal);
        tile.x = x;
        tile.y = y;
        this._arenaLayer.add(tile);
      }
    }

    // Border highlight
    const borderG = this.add.graphics();
    borderG.lineStyle(1.5, INT.red, 0.4);
    const corners = [
      this._arenaToScreen(0, 0),
      this._arenaToScreen(ARENA_COLS - 1, 0),
      this._arenaToScreen(ARENA_COLS - 1, ARENA_ROWS - 1),
      this._arenaToScreen(0, ARENA_ROWS - 1),
    ];
    borderG.beginPath();
    corners.forEach((c, i) => {
      if (i === 0) borderG.moveTo(c.x, c.y - ARENA_TILE_H / 2);
      else borderG.lineTo(c.x, c.y - ARENA_TILE_H / 2);
    });
    borderG.closePath();
    borderG.strokePath();
    this._arenaLayer.add(borderG);
  }

  _makeArenaTile(col, row, pal) {
    const g = this.add.graphics();
    const W = ARENA_TILE_W, H = ARENA_TILE_H, D = ARENA_DEPTH;

    // Checkerboard pattern
    const isDark = (col + row) % 2 === 0;
    const topHex = isDark ? pal.tileTop : pal.tileRight;
    const topColor = parseInt((topHex || '#3A6A39').replace('#', ''), 16);
    const leftColor = parseInt((pal.tileLeft || '#1A3A19').replace('#', ''), 16);

    // Top face
    g.fillStyle(topColor, 1);
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W, H / 2);
    g.lineTo(W / 2, H);
    g.lineTo(0, H / 2);
    g.closePath();
    g.fillPath();

    // Left side
    g.fillStyle(leftColor, 1);
    g.beginPath();
    g.moveTo(0, H / 2);
    g.lineTo(W / 2, H);
    g.lineTo(W / 2, H + D);
    g.lineTo(0, H / 2 + D);
    g.closePath();
    g.fillPath();

    // Outline
    g.lineStyle(1, INT.ink, 0.7);
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W, H / 2);
    g.lineTo(W / 2, H);
    g.lineTo(0, H / 2);
    g.closePath();
    g.strokePath();

    g.setPosition(-W / 2, -H / 2);
    return g;
  }

  _arenaToScreen(col, row) {
    const x = ARENA_ORIGIN_X + (col - row) * (ARENA_TILE_W / 2);
    const y = ARENA_ORIGIN_Y + (col + row) * (ARENA_TILE_H / 2);
    return { x, y };
  }

  // ─── COMBATANTS ───────────────────────────────────────────────

  _buildCombatants() {
    // Player sprite — left side of arena
    const pPos = this._arenaToScreen(2, 4);
    this._playerSprite = this._createCombatantSprite(
      pPos.x, pPos.y - 20,
      `char_${this.playerData.id || 'vormund'}_idle`,
      true
    );

    // Enemy sprite — right side
    const ePos = this._arenaToScreen(6, 4);
    this._enemySprite = this._createCombatantSprite(
      ePos.x, ePos.y - 20,
      `enemy_${this.enemyData.sprite || 'golem'}_idle`,
      false
    );

    // Shadow
    [this._playerSprite, this._enemySprite].forEach(spr => {
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.3);
      shadow.fillEllipse(spr.x, spr.y + 20, 36, 10);
    });
  }

  _createCombatantSprite(x, y, textureKey, isPlayer) {
    let spr;
    if (this.textures.exists(textureKey)) {
      spr = this.add.image(x, y, textureKey).setScale(isPlayer ? 1.4 : 1.6);
    } else {
      // Fallback
      const g = this.add.graphics();
      g.fillStyle(isPlayer ? INT.steel : INT.red, 1);
      g.fillRect(-12, -24, 24, 36);
      g.x = x; g.y = y;
      return g;
    }

    if (!isPlayer) spr.setFlipX(true);

    // Idle float tween
    this.tweens.add({
      targets: spr,
      y: y - 4,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return spr;
  }

  // ─── UI ───────────────────────────────────────────────────────

  _buildUI() {
    const panelH = 70;

    // Player HP/MP panel
    this._buildStatPanel(12, GAME_HEIGHT - panelH - 8, panelH, true);
    // Enemy HP panel
    this._buildStatPanel(GAME_WIDTH - 12, GAME_HEIGHT - panelH - 8, panelH, false);

    // Turn indicator
    this._turnLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 120, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: PALETTE.gold,
      letterSpacing: 2,
    }).setOrigin(0.5);

    this._updateTurnLabel();
  }

  _buildStatPanel(x, y, h, isPlayer) {
    const w = 140;
    const ox = isPlayer ? 0 : -w;

    const bg = this.add.graphics();
    bg.fillStyle(INT.ink, 0.88);
    bg.fillRoundedRect(x + ox, y, w, h, 6);
    bg.lineStyle(1.5, isPlayer ? INT.steel : INT.red, 0.8);
    bg.strokeRoundedRect(x + ox, y, w, h, 5);

    const data = isPlayer ? this.playerData : this.enemyData;
    const nameColor = isPlayer ? PALETTE.steelLight : PALETTE.redLight;

    this.add.text(x + ox + 8, y + 8, (data.name || '???').toUpperCase(), {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: nameColor,
      letterSpacing: 1,
    });

    // HP bar
    const hpBg = this.add.graphics();
    hpBg.fillStyle(INT.ink, 1);
    hpBg.fillRect(x + ox + 8, y + 26, 120, 10);

    const hpBar = this.add.graphics();
    hpBar.fillStyle(INT.red, 1);
    hpBar.fillRect(x + ox + 8, y + 26, 120, 10);
    hpBar.lineStyle(1, INT.ink, 0.8);
    hpBar.strokeRect(x + ox + 8, y + 26, 120, 10);

    const hpLabel = this.add.text(x + ox + 8, y + 40, 'HP', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.uiTextMuted,
    });

    const hpText = this.add.text(x + ox + 128, y + 38, `${data.currentHp || data.stats?.hp || 100}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.cream,
    }).setOrigin(1, 0);

    // MP bar (player only)
    if (isPlayer) {
      const mpBg = this.add.graphics();
      mpBg.fillStyle(INT.ink, 1);
      mpBg.fillRect(x + ox + 8, y + 50, 120, 7);

      const mpBar = this.add.graphics();
      mpBar.fillStyle(INT.steel, 1);
      mpBar.fillRect(x + ox + 8, y + 50, 120, 7);
      mpBar.lineStyle(1, INT.ink, 0.8);
      mpBar.strokeRect(x + ox + 8, y + 50, 120, 7);

      if (isPlayer) {
        this._playerHpBar = hpBar;
        this._playerHpText = hpText;
        this._playerMpBar = mpBar;
      }
    } else {
      this._enemyHpBar = hpBar;
      this._enemyHpText = hpText;
    }
  }

  _buildAbilityBar() {
    const barY = GAME_HEIGHT - 55;
    const abilities = this.playerData.abilities || ['crystal_bolt', 'fire_ward', 'ancient_scroll', 'temporal_shift'];

    abilities.forEach((abilityId, i) => {
      const abilityData = ABILITIES?.[abilityId];
      const x = GAME_WIDTH / 2 - (abilities.length * 54) / 2 + i * 54 + 27;
      const btn = this._buildAbilityBtn(x, barY, i, abilityData);
      this._abilityBtns.push(btn);
    });

    this._selectAbility(0);
  }

  _buildAbilityBtn(x, y, index, abilityData) {
    const S = 48;
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(INT.inkMid, 0.9);
    bg.fillRoundedRect(-S / 2, -S / 2, S, S, 5);
    bg.lineStyle(1.5, INT.uiBorder || 0x3A2F28, 1);
    bg.strokeRoundedRect(-S / 2, -S / 2, S, S, 5);
    container.add(bg);

    // Ability icon (colored diamond)
    const colors = [INT.crystal, INT.red, INT.gold, INT.magic || 0xA060D0];
    const icon = this.add.graphics();
    icon.fillStyle(colors[index % colors.length], 0.85);
    icon.beginPath();
    icon.moveTo(0, -14);
    icon.lineTo(10, 0);
    icon.lineTo(0, 14);
    icon.lineTo(-10, 0);
    icon.closePath();
    icon.fillPath();
    container.add(icon);

    // Hotkey number
    const key = this.add.text(-S / 2 + 4, -S / 2 + 3, `${index + 1}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.uiTextMuted,
    });
    container.add(key);

    // Ability name
    const name = this.add.text(0, S / 2 - 8, abilityData?.name || `Skill ${index + 1}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '7px',
      color: PALETTE.cream,
    }).setOrigin(0.5, 1);
    container.add(name);

    // Cooldown overlay
    const cooldownOverlay = this.add.graphics();
    container.add(cooldownOverlay);

    // Interactive
    container.setSize(S, S);
    container.setInteractive();
    container.on('pointerdown', () => {
      if (this.phase !== PHASES.PLAYER) return;
      this._selectAbility(index);
      this._executePlayerAbility(index);
      audioEngine.playSfx('menu_confirm');
    });
    container.on('pointerover', () => audioEngine.playSfx('menu_hover'));

    return { container, bg, cooldownOverlay, index };
  }

  _selectAbility(index) {
    this.selectedAbility = index;
    this._abilityBtns.forEach((btn, i) => {
      btn.bg.clear();
      const isSelected = i === index;
      btn.bg.fillStyle(isSelected ? INT.red : INT.inkMid, isSelected ? 0.9 : 0.9);
      btn.bg.fillRoundedRect(-24, -24, 48, 48, 5);
      btn.bg.lineStyle(1.5, isSelected ? INT.cream : (INT.uiBorder || 0x3A2F28), 1);
      btn.bg.strokeRoundedRect(-24, -24, 48, 48, 5);
    });
  }

  _buildCombatLog() {
    const logX = 12;
    const logY = 50;
    const logH = 80;

    const logBg = this.add.graphics();
    logBg.fillStyle(INT.ink, 0.75);
    logBg.fillRoundedRect(logX, logY, GAME_WIDTH - 24, logH, 5);
    logBg.lineStyle(1, INT.uiBorder || 0x3A2F28, 0.5);
    logBg.strokeRoundedRect(logX, logY, GAME_WIDTH - 24, logH, 5);

    // 4 log lines
    for (let i = 0; i < 4; i++) {
      const t = this.add.text(logX + 8, logY + 6 + i * 17, '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '9px',
        color: PALETTE.uiTextMuted,
        wordWrap: { width: GAME_WIDTH - 50 },
      });
      this._logTexts.push(t);
    }
  }

  _updateCombatLog(message, color = null) {
    this._combatLog.unshift({ msg: message, color: color || PALETTE.cream });
    if (this._combatLog.length > 4) this._combatLog.pop();

    this._logTexts.forEach((t, i) => {
      const entry = this._combatLog[i];
      if (entry) {
        t.setText(entry.msg);
        t.setColor(entry.color);
        t.setAlpha(1 - i * 0.2);
      } else {
        t.setText('');
      }
    });
  }

  _updateTurnLabel() {
    const labels = {
      [PHASES.PLAYER]: 'YOUR TURN',
      [PHASES.ENEMY]:  'ENEMY TURN',
      [PHASES.ANIMATING]: '...',
      [PHASES.VICTORY]: 'VICTORY!',
      [PHASES.DEFEAT]:  'DEFEATED...',
      [PHASES.INTRO]:   '',
    };
    if (this._turnLabel) {
      this._turnLabel.setText(labels[this.phase] || '');
    }
  }

  // ─── COMBAT LOGIC ────────────────────────────────────────────

  _startIntro() {
    this.phase = PHASES.INTRO;

    // Slide in from top
    this.cameras.main.setAlpha(0);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        const enemyName = this.enemyData.name || 'Enemy';
        this._updateCombatLog(`A wild ${enemyName} appears!`, PALETTE.red);
        setTimeout(() => {
          this.phase = PHASES.PLAYER;
          this._updateTurnLabel();
          this._updateCombatLog('Choose your action...', PALETTE.gold);
        }, 1200);
      },
    });
  }

  _initInput() {
    // Number keys 1-4 for abilities
    for (let i = 1; i <= 4; i++) {
      this.input.keyboard.on(`keydown-${i}`, () => {
        if (this.phase !== PHASES.PLAYER) return;
        this._selectAbility(i - 1);
        audioEngine.playSfx('menu_hover');
      });
    }

    this.input.keyboard.on('keydown-ENTER', () => {
      if (this.phase === PHASES.PLAYER) {
        this._executePlayerAbility(this.selectedAbility);
      }
    });

    this.input.keyboard.on('keydown-ESC', () => {
      if (this.phase === PHASES.PLAYER) this._flee();
    });
  }

  _pollKeyboardInput() {
    // Handled via events above
  }

  _executePlayerAbility(abilityIndex) {
    if (this.phase !== PHASES.PLAYER) return;
    this.phase = PHASES.ANIMATING;
    this._updateTurnLabel();

    const abilities = this.playerData.abilities || ['crystal_bolt', 'fire_ward', 'ancient_scroll', 'temporal_shift'];
    const abilityId = abilities[abilityIndex];
    const abilityData = ABILITIES?.[abilityId] || { name: `Skill ${abilityIndex + 1}`, damage: 20, mpCost: 10 };

    audioEngine.playSfx('ability_cast');

    // Attack animation on player sprite
    this.tweens.add({
      targets: this._playerSprite,
      x: this._playerSprite.x + 30,
      duration: 150,
      yoyo: true,
      ease: 'Power2',
      onComplete: () => {
        audioEngine.playSfx('attack_hit');

        // Compute damage
        const baseDmg = abilityData.damage || 20;
        const atk = this.playerData.stats?.attack || 50;
        const def = this.enemyData.stats?.defense || 20;
        const isCrit = Math.random() < 0.15;
        let damage = Math.max(1, Math.round(baseDmg + (atk - def) * 0.5 + Math.random() * 10));
        if (isCrit) {
          damage = Math.round(damage * 1.5);
          audioEngine.playSfx('attack_crit');
        }

        // Apply to enemy
        this.enemyData.currentHp = (this.enemyData.currentHp ?? this.enemyData.stats?.hp ?? 100) - damage;

        // Hit flash
        this._flashSprite(this._enemySprite);

        // Floating damage number
        this._spawnFloatingNumber(
          this._enemySprite.x,
          this._enemySprite.y - 30,
          `-${damage}`,
          isCrit ? PALETTE.gold : PALETTE.red
        );

        this._updateEnemyBar();
        this._updateCombatLog(
          `${this.playerData.name || 'Hero'} used ${abilityData.name}! -${damage} HP${isCrit ? ' CRITICAL!' : ''}`,
          isCrit ? PALETTE.gold : PALETTE.cream
        );

        // Check enemy defeat
        if (this.enemyData.currentHp <= 0) {
          this.enemyData.currentHp = 0;
          this._updateEnemyBar();
          setTimeout(() => this._triggerVictory(), 600);
          return;
        }

        // Enemy turn after short delay
        setTimeout(() => {
          this.phase = PHASES.ENEMY;
          this._updateTurnLabel();
          setTimeout(() => this._executeEnemyTurn(), 800);
        }, 400);
      },
    });
  }

  _executeEnemyTurn() {
    this.phase = PHASES.ANIMATING;

    audioEngine.playSfx('attack_swing');

    // Enemy lunge animation
    this.tweens.add({
      targets: this._enemySprite,
      x: this._enemySprite.x - 25,
      duration: 150,
      yoyo: true,
      ease: 'Power2',
      onComplete: () => {
        audioEngine.playSfx('player_hurt');

        const atk = this.enemyData.stats?.attack || 30;
        const def = this.playerData.stats?.defense || 20;
        const isDodge = Math.random() < (this.playerData.stats?.dodge || 0.1);

        if (isDodge) {
          audioEngine.playSfx('player_dodge');
          this._spawnFloatingNumber(this._playerSprite.x, this._playerSprite.y - 30, 'DODGE!', PALETTE.gold);
          this._updateCombatLog(`${this.playerData.name || 'Hero'} dodged the attack!`, PALETTE.gold);
        } else {
          const damage = Math.max(1, Math.round(atk - def * 0.4 + Math.random() * 8));
          this.playerData.currentHp = (this.playerData.currentHp ?? this.playerData.stats?.hp ?? 100) - damage;

          this._flashSprite(this._playerSprite);
          this._spawnFloatingNumber(this._playerSprite.x, this._playerSprite.y - 30, `-${damage}`, PALETTE.red);
          this._updatePlayerBars();
          this._updateCombatLog(`${this.enemyData.name || 'Enemy'} attacks! -${damage} HP`, PALETTE.red);

          // Camera shake
          this.cameras.main.shake(120, 0.005);

          if (this.playerData.currentHp <= 0) {
            this.playerData.currentHp = 0;
            this._updatePlayerBars();
            setTimeout(() => this._triggerDefeat(), 600);
            return;
          }
        }

        setTimeout(() => {
          this.phase = PHASES.PLAYER;
          this._updateTurnLabel();
          this._updateCombatLog('Your turn! Choose an ability.', PALETTE.gold);
          this.turnCount++;
        }, 400);
      },
    });
  }

  _flee() {
    const success = Math.random() < 0.6;
    if (success) {
      this._updateCombatLog('You fled from battle!', PALETTE.gold);
      audioEngine.playSfx('menu_cancel');
      setTimeout(() => this._exitCombat(false), 800);
    } else {
      this._updateCombatLog("Can't escape!", PALETTE.red);
      audioEngine.playSfx('player_hurt');
      this.phase = PHASES.ENEMY;
      this._updateTurnLabel();
      setTimeout(() => this._executeEnemyTurn(), 600);
    }
  }

  _triggerVictory() {
    this.phase = PHASES.VICTORY;
    this._updateTurnLabel();
    audioEngine.stopMusic(0.5);
    audioEngine.playMusic('victory');

    // Enemy death animation
    this.tweens.add({
      targets: this._enemySprite,
      alpha: 0,
      y: this._enemySprite.y + 20,
      duration: 500,
      ease: 'Power2',
    });

    // Victory overlay
    this._showResultOverlay(true);
    this._updateCombatLog(`${this.enemyData.name || 'Enemy'} defeated!`, PALETTE.gold);
  }

  _triggerDefeat() {
    this.phase = PHASES.DEFEAT;
    this._updateTurnLabel();
    audioEngine.stopMusic(0.5);
    audioEngine.playMusic('gameover');

    this.tweens.add({
      targets: this._playerSprite,
      alpha: 0,
      y: this._playerSprite.y + 20,
      duration: 600,
    });

    this._showResultOverlay(false);
    this._updateCombatLog('You have been defeated...', PALETTE.red);
  }

  _showResultOverlay(victory) {
    const overlay = this.add.graphics();
    overlay.fillStyle(INT.ink, 0);
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.tweens.add({
      targets: overlay,
      alpha: 0.6,
      duration: 600,
    });

    const color = victory ? PALETTE.gold : PALETTE.red;
    const msg   = victory ? 'VICTORY' : 'DEFEATED';
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, msg, {
      fontFamily: '"Courier New", monospace',
      fontSize: '36px',
      fontStyle: 'bold',
      color,
      stroke: PALETTE.ink,
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 4, color: victory ? PALETTE.gold : PALETTE.red, blur: 16, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, duration: 400, ease: 'Power2' });

    if (victory) {
      // XP reward
      const xpGain = Math.round((this.enemyData.xpReward || 50) * (1 + this.turnCount * 0.05));
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10, `+${xpGain} XP`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '18px',
        color: PALETTE.gold,
      }).setOrigin(0.5).setAlpha(0);
      audioEngine.playSfx('pickup_xp');
    }

    // Continue button
    const contBtn = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'TAP TO CONTINUE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px',
      color: PALETTE.cream,
      letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: contBtn,
      alpha: 1,
      duration: 400,
      delay: 1000,
      onComplete: () => {
        this.input.once('pointerdown', () => this._exitCombat(victory), this);
        this.input.keyboard.once('keydown-ENTER', () => this._exitCombat(victory), this);
      },
    });

    this.tweens.add({
      targets: contBtn,
      alpha: 0.5,
      duration: 800,
      yoyo: true,
      repeat: -1,
      delay: 1200,
      ease: 'Sine.easeInOut',
    });
  }

  _exitCombat(victory) {
    audioEngine.stopMusic(1);
    this.time.delayedCall(300, () => {
      this.scene.stop();
      const worldScene = this.scene.get(this.returnScene);
      if (worldScene) {
        worldScene.scene.resume();
        worldScene.events.emit('combatEnd', { victory, playerData: this.playerData });
      }
    });
  }

  // ─── VISUAL HELPERS ───────────────────────────────────────────

  _flashSprite(spr) {
    if (!spr) return;
    this.tweens.add({
      targets: spr,
      alpha: 0.2,
      duration: 60,
      yoyo: true,
      repeat: 2,
    });
  }

  _spawnFloatingNumber(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      fontStyle: 'bold',
      color,
      stroke: PALETTE.ink,
      strokeThickness: 3,
    }).setOrigin(0.5);

    this._floatingNums.push({ obj: t, vy: -1.2, life: 1000, elapsed: 0 });
  }

  _updateFloatingNums(delta) {
    this._floatingNums = this._floatingNums.filter(f => {
      f.elapsed += delta;
      f.obj.y += f.vy;
      f.obj.setAlpha(1 - f.elapsed / f.life);
      if (f.elapsed >= f.life) {
        f.obj.destroy();
        return false;
      }
      return true;
    });
  }

  _updateCombatantAnimations(time) {
    // Already handled by tweens
  }

  _updateEnemyBar() {
    if (!this._enemyHpBar) return;
    const maxHp = this.enemyData.stats?.hp || 100;
    const cur   = Math.max(0, this.enemyData.currentHp ?? maxHp);
    const pct   = cur / maxHp;
    this._enemyHpBar.clear();
    this._enemyHpBar.fillStyle(INT.red, 1);
    // Re-draw (approximate position — matches _buildStatPanel)
    this._enemyHpBar.fillRect(GAME_WIDTH - 12 - 140 + 8, GAME_HEIGHT - 70 - 8 + 26, Math.round(120 * pct), 10);
    this._enemyHpBar.lineStyle(1, INT.ink, 0.8);
    this._enemyHpBar.strokeRect(GAME_WIDTH - 12 - 140 + 8, GAME_HEIGHT - 70 - 8 + 26, 120, 10);
    if (this._enemyHpText) this._enemyHpText.setText(`${Math.max(0, cur)}`);
  }

  _updatePlayerBars() {
    if (!this._playerHpBar) return;
    const maxHp = this.playerData.stats?.maxHp || this.playerData.stats?.hp || 100;
    const cur   = Math.max(0, this.playerData.currentHp ?? maxHp);
    const pct   = cur / maxHp;
    this._playerHpBar.clear();
    this._playerHpBar.fillStyle(INT.red, 1);
    this._playerHpBar.fillRect(12 + 8, GAME_HEIGHT - 70 - 8 + 26, Math.round(120 * pct), 10);
    this._playerHpBar.lineStyle(1, INT.ink, 0.8);
    this._playerHpBar.strokeRect(12 + 8, GAME_HEIGHT - 70 - 8 + 26, 120, 10);
    if (this._playerHpText) this._playerHpText.setText(`${Math.max(0, cur)}`);
  }
}
