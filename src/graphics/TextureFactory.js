// ============================================================
// POSEIDON — TEXTURE FACTORY
// Procedural Steelpine art-style graphic generation.
// All textures are drawn at runtime via Phaser Graphics/Canvas.
// ============================================================

import Phaser from 'phaser';
import { INT, PALETTE, BIOME_PALETTES } from '../data/Palette.js';
import { TILE_W, TILE_H, TILE_DEPTH } from '../GameConfig.js';

// ─── HELPERS ─────────────────────────────────────────────────────

/** Parse '#RRGGBB' → { r, g, b } */
function hexRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Darken a hex colour by a factor (0-1) */
function darken(hex, factor) {
  const { r, g, b } = hexRGB(hex);
  const d = 1 - factor;
  return (Math.round(r * d) << 16) | (Math.round(g * d) << 8) | Math.round(b * d);
}

/** Lighten a hex colour by a factor */
function lighten(hex, factor) {
  const { r, g, b } = hexRGB(hex);
  const f = factor;
  return (Math.clamp(Math.round(r + (255 - r) * f), 0, 255) << 16) |
         (Math.clamp(Math.round(g + (255 - g) * f), 0, 255) << 8) |
          Math.clamp(Math.round(b + (255 - b) * f), 0, 255);
}

/** Blend two hex colours (t = 0→a, 1→b) */
function blend(hexA, hexB, t) {
  const a = hexRGB(hexA), bb = hexRGB(hexB);
  return (Math.round(a.r + (bb.r - a.r) * t) << 16) |
         (Math.round(a.g + (bb.g - a.g) * t) << 8) |
          Math.round(a.b + (bb.b - a.b) * t);
}

// ─────────────────────────────────────────────────────────────────
export class TextureFactory {
  /**
   * @param {Phaser.Scene} scene  Scene that owns the textures
   */
  constructor(scene) {
    this.scene = scene;
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC — generate ALL game textures
  // ═══════════════════════════════════════════════════════════════

  generateAll() {
    this._generateTiles();
    this._generateCharacterSprites();
    this._generateEnemySprites();
    this._generateEffects();
    this._generateUI();
    this._generateEnvironment();
  }

  // ═══════════════════════════════════════════════════════════════
  // TILES
  // ═══════════════════════════════════════════════════════════════

  _generateTiles() {
    const biomes = ['forest', 'volcanic', 'cyber', 'ruins'];
    const heights = [0, 1, 2, 3];

    biomes.forEach(biome => {
      const pal = BIOME_PALETTES[biome];

      heights.forEach(h => {
        // Ground tile
        this._drawIsoTile(`tile_${biome}_${h}`, pal, h, false);
        // Ledge tile (highlighted edge)
        this._drawIsoTile(`tile_${biome}_${h}_ledge`, pal, h, true);
      });

      // Bridge tile (narrow plank crossing)
      this._drawBridgeTile(`tile_${biome}_bridge`, pal);

      // Void / void-edge tile
      this._drawVoidTile(`tile_${biome}_void`);
    });
  }

  /**
   * Draw a single isometric tile using Phaser Graphics, then save as texture.
   * The tile diamond is centred at (TILE_W/2, 0) within the canvas.
   */
  _drawIsoTile(key, pal, elevation, isLedge) {
    if (this.scene.textures.exists(key)) return;

    const W = TILE_W;
    const H = TILE_H;
    const D = TILE_DEPTH;
    const totalH = H + D * (elevation + 1) + 8;

    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // ── Top face (diamond) ───────────────────────────────────
    const topY = D * elevation;    // offset up for elevation
    const topColor = parseInt(pal.tileTop.replace('#', ''), 16);
    g.fillStyle(topColor, 1);
    g.beginPath();
    g.moveTo(W / 2, topY);           // top
    g.lineTo(W,     topY + H / 2);   // right
    g.lineTo(W / 2, topY + H);       // bottom
    g.lineTo(0,     topY + H / 2);   // left
    g.closePath();
    g.fillPath();

    // Subtle noise / grain on top face
    this._addTileGrain(g, W, H, topY, topColor);

    // Highlight edge (top-left diagonal)
    if (isLedge) {
      g.lineStyle(2, 0xFFFFCC, 0.5);
      g.beginPath();
      g.moveTo(W / 2, topY);
      g.lineTo(0, topY + H / 2);
      g.strokePath();
    }

    // ── Left face ────────────────────────────────────────────
    const leftColor = parseInt(pal.tileLeft.replace('#', ''), 16);
    g.fillStyle(leftColor, 1);
    g.beginPath();
    g.moveTo(0,     topY + H / 2);
    g.lineTo(W / 2, topY + H);
    g.lineTo(W / 2, topY + H + D);
    g.lineTo(0,     topY + H / 2 + D);
    g.closePath();
    g.fillPath();

    // ── Right face ───────────────────────────────────────────
    const rightColor = parseInt(pal.tileRight.replace('#', ''), 16);
    g.fillStyle(rightColor, 1);
    g.beginPath();
    g.moveTo(W / 2, topY + H);
    g.lineTo(W,     topY + H / 2);
    g.lineTo(W,     topY + H / 2 + D);
    g.lineTo(W / 2, topY + H + D);
    g.closePath();
    g.fillPath();

    // ── Outline (ink) ────────────────────────────────────────
    g.lineStyle(1.5, INT.ink, 0.9);
    // Top diamond
    g.beginPath();
    g.moveTo(W / 2, topY);
    g.lineTo(W,     topY + H / 2);
    g.lineTo(W / 2, topY + H);
    g.lineTo(0,     topY + H / 2);
    g.closePath();
    g.strokePath();
    // Side edges
    g.beginPath();
    g.moveTo(0,     topY + H / 2);
    g.lineTo(0,     topY + H / 2 + D);
    g.lineTo(W / 2, topY + H + D);
    g.lineTo(W,     topY + H / 2 + D);
    g.lineTo(W,     topY + H / 2);
    g.strokePath();
    g.beginPath();
    g.moveTo(W / 2, topY + H);
    g.lineTo(W / 2, topY + H + D);
    g.strokePath();

    g.generateTexture(key, W, totalH);
    g.destroy();
  }

  /** Adds subtle dithered grain to a tile top face */
  _addTileGrain(g, W, H, offsetY, baseColor) {
    const r = (baseColor >> 16) & 0xff;
    const gb = (baseColor >> 8) & 0xff;
    const b = baseColor & 0xff;
    // Lighter highlight dots in a cross pattern
    const hColor = ((Math.min(r + 30, 255)) << 16) | ((Math.min(gb + 30, 255)) << 8) | Math.min(b + 30, 255);
    g.fillStyle(hColor, 0.3);
    for (let i = 4; i < W - 4; i += 8) {
      for (let j = 2; j < H - 2; j += 6) {
        // only if inside diamond
        const rel = Math.abs(i - W / 2) / (W / 2) + Math.abs(j - H / 2) / (H / 2);
        if (rel < 1) {
          g.fillRect(i, offsetY + j, 1, 1);
        }
      }
    }
  }

  _drawBridgeTile(key, pal) {
    if (this.scene.textures.exists(key)) return;
    const W = TILE_W, H = TILE_H, D = TILE_DEPTH;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    const planks = parseInt(pal.tileTop.replace('#', ''), 16);
    const side = parseInt(pal.tileLeft.replace('#', ''), 16);

    // Narrow plank — only 40% height of normal tile
    const midY = H * 0.3;
    const botY = H * 0.7;

    g.fillStyle(planks, 1);
    g.beginPath();
    g.moveTo(W / 2, midY);
    g.lineTo(W,     midY + (botY - midY) / 2);
    g.lineTo(W / 2, botY);
    g.lineTo(0,     midY + (botY - midY) / 2);
    g.closePath();
    g.fillPath();

    g.fillStyle(side, 1);
    g.fillRect(0, midY + (botY - midY) / 2, W, D / 2);

    g.lineStyle(1.5, INT.ink, 1);
    g.strokeRect(0, midY, W, botY - midY + D / 2);

    g.generateTexture(key, W, H + D);
    g.destroy();
  }

  _drawVoidTile(key) {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(INT.inkMid, 0.2);
    g.beginPath();
    g.moveTo(TILE_W / 2, 0);
    g.lineTo(TILE_W,     TILE_H / 2);
    g.lineTo(TILE_W / 2, TILE_H);
    g.lineTo(0,          TILE_H / 2);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, INT.inkLight, 0.3);
    g.strokePath();
    g.generateTexture(key, TILE_W, TILE_H);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════════
  // CHARACTERS
  // ═══════════════════════════════════════════════════════════════

  _generateCharacterSprites() {
    const chars = ['vormund', 'watcher', 'bolt', 'pointe'];
    const palettes = {
      vormund: { body: INT.steel, cape: INT.red, trim: INT.green, accent: INT.gold },
      watcher: { body: INT.steelMid, cape: INT.green, trim: INT.gold, accent: INT.red },
      bolt:    { body: INT.green, cape: INT.red, trim: INT.gold, accent: INT.steel },
      pointe:  { body: INT.red, cape: INT.steelMid, trim: INT.green, accent: INT.gold },
    };

    chars.forEach(id => {
      const pal = palettes[id] || palettes.vormund;
      this._drawCharacterIdle(`char_${id}_idle`, pal);
      this._drawCharacterWalk(`char_${id}_walk`, pal);
      this._drawCharacterAttack(`char_${id}_attack`, pal);
      this._drawCharacterHurt(`char_${id}_hurt`, pal);
    });

    // Generic fallback
    this._drawCharacterIdle('char_idle', palettes.vormund);
  }

  _drawCharacterIdle(key, pal) {
    if (this.scene.textures.exists(key)) return;
    const W = 32, H = 48, frames = 4;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      const bob = f % 2 === 0 ? 0 : 1; // subtle bob
      this._drawHumanoidFigure(g, ox, bob, W, H, pal, false);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();

    this.scene.textures.get(key).add('idle', 0, 0, 0, W, H);
  }

  _drawCharacterWalk(key, pal) {
    if (this.scene.textures.exists(key)) return;
    const W = 32, H = 48, frames = 8;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    const legOffsets = [0, 3, 5, 3, 0, -3, -5, -3];

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      const legOff = legOffsets[f];
      this._drawHumanoidFigure(g, ox, 0, W, H, pal, false, legOff);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();
  }

  _drawCharacterAttack(key, pal) {
    if (this.scene.textures.exists(key)) return;
    const W = 40, H = 48, frames = 6;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      const armRaise = f < 3 ? f * 12 : (6 - f) * 12;
      this._drawHumanoidFigure(g, ox, 0, W, H, pal, true, 0, armRaise);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();
  }

  _drawCharacterHurt(key, pal) {
    if (this.scene.textures.exists(key)) return;
    const W = 32, H = 48, frames = 3;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      g.fillStyle(0xFF6060, 0.4);
      g.fillRect(ox, 0, W, H);
      this._drawHumanoidFigure(g, ox, f * 2, W, H, pal, false);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();
  }

  /**
   * Core humanoid figure — Steelpine bold illustration style.
   * Body proportions: head=8px, torso=16px, legs=16px, arms=12px.
   */
  _drawHumanoidFigure(g, ox, oy, W, H, pal, attacking = false, legOff = 0, armRaise = 0) {
    const cx = ox + W / 2;

    // ── Legs ───────────────────────────────────────────────
    g.fillStyle(pal.body, 1);
    g.fillRect(cx - 6, oy + 32 + Math.max(legOff, 0), 5, 14);   // left leg
    g.fillRect(cx + 1,  oy + 32 - Math.max(-legOff, 0), 5, 14); // right leg

    // ── Torso (cape/body) ──────────────────────────────────
    g.fillStyle(pal.cape, 1);
    g.fillRect(cx - 8, oy + 14, 16, 18);
    // Cape flap
    g.fillStyle(pal.cape, 0.8);
    g.beginPath();
    g.moveTo(cx - 8, oy + 20);
    g.lineTo(cx - 12, oy + 32);
    g.lineTo(cx - 4,  oy + 28);
    g.closePath();
    g.fillPath();

    // Belt / trim stripe
    g.fillStyle(pal.trim, 1);
    g.fillRect(cx - 8, oy + 28, 16, 3);

    // ── Arms ───────────────────────────────────────────────
    g.fillStyle(pal.body, 1);
    if (attacking) {
      // Right arm raised for attack
      g.fillRect(cx + 7, oy + 14 - armRaise / 2, 5, 10 + armRaise / 4);
      g.fillRect(cx - 12, oy + 18, 5, 10);
    } else {
      g.fillRect(cx + 7, oy + 16, 5, 12);
      g.fillRect(cx - 12, oy + 16, 5, 12);
    }

    // Shoulder pads (accent)
    g.fillStyle(pal.accent, 1);
    g.fillRect(cx - 10, oy + 13, 7, 5);
    g.fillRect(cx + 3,  oy + 13, 7, 5);

    // ── Head ───────────────────────────────────────────────
    g.fillStyle(pal.body, 1);
    g.fillCircle(cx, oy + 8, 7);

    // Eyes
    g.fillStyle(INT.cream, 1);
    g.fillRect(cx - 4, oy + 5, 3, 3);
    g.fillRect(cx + 1,  oy + 5, 3, 3);
    g.fillStyle(INT.ink, 1);
    g.fillRect(cx - 3, oy + 6, 2, 2);
    g.fillRect(cx + 2,  oy + 6, 2, 2);

    // Helmet/hat band
    g.fillStyle(pal.accent, 1);
    g.fillRect(cx - 7, oy + 2, 14, 4);

    // ── Ink outline pass ──────────────────────────────────
    g.lineStyle(1.2, INT.ink, 1);
    g.strokeCircle(cx, oy + 8, 7);
    g.strokeRect(cx - 8, oy + 14, 16, 18);
  }

  // ═══════════════════════════════════════════════════════════════
  // ENEMIES
  // ═══════════════════════════════════════════════════════════════

  _generateEnemySprites() {
    this._drawGolemSprite('enemy_golem_idle', INT.steelMid, INT.steelDark);
    this._drawGolemSprite('enemy_golem_walk', INT.steelMid, INT.steelDark);
    this._drawSpiderSprite('enemy_spider_idle', INT.brownDark || 0x3A2A1A, INT.red);
    this._drawSpiderSprite('enemy_spider_walk', INT.brownDark || 0x3A2A1A, INT.red);
    this._drawRobeSprite('enemy_mage_idle', INT.volcanic, INT.crystal);
    this._drawRobeSprite('enemy_mage_walk', INT.volcanic, INT.crystal);
    this._drawBossSprite('enemy_boss_idle', INT.red, INT.gold);
  }

  _drawGolemSprite(key, bodyColor, rimColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 36, H = 52, frames = 4;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      const cx = ox + W / 2;
      const bob = f % 2 === 0 ? 0 : 2;

      // ── Body: chunky rectangular torso ────────────────
      g.fillStyle(bodyColor, 1);
      g.fillRect(cx - 10, bob + 12, 20, 22);

      // ── Plating details ────────────────────────────────
      g.fillStyle(rimColor, 1);
      g.fillRect(cx - 10, bob + 12, 20, 3); // shoulder plate
      g.fillRect(cx - 10, bob + 28, 20, 3); // belt plate

      // ── Arms (thick) ───────────────────────────────────
      g.fillStyle(bodyColor, 1);
      g.fillRect(cx - 16, bob + 14, 6, 18);
      g.fillRect(cx + 10,  bob + 14, 6, 18);

      // ── Legs ───────────────────────────────────────────
      g.fillRect(cx - 9, bob + 34, 8, 16);
      g.fillRect(cx + 1,  bob + 34, 8, 16);

      // ── Head: square ───────────────────────────────────
      g.fillRect(cx - 8, bob + 1, 16, 12);
      // Eyes glow
      g.fillStyle(INT.lava || 0xE87840, 1);
      g.fillRect(cx - 6, bob + 5, 4, 3);
      g.fillRect(cx + 2,  bob + 5, 4, 3);

      // ── Ink outline ────────────────────────────────────
      g.lineStyle(1.5, INT.ink, 1);
      g.strokeRect(cx - 10, bob + 12, 20, 22);
      g.strokeRect(cx - 8,  bob + 1,  16, 12);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();
  }

  _drawSpiderSprite(key, bodyColor, legColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 40, H = 30, frames = 4;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      const cx = ox + W / 2;
      const cy = 15;
      const legBob = f % 2 === 0 ? -2 : 2;

      // ── Legs (8 legs, simplified to 6 visible) ────────
      g.lineStyle(2, legColor, 1);
      const legAngles = [-140, -110, -70, -40, 40, 70, 110, 140];
      legAngles.forEach((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const lx = cx + Math.cos(rad) * 16;
        const ly = cy + Math.sin(rad) * 10 + (i % 2 === 0 ? legBob : -legBob);
        g.beginPath();
        g.moveTo(cx + Math.cos(rad) * 7, cy + Math.sin(rad) * 5);
        g.lineTo(lx, ly);
        g.strokePath();
      });

      // ── Abdomen ────────────────────────────────────────
      g.fillStyle(bodyColor, 1);
      g.fillEllipse(cx + 6, cy, 14, 10);

      // ── Cephalothorax ──────────────────────────────────
      g.fillEllipse(cx - 4, cy, 12, 9);

      // ── Eyes ───────────────────────────────────────────
      g.fillStyle(INT.red, 1);
      g.fillCircle(cx - 8, cy - 1, 1.5);
      g.fillCircle(cx - 5, cy - 3, 1.5);
      g.fillCircle(cx - 2, cy - 1, 1.5);

      // ── Ink outline ────────────────────────────────────
      g.lineStyle(1, INT.ink, 1);
      g.strokeEllipse(cx - 4, cy, 12, 9);
      g.strokeEllipse(cx + 6, cy, 14, 10);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();
  }

  _drawRobeSprite(key, robeColor, glowColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 28, H = 48, frames = 4;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      const cx = ox + W / 2;
      const bob = f % 2 === 0 ? 0 : 1;

      // ── Robe body (triangular) ─────────────────────────
      g.fillStyle(robeColor, 1);
      g.beginPath();
      g.moveTo(cx - 6,  bob + 14);
      g.lineTo(cx + 6,  bob + 14);
      g.lineTo(cx + 10, bob + 42);
      g.lineTo(cx - 10, bob + 42);
      g.closePath();
      g.fillPath();

      // ── Staff glow orb ─────────────────────────────────
      g.fillStyle(glowColor, 0.8);
      g.fillCircle(cx + 10, bob + 10, 4);
      g.fillStyle(glowColor, 0.3);
      g.fillCircle(cx + 10, bob + 10, 7);

      // ── Staff line ─────────────────────────────────────
      g.lineStyle(2, INT.brown, 1);
      g.beginPath();
      g.moveTo(cx + 10, bob + 14);
      g.lineTo(cx + 10, bob + 36);
      g.strokePath();

      // ── Head (hooded) ──────────────────────────────────
      g.fillStyle(robeColor, 1);
      g.fillCircle(cx, bob + 8, 7);
      // Eye glow
      g.fillStyle(glowColor, 0.9);
      g.fillRect(cx - 4, bob + 6, 3, 2);
      g.fillRect(cx + 1,  bob + 6, 3, 2);

      g.lineStyle(1.2, INT.ink, 1);
      g.strokeCircle(cx, bob + 8, 7);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();
  }

  _drawBossSprite(key, primaryColor, accentColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 64, H = 80, frames = 4;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * W;
      const cx = ox + W / 2;
      const bob = f % 2 === 0 ? 0 : 3;

      // ── Massive body ───────────────────────────────────
      g.fillStyle(primaryColor, 1);
      g.fillRect(cx - 20, bob + 20, 40, 35);

      // ── Armour plates ──────────────────────────────────
      g.fillStyle(accentColor, 1);
      g.fillRect(cx - 20, bob + 20, 40, 5);
      g.fillRect(cx - 20, bob + 47, 40, 5);
      g.fillRect(cx - 2, bob + 25, 4, 20);

      // ── Huge arms ──────────────────────────────────────
      g.fillStyle(primaryColor, 1);
      g.fillRect(cx - 30, bob + 22, 10, 28);
      g.fillRect(cx + 20,  bob + 22, 10, 28);

      // ── Legs ───────────────────────────────────────────
      g.fillRect(cx - 17, bob + 55, 14, 22);
      g.fillRect(cx + 3,  bob + 55, 14, 22);

      // ── Horned head ────────────────────────────────────
      g.fillRect(cx - 14, bob + 3, 28, 18);
      // Horns
      g.fillStyle(accentColor, 1);
      g.beginPath();
      g.moveTo(cx - 14, bob + 3);
      g.lineTo(cx - 18, bob - 8);
      g.lineTo(cx - 8, bob + 3);
      g.closePath();
      g.fillPath();
      g.beginPath();
      g.moveTo(cx + 14, bob + 3);
      g.lineTo(cx + 18, bob - 8);
      g.lineTo(cx + 8, bob + 3);
      g.closePath();
      g.fillPath();

      // Eyes
      g.fillStyle(0xFF0000, 1);
      g.fillRect(cx - 9, bob + 8, 5, 4);
      g.fillRect(cx + 4,  bob + 8, 5, 4);

      // ── Outline ────────────────────────────────────────
      g.lineStyle(2, INT.ink, 1);
      g.strokeRect(cx - 20, bob + 20, 40, 35);
      g.strokeRect(cx - 14, bob + 3,  28, 18);
    }

    g.generateTexture(key, W * frames, H);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════

  _generateEffects() {
    this._drawHitEffect('fx_hit_normal', INT.cream, 24);
    this._drawHitEffect('fx_hit_fire',   INT.lava || 0xE87840, 28);
    this._drawHitEffect('fx_hit_magic',  INT.magic || 0xA060D0, 26);
    this._drawHitEffect('fx_hit_crit',   INT.gold, 32);

    this._drawProjectile('fx_bolt',    INT.crystal, 12, 4);
    this._drawProjectile('fx_arrow',   INT.brown, 14, 3);
    this._drawProjectile('fx_fireball',INT.lava || 0xE87840, 10, 8);

    this._drawExplosion('fx_explosion', INT.lava || 0xE87840);
    this._drawSparkle('fx_heal',   INT.green);
    this._drawSparkle('fx_xp',     INT.gold);
    this._drawSparkle('fx_portal', INT.crystal);

    this._drawShadowCircle('shadow');
  }

  _drawHitEffect(key, color, size) {
    if (this.scene.textures.exists(key)) return;
    const frames = 5;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * size * 2;
      const progress = f / (frames - 1);
      const r = size * progress;
      const alpha = 1 - progress;

      // Starburst
      g.fillStyle(color, alpha);
      g.fillCircle(ox + size, size, r);

      // Rays
      g.lineStyle(2, color, alpha * 0.8);
      for (let ray = 0; ray < 6; ray++) {
        const angle = (ray / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(ox + size + Math.cos(angle) * r * 0.5,
                 size       + Math.sin(angle) * r * 0.5);
        g.lineTo(ox + size + Math.cos(angle) * r * 1.4,
                 size       + Math.sin(angle) * r * 1.4);
        g.strokePath();
      }
    }

    g.generateTexture(key, size * 2 * frames, size * 2);
    g.destroy();
  }

  _drawProjectile(key, color, length, thickness) {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillRect(0, 0, length, thickness);
    // Glow
    g.fillStyle(color, 0.3);
    g.fillRect(-2, -1, length + 4, thickness + 2);
    g.generateTexture(key, length + 4, thickness + 4);
    g.destroy();
  }

  _drawExplosion(key, color) {
    if (this.scene.textures.exists(key)) return;
    const S = 48, frames = 8;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * S;
      const r = (S / 2) * (f / (frames - 1));
      const alpha = f < frames / 2 ? 1 : 1 - (f - frames / 2) / (frames / 2);

      g.fillStyle(color, alpha * 0.8);
      g.fillCircle(ox + S / 2, S / 2, r);
      g.fillStyle(0xFFFFFF, alpha * 0.4);
      g.fillCircle(ox + S / 2, S / 2, r * 0.5);
    }

    g.generateTexture(key, S * frames, S);
    g.destroy();
  }

  _drawSparkle(key, color) {
    if (this.scene.textures.exists(key)) return;
    const S = 20, frames = 6;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    for (let f = 0; f < frames; f++) {
      const ox = f * S;
      const scale = 0.5 + 0.5 * Math.sin((f / frames) * Math.PI);
      const alpha = Math.sin((f / frames) * Math.PI);

      // 4-point star
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(ox + S / 2, S / 2 - S * 0.45 * scale);
      g.lineTo(ox + S / 2 + S * 0.12 * scale, S / 2 - S * 0.12 * scale);
      g.lineTo(ox + S / 2 + S * 0.45 * scale, S / 2);
      g.lineTo(ox + S / 2 + S * 0.12 * scale, S / 2 + S * 0.12 * scale);
      g.lineTo(ox + S / 2,                      S / 2 + S * 0.45 * scale);
      g.lineTo(ox + S / 2 - S * 0.12 * scale,  S / 2 + S * 0.12 * scale);
      g.lineTo(ox + S / 2 - S * 0.45 * scale,  S / 2);
      g.lineTo(ox + S / 2 - S * 0.12 * scale,  S / 2 - S * 0.12 * scale);
      g.closePath();
      g.fillPath();
    }

    g.generateTexture(key, S * frames, S);
    g.destroy();
  }

  _drawShadowCircle(key) {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(16, 6, 28, 8);
    g.generateTexture(key, 32, 12);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════════
  // UI ELEMENTS
  // ═══════════════════════════════════════════════════════════════

  _generateUI() {
    this._drawPanel('ui_panel',         INT.inkMid, INT.uiBorder || 0x3A2F28, 200, 80);
    this._drawPanel('ui_panel_dark',    0x0D0A08, INT.uiBorder || 0x3A2F28, 200, 80);
    this._drawPanel('ui_dialog_bg',     INT.inkMid, INT.red, 300, 120);
    this._drawPanel('ui_tooltip',       0x0D0A08, INT.gold, 160, 60);

    this._drawBarTexture('ui_bar_health', INT.red);
    this._drawBarTexture('ui_bar_mana',   INT.steel);
    this._drawBarTexture('ui_bar_xp',     INT.gold);

    this._drawButton('ui_btn_normal', INT.steelMid, INT.steelDark);
    this._drawButton('ui_btn_hover',  INT.steel,    INT.steelMid);
    this._drawButton('ui_btn_press',  INT.steelDark, INT.ink);

    this._drawAbilitySlot('ui_ability_slot',        INT.inkMid);
    this._drawAbilitySlot('ui_ability_slot_active',  INT.gold);
    this._drawAbilitySlot('ui_ability_slot_cooldown', INT.steelDark);

    this._drawMiniMapBg('ui_minimap_bg');
    this._drawCursor('ui_cursor');
    this._drawCompassRose('ui_compass');
  }

  _drawPanel(key, bgColor, borderColor, W, H) {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Background
    g.fillStyle(bgColor, 0.92);
    g.fillRoundedRect(0, 0, W, H, 6);

    // Border
    g.lineStyle(2, borderColor, 1);
    g.strokeRoundedRect(1, 1, W - 2, H - 2, 5);

    // Corner ornaments
    const ornSize = 5;
    g.fillStyle(borderColor, 1);
    [[0, 0], [W - ornSize, 0], [0, H - ornSize], [W - ornSize, H - ornSize]].forEach(([x, y]) => {
      g.fillRect(x, y, ornSize, ornSize);
    });

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawBarTexture(key, color) {
    if (this.scene.textures.exists(key)) return;
    const W = 100, H = 10;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Fill gradient simulation
    g.fillStyle(color, 1);
    g.fillRect(0, 0, W, H);

    // Shine
    g.fillStyle(0xFFFFFF, 0.2);
    g.fillRect(0, 0, W, H / 3);

    // Edge highlight
    g.lineStyle(1, INT.ink, 0.8);
    g.strokeRect(0, 0, W, H);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawButton(key, fillColor, shadowColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 120, H = 36;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Shadow
    g.fillStyle(shadowColor, 1);
    g.fillRoundedRect(2, 3, W - 2, H - 2, 5);

    // Fill
    g.fillStyle(fillColor, 1);
    g.fillRoundedRect(0, 0, W - 2, H - 2, 5);

    // Top highlight
    g.fillStyle(0xFFFFFF, 0.15);
    g.fillRoundedRect(0, 0, W - 2, (H - 2) / 2, { tl: 5, tr: 5, bl: 0, br: 0 });

    // Border
    g.lineStyle(1.5, INT.ink, 0.9);
    g.strokeRoundedRect(0, 0, W - 2, H - 2, 5);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawAbilitySlot(key, bgColor) {
    if (this.scene.textures.exists(key)) return;
    const S = 48;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(bgColor, 1);
    g.fillRoundedRect(0, 0, S, S, 6);

    // Inner inset
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(2, 2, S - 4, S - 4, 4);

    g.lineStyle(1.5, INT.ink, 0.8);
    g.strokeRoundedRect(0, 0, S, S, 6);

    g.generateTexture(key, S, S);
    g.destroy();
  }

  _drawMiniMapBg(key) {
    if (this.scene.textures.exists(key)) return;
    const S = 90;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(INT.ink, 0.85);
    g.fillCircle(S / 2, S / 2, S / 2);

    g.lineStyle(2, INT.steelMid, 0.7);
    g.strokeCircle(S / 2, S / 2, S / 2 - 1);

    g.generateTexture(key, S, S);
    g.destroy();
  }

  _drawCursor(key) {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(INT.cream, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(12, 16);
    g.lineTo(5, 14);
    g.lineTo(8, 24);
    g.lineTo(4, 22);
    g.lineTo(1, 12);
    g.lineTo(0, 16);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, INT.ink, 1);
    g.strokePath();
    g.generateTexture(key, 28, 28);
    g.destroy();
  }

  _drawCompassRose(key) {
    if (this.scene.textures.exists(key)) return;
    const S = 32;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // N arrow (red)
    g.fillStyle(INT.red, 1);
    g.beginPath();
    g.moveTo(S / 2, 0);
    g.lineTo(S / 2 + 4, S / 2);
    g.lineTo(S / 2 - 4, S / 2);
    g.closePath();
    g.fillPath();

    // S arrow (cream)
    g.fillStyle(INT.cream, 1);
    g.beginPath();
    g.moveTo(S / 2, S);
    g.lineTo(S / 2 + 4, S / 2);
    g.lineTo(S / 2 - 4, S / 2);
    g.closePath();
    g.fillPath();

    g.lineStyle(1, INT.ink, 1);
    g.strokeCircle(S / 2, S / 2, 3);

    g.generateTexture(key, S, S);
    g.destroy();
  }

  // ═══════════════════════════════════════════════════════════════
  // ENVIRONMENT DECORATIONS
  // ═══════════════════════════════════════════════════════════════

  _generateEnvironment() {
    this._drawTree('deco_tree_pine',    INT.forest || 0x3A6A39, INT.bark || 0x5A4A3A);
    this._drawTree('deco_tree_dead',    INT.stoneDark || 0x5A5A4A, INT.brownDark || 0x3A2A1A);
    this._drawRock('deco_rock_small',   INT.stone || 0x8A8A7A, INT.stoneDark || 0x5A5A4A);
    this._drawRock('deco_rock_large',   INT.steelDark, INT.inkMid);
    this._drawCrystal('deco_crystal',   INT.crystal, INT.crystalGlow || 0xC0F0F8);
    this._drawRuins('deco_ruin_pillar', INT.stone || 0x8A8A7A, INT.stoneDark || 0x5A5A4A);
    this._drawLavaPool('deco_lava_pool',INT.lava || 0xE87840);
    this._drawPortalGlow('deco_portal', INT.portal || 0x60A8D0, INT.portalGlow || 0xA0D8F8);
  }

  _drawTree(key, leafColor, trunkColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 32, H = 56;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Trunk
    g.fillStyle(trunkColor, 1);
    g.fillRect(W / 2 - 3, H - 20, 6, 20);

    // Canopy layers (3 triangles)
    [0, 8, 16].forEach((offset, i) => {
      const scale = 1 - i * 0.12;
      g.fillStyle(leafColor, 1);
      g.beginPath();
      g.moveTo(W / 2, offset);
      g.lineTo(W / 2 + 12 * scale, offset + 16);
      g.lineTo(W / 2 - 12 * scale, offset + 16);
      g.closePath();
      g.fillPath();
    });

    // Outline
    g.lineStyle(1.2, INT.ink, 0.8);
    g.strokeRect(W / 2 - 3, H - 20, 6, 20);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawRock(key, topColor, sideColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 28, H = 22;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(sideColor, 1);
    g.fillEllipse(W / 2 + 2, H / 2 + 3, W - 4, H - 8);

    g.fillStyle(topColor, 1);
    g.fillEllipse(W / 2, H / 2, W - 4, H - 8);

    g.lineStyle(1.2, INT.ink, 0.9);
    g.strokeEllipse(W / 2, H / 2, W - 4, H - 8);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawCrystal(key, bodyColor, glowColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 20, H = 36;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Glow aura
    g.fillStyle(glowColor, 0.2);
    g.fillCircle(W / 2, H / 2, 14);

    // Crystal body (hexagonal prism front)
    g.fillStyle(bodyColor, 0.9);
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W,     H * 0.3);
    g.lineTo(W,     H * 0.7);
    g.lineTo(W / 2, H);
    g.lineTo(0,     H * 0.7);
    g.lineTo(0,     H * 0.3);
    g.closePath();
    g.fillPath();

    // Inner facet
    g.fillStyle(glowColor, 0.5);
    g.beginPath();
    g.moveTo(W / 2, 3);
    g.lineTo(W - 3, H * 0.3);
    g.lineTo(W / 2, H * 0.55);
    g.closePath();
    g.fillPath();

    g.lineStyle(1.5, INT.ink, 0.8);
    g.strokePath();

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawRuins(key, stoneColor, darkColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 18, H = 44;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Column sections (with cracks)
    const sections = 4;
    for (let s = 0; s < sections; s++) {
      const y = s * 10;
      const offset = (s % 2) * 2 - 1;
      g.fillStyle(stoneColor, 1);
      g.fillRect(2 + offset, y, 14, 9);
      // Crack detail
      g.lineStyle(1, darkColor, 0.6);
      g.beginPath();
      g.moveTo(4 + offset, y + 2);
      g.lineTo(8 + offset, y + 7);
      g.strokePath();
    }

    g.lineStyle(1.2, INT.ink, 0.9);
    g.strokeRect(2, 0, 14, H - 4);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawLavaPool(key, lavaColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 48, H = 20;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Dark base
    g.fillStyle(INT.ember || 0xE84020, 1);
    g.fillEllipse(W / 2, H / 2 + 2, W - 2, H - 4);

    // Lava centre
    g.fillStyle(lavaColor, 1);
    g.fillEllipse(W / 2, H / 2, W - 8, H - 8);

    // Bright highlight
    g.fillStyle(0xFFD060, 0.6);
    g.fillEllipse(W / 2 - 4, H / 2 - 2, 14, 6);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  _drawPortalGlow(key, portalColor, glowColor) {
    if (this.scene.textures.exists(key)) return;
    const W = 48, H = 64;
    const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

    // Outer glow rings
    [0.15, 0.25, 0.5].forEach((alpha, i) => {
      g.fillStyle(glowColor, alpha);
      g.fillEllipse(W / 2, H / 2, W - i * 4, H - i * 8);
    });

    // Portal oval
    g.fillStyle(portalColor, 0.85);
    g.fillEllipse(W / 2, H / 2, W - 12, H - 16);

    // Inner swirl (simplified)
    g.fillStyle(glowColor, 0.6);
    g.fillEllipse(W / 2, H / 2, W * 0.35, H * 0.35);

    // Frame
    g.lineStyle(2.5, portalColor, 1);
    g.strokeEllipse(W / 2, H / 2, W - 10, H - 14);

    g.generateTexture(key, W, H);
    g.destroy();
  }
}
