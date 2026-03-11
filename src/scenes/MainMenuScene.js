// ============================================================
// POSEIDON — MAIN MENU SCENE
// Character select + title screen — Steelpine visual style.
// ============================================================

import Phaser from 'phaser';
import { TextureFactory }  from '../graphics/TextureFactory.js';
import { audioEngine }     from '../audio/AudioEngine.js';
import { INT, PALETTE }    from '../data/Palette.js';
import { CHARACTERS }      from '../data/GameData.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../GameConfig.js';

const CHAR_IDS = ['vormund', 'watcher', 'bolt', 'pointe'];

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
    this._selectedChar = 0;
    this._charCards = [];
    this._particles = [];
  }

  // ─── LIFECYCLE ───────────────────────────────────────────────

  create() {
    // Generate procedural textures
    const tf = new TextureFactory(this);
    tf.generateAll();

    // Init audio
    audioEngine.init();
    audioEngine.playMusic('menu');

    this._buildBackground();
    this._buildTitle();
    this._buildCharacterSelect();
    this._buildStartButton();
    this._buildParticles();
    this._buildVersionTag();

    // Input: keyboard arrows + enter
    this._cursors = this.input.keyboard.createCursorKeys();
    this._enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Mobile tap to start
    this.input.once('pointerdown', () => this._handleStart(), this);
  }

  update(time, delta) {
    this._animateParticles(delta);
    this._animateTitle(time);

    // Arrow key navigation
    if (Phaser.Input.Keyboard.JustDown(this._cursors.left)) {
      this._selectChar((this._selectedChar - 1 + CHAR_IDS.length) % CHAR_IDS.length);
      audioEngine.playSfx('menu_hover');
    }
    if (Phaser.Input.Keyboard.JustDown(this._cursors.right)) {
      this._selectChar((this._selectedChar + 1) % CHAR_IDS.length);
      audioEngine.playSfx('menu_hover');
    }
    if (Phaser.Input.Keyboard.JustDown(this._enterKey) ||
        Phaser.Input.Keyboard.JustDown(this._spaceKey)) {
      this._handleStart();
    }
  }

  // ─── BACKGROUND ──────────────────────────────────────────────

  _buildBackground() {
    // Deep dark gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0D0A08, 0x0D0A08, 0x1A1208, 0x1A1208, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Steelpine forest silhouette — layered geometry
    this._drawForestSilhouette(bg);

    // Atmospheric fog bands
    for (let i = 0; i < 5; i++) {
      const fogG = this.add.graphics();
      fogG.fillStyle(0x2A3A1A, 0.04 + i * 0.015);
      fogG.fillRect(0, GAME_HEIGHT * 0.35 + i * 40, GAME_WIDTH, 60);
    }

    // Stars / particles (generated as dots)
    for (let i = 0; i < 60; i++) {
      const star = this.add.graphics();
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * GAME_HEIGHT * 0.5;
      const r = Math.random() * 1.5 + 0.5;
      star.fillStyle(0xEDE4D3, 0.3 + Math.random() * 0.4);
      star.fillCircle(x, y, r);
      this._particles.push({ obj: star, type: 'star', baseAlpha: 0.3 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 });
    }

    // Moon / large celestial body
    const moon = this.add.graphics();
    moon.fillStyle(0xEDE4D3, 0.12);
    moon.fillCircle(GAME_WIDTH * 0.8, GAME_HEIGHT * 0.12, 50);
    moon.fillStyle(0xD4C5A9, 0.06);
    moon.fillCircle(GAME_WIDTH * 0.8, GAME_HEIGHT * 0.12, 65);
  }

  _drawForestSilhouette(g) {
    // Back layer — dark treeline
    g.fillStyle(0x1A2A0A, 1);
    const points1 = this._generateTreeline(GAME_WIDTH, GAME_HEIGHT * 0.55, 0.18, 12);
    g.beginPath();
    g.moveTo(0, GAME_HEIGHT);
    g.lineTo(0, points1[0]);
    points1.forEach((y, i) => g.lineTo(i * (GAME_WIDTH / (points1.length - 1)), y));
    g.lineTo(GAME_WIDTH, GAME_HEIGHT);
    g.closePath();
    g.fillPath();

    // Mid layer — slightly lighter
    g.fillStyle(0x0D1A08, 1);
    const points2 = this._generateTreeline(GAME_WIDTH, GAME_HEIGHT * 0.68, 0.12, 8);
    g.beginPath();
    g.moveTo(0, GAME_HEIGHT);
    g.lineTo(0, points2[0]);
    points2.forEach((y, i) => g.lineTo(i * (GAME_WIDTH / (points2.length - 1)), y));
    g.lineTo(GAME_WIDTH, GAME_HEIGHT);
    g.closePath();
    g.fillPath();

    // Ground
    g.fillStyle(0x0A0F06, 1);
    g.fillRect(0, GAME_HEIGHT * 0.75, GAME_WIDTH, GAME_HEIGHT * 0.25);
  }

  _generateTreeline(width, baseY, variance, segments) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = baseY - Math.abs(Math.sin(t * Math.PI * 2.5 + 1)) * GAME_HEIGHT * variance;
      pts.push(y);
    }
    return pts;
  }

  // ─── TITLE ───────────────────────────────────────────────────

  _buildTitle() {
    // Glow ring behind title
    const glow = this.add.graphics();
    glow.fillStyle(INT.red, 0.04);
    glow.fillEllipse(GAME_WIDTH / 2, 140, 320, 80);

    // Subtitle (universe name)
    this.add.text(GAME_WIDTH / 2, 85, 'STEELPINE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: PALETTE.gold,
      letterSpacing: 8,
      alpha: 0.9,
    }).setOrigin(0.5);

    // Main title
    this._titleText = this.add.text(GAME_WIDTH / 2, 118, 'POSEIDON', {
      fontFamily: '"Courier New", monospace',
      fontSize: '48px',
      fontStyle: 'bold',
      color: PALETTE.cream,
      stroke: PALETTE.ink,
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 4, color: PALETTE.red, blur: 12, fill: true },
    }).setOrigin(0.5);

    // Tagline
    this.add.text(GAME_WIDTH / 2, 162, 'Rise of the Steel Tribes', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: PALETTE.beige,
      letterSpacing: 2,
      alpha: 0.75,
    }).setOrigin(0.5);

    // Decorative line under title
    const line = this.add.graphics();
    line.lineStyle(1, INT.red, 0.6);
    line.beginPath();
    line.moveTo(GAME_WIDTH / 2 - 90, 178);
    line.lineTo(GAME_WIDTH / 2 + 90, 178);
    line.strokePath();
    // Diamond ornament
    line.fillStyle(INT.red, 0.8);
    line.fillRect(GAME_WIDTH / 2 - 4, 174, 8, 8);
  }

  // ─── CHARACTER SELECT ────────────────────────────────────────

  _buildCharacterSelect() {
    // Section header
    this.add.text(GAME_WIDTH / 2, 200, 'SELECT YOUR CHAMPION', {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px',
      color: PALETTE.uiTextMuted,
      letterSpacing: 3,
    }).setOrigin(0.5);

    // 4 character cards arranged horizontally
    const cardW = 72, cardH = 100;
    const startX = (GAME_WIDTH - CHAR_IDS.length * (cardW + 8)) / 2 + cardW / 2;

    CHAR_IDS.forEach((charId, i) => {
      const charData = CHARACTERS[charId];
      if (!charData) return;
      const x = startX + i * (cardW + 8);
      const y = 270;

      const card = this._buildCharCard(x, y, cardW, cardH, charId, charData, i);
      this._charCards.push(card);
    });

    // Character info panel (below cards)
    this._infoPanel = this._buildInfoPanel();

    this._selectChar(0);
  }

  _buildCharCard(x, y, w, h, charId, charData, index) {
    const container = this.add.container(x, y);

    // Card background
    const bg = this.add.graphics();
    bg.fillStyle(INT.inkMid, 0.9);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1.5, INT.uiBorder || 0x3A2F28, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    container.add(bg);

    // Character sprite (procedural)
    const sprKey = `char_${charId}_idle`;
    if (this.textures.exists(sprKey)) {
      const spr = this.add.image(0, -8, sprKey);
      spr.setScale(1.2);
      spr.setOrigin(0.5, 0.5);
      container.add(spr);

      // Simple idle bob animation
      this.tweens.add({
        targets: spr,
        y: -8 - 3,
        duration: 1200 + index * 100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      // Fallback: colored rectangle
      const palColors = [INT.steel, INT.steelMid, INT.green, INT.red];
      const rect = this.add.graphics();
      rect.fillStyle(palColors[index % palColors.length], 1);
      rect.fillRoundedRect(-14, -24, 28, 36, 3);
      container.add(rect);
    }

    // Character name
    const nameText = this.add.text(0, h / 2 - 22, charData.name.toUpperCase(), {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.cream,
      fontStyle: 'bold',
      letterSpacing: 1,
    }).setOrigin(0.5);
    container.add(nameText);

    // Archetype label
    const typeText = this.add.text(0, h / 2 - 10, charData.archetype, {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.uiTextMuted,
    }).setOrigin(0.5);
    container.add(typeText);

    // Selection highlight (initially hidden)
    const sel = this.add.graphics();
    sel.lineStyle(2.5, INT.red, 1);
    sel.strokeRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 7);
    sel.setAlpha(0);
    container.add(sel);

    // Touch / click interaction
    container.setSize(w, h);
    container.setInteractive();
    container.on('pointerover', () => {
      this._selectChar(index);
      audioEngine.playSfx('menu_hover');
    });
    container.on('pointerdown', () => {
      this._selectChar(index);
      audioEngine.playSfx('menu_confirm');
      this._handleStart();
    });

    return { container, bg, sel, charId };
  }

  _buildInfoPanel() {
    const panelY = 330;
    const container = this.add.container(GAME_WIDTH / 2, panelY);

    const bg = this.add.graphics();
    bg.fillStyle(INT.inkMid, 0.8);
    bg.fillRoundedRect(-GAME_WIDTH / 2 + 16, -2, GAME_WIDTH - 32, 110, 6);
    bg.lineStyle(1, INT.uiBorder || 0x3A2F28, 0.7);
    bg.strokeRoundedRect(-GAME_WIDTH / 2 + 16, -2, GAME_WIDTH - 32, 110, 5);
    container.add(bg);

    this._charName = this.add.text(-GAME_WIDTH / 2 + 28, 8, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: PALETTE.cream,
    });
    container.add(this._charName);

    this._charTitle = this.add.text(-GAME_WIDTH / 2 + 28, 26, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      color: PALETTE.gold,
    });
    container.add(this._charTitle);

    this._charLore = this.add.text(-GAME_WIDTH / 2 + 28, 44, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.uiTextMuted,
      wordWrap: { width: GAME_WIDTH - 70 },
      lineSpacing: 2,
    });
    container.add(this._charLore);

    // Stat bars
    this._statBars = {};
    const stats = ['hp', 'mp', 'attack', 'defense'];
    const statColors = [INT.red, INT.steel, INT.gold, INT.green];
    stats.forEach((stat, i) => {
      const bx = -GAME_WIDTH / 2 + 28 + i * 80;
      const by = 88;
      const label = this.add.text(bx, by, stat.toUpperCase(), {
        fontFamily: '"Courier New", monospace',
        fontSize: '7px',
        color: PALETTE.uiTextMuted,
      });
      container.add(label);

      const barBg = this.add.graphics();
      barBg.fillStyle(INT.ink, 0.8);
      barBg.fillRect(bx, by + 9, 68, 5);
      container.add(barBg);

      const bar = this.add.graphics();
      container.add(bar);
      this._statBars[stat] = { bar, bx, by: by + 9, color: statColors[i] };
    });

    return container;
  }

  _selectChar(index) {
    this._selectedChar = index;

    // Update card highlights
    this._charCards.forEach((card, i) => {
      card.sel.setAlpha(i === index ? 1 : 0);
      card.container.setScale(i === index ? 1.05 : 1);
    });

    // Update info panel
    const charId = CHAR_IDS[index];
    const charData = CHARACTERS[charId];
    if (!charData) return;

    this._charName.setText(charData.name);
    this._charTitle.setText(charData.title);
    this._charLore.setText(charData.lore.substring(0, 120) + '...');

    // Stat bars
    const maxValues = { hp: 200, mp: 150, attack: 100, defense: 80 };
    Object.entries(this._statBars).forEach(([stat, bar]) => {
      const val = charData.stats[stat] ?? 0;
      const max = maxValues[stat] ?? 100;
      const pct = Math.min(val / max, 1);
      bar.bar.clear();
      bar.bar.fillStyle(bar.color, 1);
      bar.bar.fillRect(bar.bx, bar.by, Math.floor(68 * pct), 5);
    });
  }

  // ─── START BUTTON ─────────────────────────────────────────────

  _buildStartButton() {
    const btnY = GAME_HEIGHT - 100;
    const btnW = 200, btnH = 44;

    // Button bg
    const btnG = this.add.graphics();
    btnG.fillStyle(INT.red, 1);
    btnG.fillRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);
    btnG.lineStyle(2, INT.cream, 0.6);
    btnG.strokeRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, 8);

    const btnText = this.add.text(GAME_WIDTH / 2, btnY, 'BEGIN JOURNEY', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      fontStyle: 'bold',
      color: PALETTE.cream,
      letterSpacing: 2,
    }).setOrigin(0.5);

    // Pulse tween
    this.tweens.add({
      targets: [btnG, btnText],
      alpha: 0.75,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Hit zone
    const hitZone = this.add.zone(GAME_WIDTH / 2, btnY, btnW, btnH).setInteractive();
    hitZone.on('pointerdown', () => {
      audioEngine.playSfx('menu_confirm');
      this._handleStart();
    });
    hitZone.on('pointerover', () => {
      this.tweens.getTweensOf([btnG, btnText]).forEach(t => t.stop());
      btnG.setAlpha(1); btnText.setAlpha(1);
      audioEngine.playSfx('menu_hover');
    });
    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: [btnG, btnText], alpha: 0.75, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // Tap hint (mobile)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 45, 'TAP ANYWHERE TO CONTINUE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '9px',
      color: PALETTE.uiTextMuted,
      letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0.6);
  }

  // ─── PARTICLES ───────────────────────────────────────────────

  _buildParticles() {
    // Floating embers
    for (let i = 0; i < 20; i++) {
      const g = this.add.graphics();
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * GAME_HEIGHT;
      g.fillStyle(INT.red, 0.5);
      g.fillCircle(0, 0, 1.5);
      g.x = x; g.y = y;
      this._particles.push({
        obj: g, type: 'ember',
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.5 - 0.1,
        phase: Math.random() * Math.PI * 2,
        baseAlpha: 0.3 + Math.random() * 0.4,
      });
    }
  }

  _animateParticles(delta) {
    const dt = delta / 1000;
    this._particles.forEach(p => {
      if (p.type === 'star') {
        p.phase += dt * 0.8;
        p.obj.setAlpha(p.baseAlpha * (0.7 + 0.3 * Math.sin(p.phase)));
      } else if (p.type === 'ember') {
        p.obj.x += p.vx;
        p.obj.y += p.vy;
        p.phase += dt * 2;
        p.obj.setAlpha(p.baseAlpha * (0.5 + 0.5 * Math.sin(p.phase)));
        // Wrap around screen
        if (p.obj.y < -10) { p.obj.y = GAME_HEIGHT + 10; p.obj.x = Math.random() * GAME_WIDTH; }
        if (p.obj.x < -10) p.obj.x = GAME_WIDTH + 10;
        if (p.obj.x > GAME_WIDTH + 10) p.obj.x = -10;
      }
    });
  }

  _animateTitle(time) {
    if (this._titleText) {
      this._titleText.y = 118 + Math.sin(time / 1800) * 2;
    }
  }

  // ─── VERSION ─────────────────────────────────────────────────

  _buildVersionTag() {
    this.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 8, 'v0.1.0 — ALPHA', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: PALETTE.uiTextMuted,
    }).setOrigin(1, 1).setAlpha(0.4);
  }

  // ─── TRANSITION ──────────────────────────────────────────────

  _handleStart() {
    const charId = CHAR_IDS[this._selectedChar];
    const charData = CHARACTERS[charId];
    if (!charData) return;

    audioEngine.playSfx('portal');

    // Flash + fade out
    const flash = this.add.graphics();
    flash.fillStyle(0xFFFFFF, 0);
    flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.tweens.add({
      targets: flash,
      alpha: 1,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        audioEngine.stopMusic();
        this.scene.start('WorldScene', {
          characterId: charId,
          biomeId: charData.startBiome || 'forest',
        });
        this.scene.launch('UIScene');
      },
    });
  }
}
