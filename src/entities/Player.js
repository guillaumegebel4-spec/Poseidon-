// ============================================================
// POSEIDON — PLAYER ENTITY
// Rise of the Steel Tribes
// Phaser 3 Container-based player with full combat, movement,
// leveling, ability management, and visual state system.
// ============================================================

import Phaser from 'phaser';
import { PALETTE, INT } from '../data/Palette.js';
import { ABILITIES } from '../data/GameData.js';

// XP required per level (level index = level - 1)
const XP_TABLE = [0, 100, 250, 450, 700, 1050, 1500, 2100, 2900, 4000];

export class Player extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x  World pixel X
   * @param {number} y  World pixel Y
   * @param {object} characterData  From CHARACTERS data definition
   */
  constructor(scene, x, y, characterData) {
    super(scene, x, y);
    scene.add.existing(this);

    // ── Core references ──────────────────────────────────────
    this.characterData = characterData;

    // ── Stats (copied from characterData, modified at runtime) ─
    this.stats = { ...characterData.stats };
    this.currentHp = this.stats.maxHp;
    this.currentMp = this.stats.maxMp;
    this.level      = 1;
    this.xp         = 0;
    this.xpToNext   = XP_TABLE[1];
    this.inventory  = [];

    // ── Ability slots (4 from characterData.abilities) ────────
    this.abilities     = characterData.abilities.slice(0, 4);
    this.cooldowns     = {};   // abilityId → remaining ms
    this.abilities.forEach(id => { this.cooldowns[id] = 0; });

    // ── Combat state ─────────────────────────────────────────
    this.isDead        = false;
    this.isInvulnerable= false;
    this.invulnTimer   = 0;
    this.isDodging     = false;
    this.dodgeTimer    = 0;
    this.dodgeDuration = 400; // ms
    this.dodgeCooldown = 0;
    this.dodgeCooldownMax = 800;
    this.attackCooldown= 0;
    this.attackCooldownMax = 350; // ms between basic attacks
    this.facingAngle   = 0;    // radians, 0 = right
    this.facingDx      = 1;
    this.facingDy      = 0;
    this.isAttacking   = false;
    this.attackTimer   = 0;
    this.buffs         = [];   // { id, duration, stat, multiplier }

    // ── Visual ────────────────────────────────────────────────
    this._flashTimer   = 0;
    this._flashColor   = 0xffffff;
    this._flashOn      = false;

    // Build visual components
    this._buildSprite();
  }

  // ────────────────────────────────────────────────────────────
  // SPRITE CONSTRUCTION
  // ────────────────────────────────────────────────────────────

  _buildSprite() {
    const pal = this.characterData.palette || {};

    // Shadow ellipse
    this.shadow = this.scene.add.ellipse(0, 14, 36, 14, 0x000000, 0.35);
    this.add(this.shadow);

    // Main body graphic (procedural if no texture)
    this.bodyGfx = this._buildBodyGraphic();
    this.add(this.bodyGfx);

    // HP bar background
    this.hpBarBg = this.scene.add.rectangle(0, -42, 36, 5, 0x1a1008, 0.9);
    this.hpBarBg.setOrigin(0.5, 0.5);
    this.add(this.hpBarBg);

    // HP bar fill
    this.hpBar = this.scene.add.rectangle(-18, -42, 36, 5, INT.uiHealth || 0xc4614a, 1);
    this.hpBar.setOrigin(0, 0.5);
    this.add(this.hpBar);

    // Player name label
    this.nameLabel = this.scene.add.text(0, -52, this.characterData.name, {
      fontFamily: 'serif',
      fontSize: '9px',
      color: PALETTE.uiText,
      stroke: PALETTE.ink,
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5);
    this.add(this.nameLabel);

    // Attack arc indicator (hidden normally)
    this.attackArc = this.scene.add.graphics();
    this.attackArc.setAlpha(0);
    this.add(this.attackArc);

    // Particle emitter for movement dust
    if (this.scene.add.particles) {
      const px = this.scene.add.particles(0, 0, '__DEFAULT', {
        lifespan: 280,
        speed: { min: 8, max: 22 },
        scale: { start: 0.18, end: 0 },
        alpha: { start: 0.45, end: 0 },
        tint: [0xd4c5a9, 0xc4614a],
        quantity: 1,
        frequency: -1,
        blendMode: 'NORMAL',
      });
      this.dustEmitter = px;
      this.add(px);
    }

    this._updateHpBar();
  }

  _buildBodyGraphic() {
    const g = this.scene.add.graphics();
    const pal = this.characterData.palette || {};
    const bodyCol = parseInt((pal.body || '#6B7FA3').replace('#', ''), 16);
    const accentCol = parseInt((pal.accent || '#C4614A').replace('#', ''), 16);
    const trimCol = parseInt((pal.trim || '#C8A850').replace('#', ''), 16);

    // Legs / base
    g.fillStyle(bodyCol, 1);
    g.fillRoundedRect(-10, 4, 20, 18, 3);

    // Torso
    g.fillStyle(bodyCol, 1);
    g.fillRoundedRect(-12, -12, 24, 20, 4);

    // Accent stripe
    g.fillStyle(accentCol, 1);
    g.fillRect(-12, -4, 24, 4);

    // Head
    g.fillStyle(bodyCol, 1);
    g.fillRoundedRect(-9, -30, 18, 20, 6);

    // Eyes
    g.fillStyle(0xffffff, 1);
    g.fillCircle(-3, -22, 3);
    g.fillCircle(5, -22, 3);
    g.fillStyle(trimCol, 1);
    g.fillCircle(-3, -22, 1.5);
    g.fillCircle(5, -22, 1.5);

    // Trim / shoulder pads
    g.fillStyle(trimCol, 1);
    g.fillRoundedRect(-16, -14, 8, 6, 2);
    g.fillRoundedRect(8, -14, 8, 6, 2);

    // Outline
    g.lineStyle(1.5, 0x1a1008, 1);
    g.strokeRoundedRect(-12, -30, 24, 52, 4);

    return g;
  }

  // ────────────────────────────────────────────────────────────
  // SETUP / INIT
  // ────────────────────────────────────────────────────────────

  setup(characterData) {
    this.characterData = characterData;
    this.stats         = { ...characterData.stats };
    this.currentHp     = this.stats.maxHp;
    this.currentMp     = this.stats.maxMp;
    this.abilities     = characterData.abilities.slice(0, 4);
    this.cooldowns     = {};
    this.abilities.forEach(id => { this.cooldowns[id] = 0; });
  }

  // ────────────────────────────────────────────────────────────
  // MOVEMENT
  // ────────────────────────────────────────────────────────────

  /**
   * Move the player by (dx, dy) scaled by speed. Returns new position.
   * @param {number} dx  Normalized direction X (-1 to 1)
   * @param {number} dy  Normalized direction Y (-1 to 1)
   * @param {number} speed  Pixels per second
   */
  move(dx, dy, speed) {
    if (this.isDead) return;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;
    const nx = dx / len;
    const ny = dy / len;
    this.x += nx * speed;
    this.y += ny * speed;
    this.updateFacingDirection(nx, ny);
    this._emitDust();
  }

  /**
   * Initiate a dodge roll in the given direction.
   * Grants 0.4s invulnerability and 200px dash.
   */
  dodge(dx, dy) {
    if (this.isDead || this.isDodging || this.dodgeCooldown > 0) return false;

    const len = Math.sqrt(dx * dx + dy * dy);
    const nx  = len > 0.01 ? dx / len : this.facingDx;
    const ny  = len > 0.01 ? dy / len : this.facingDy;

    this.isDodging    = true;
    this.dodgeTimer   = this.dodgeDuration;
    this.dodgeDir     = { x: nx, y: ny };
    this.dodgeTarget  = { x: this.x + nx * 200, y: this.y + ny * 200 };
    this.dodgeCooldown= this.dodgeCooldownMax;

    this.setInvulnerable(this.dodgeDuration);
    this.playAnim('dodge');
    this._flashEffect(0xffffff, this.dodgeDuration);
    return true;
  }

  stopMovement() {
    // Used when player input stops — trigger idle anim
    if (!this.isDodging && !this.isAttacking) {
      this.playAnim('idle');
    }
  }

  // ────────────────────────────────────────────────────────────
  // COMBAT ACTIONS
  // ────────────────────────────────────────────────────────────

  /**
   * Perform a basic melee attack toward (targetX, targetY).
   * Returns attack data for CombatScene to process hitbox checks.
   */
  basicAttack(targetX, targetY) {
    if (this.isDead || this.attackCooldown > 0) return null;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.updateFacingDirection(dx, dy);
    this.facingAngle = Math.atan2(dy, dx);

    this.isAttacking    = true;
    this.attackTimer    = 250;
    this.attackCooldown = this.attackCooldownMax;
    this.playAnim('attack');

    // Flash attack arc
    this._drawAttackArc(this.facingAngle);
    this.scene.time.delayedCall(150, () => {
      if (this.attackArc) this.attackArc.setAlpha(0);
      this.isAttacking = false;
    });

    const baseDmg = this.stats.attack;
    const isCrit  = Math.random() < 0.15;
    return {
      x: this.x,
      y: this.y,
      angle: this.facingAngle,
      range: 80,
      coneAngle: Phaser.Math.DegToRad(140),
      damage: isCrit ? Math.floor(baseDmg * 1.75) : baseDmg,
      isCrit,
      type: 'physical',
    };
  }

  /**
   * Activate one of the 4 ability slots.
   * Returns ability cast data or null if on cooldown / insufficient MP.
   */
  useAbility(abilityId) {
    if (this.isDead) return null;
    if (!this.isAbilityReady(abilityId)) return null;

    const abilityDef = ABILITIES[abilityId];
    if (!abilityDef) return null;
    if (this.currentMp < abilityDef.mpCost) return null;

    this.currentMp -= abilityDef.mpCost;
    this.startCooldown(abilityId);
    this.playAnim('cast');

    return {
      ...abilityDef,
      castX: this.x,
      castY: this.y,
      angle: this.facingAngle,
      caster: this,
    };
  }

  // ────────────────────────────────────────────────────────────
  // STATUS / DAMAGE / HEAL
  // ────────────────────────────────────────────────────────────

  /**
   * Apply damage to this player.
   * @param {number} amount  Raw damage amount
   * @param {string} type   'physical' | 'fire' | 'electric' | 'magic'
   * @returns {number} Actual damage dealt
   */
  takeDamage(amount, type = 'physical') {
    if (this.isDead || this.isInvulnerable) return 0;

    // Defense reduction
    let def = this.stats.defense;
    // Apply Iron Wall or Binary Shield buff
    const shieldBuff = this.buffs.find(b => b.id === 'shield');
    if (shieldBuff) {
      amount = Math.floor(amount * 0.3);
      if (shieldBuff.reflectDamage) {
        // Signal to combat scene: reflect
        this.scene.events.emit('player_reflect', amount * 0.5);
      }
    }

    const reduction = def / (def + 50); // soft cap formula
    const actual = Math.max(1, Math.floor(amount * (1 - reduction)));
    this.currentHp = Math.max(0, this.currentHp - actual);

    this._updateHpBar();
    this.playAnim('hurt');
    this._flashEffect(0xff2020, 180);

    // Brief invulnerability after hit (300ms)
    this.setInvulnerable(300);

    if (this.currentHp <= 0) {
      this.die();
    }

    return actual;
  }

  heal(amount) {
    if (this.isDead) return 0;
    const old = this.currentHp;
    this.currentHp = Math.min(this.stats.maxHp, this.currentHp + Math.floor(amount));
    this._updateHpBar();
    return this.currentHp - old;
  }

  restoreMp(amount) {
    this.currentMp = Math.min(this.stats.maxMp, this.currentMp + Math.floor(amount));
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.currentHp = 0;
    this._updateHpBar();
    this.playAnim('die');

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 1200,
      delay: 400,
      onComplete: () => {
        this.scene.events.emit('player_died');
      },
    });
  }

  // ────────────────────────────────────────────────────────────
  // LEVELING
  // ────────────────────────────────────────────────────────────

  gainXP(amount) {
    this.xp += amount;
    while (this.xp >= this.xpToNext && this.level < XP_TABLE.length) {
      this.xp -= this.xpToNext;
      this.levelUp();
    }
  }

  levelUp() {
    this.level += 1;
    this.xpToNext = XP_TABLE[Math.min(this.level, XP_TABLE.length - 1)] || 9999;

    // Stat increases
    this.stats.maxHp     = Math.floor(this.stats.maxHp * 1.1);
    this.stats.maxMp     = Math.floor(this.stats.maxMp * 1.08);
    this.stats.attack    = Math.floor(this.stats.attack * 1.08);
    this.stats.defense   = Math.floor(this.stats.defense * 1.07);
    this.currentHp       = this.stats.maxHp;
    this.currentMp       = this.stats.maxMp;

    this._updateHpBar();
    this.scene.events.emit('player_level_up', this.level);
  }

  // ────────────────────────────────────────────────────────────
  // ANIMATIONS
  // ────────────────────────────────────────────────────────────

  /**
   * Play a named animation state. Since we use procedural graphics,
   * this drives tween-based visual changes instead of sprite frames.
   * @param {'idle'|'walk'|'attack'|'dodge'|'cast'|'hurt'|'die'} name
   */
  playAnim(name) {
    if (!this.bodyGfx) return;
    this._currentAnim = name;

    switch (name) {
      case 'idle':
        this.scene.tweens.killTweensOf(this.bodyGfx);
        this.scene.tweens.add({
          targets: this.bodyGfx,
          y: { from: 0, to: -2 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case 'walk':
        this.scene.tweens.killTweensOf(this.bodyGfx);
        this.scene.tweens.add({
          targets: this.bodyGfx,
          y: { from: 0, to: -3 },
          duration: 220,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;

      case 'attack':
        this.scene.tweens.killTweensOf(this.bodyGfx);
        this.scene.tweens.add({
          targets: this.bodyGfx,
          scaleX: 1.15,
          scaleY: 0.9,
          duration: 80,
          yoyo: true,
          ease: 'Cubic.easeOut',
          onComplete: () => this.playAnim('idle'),
        });
        break;

      case 'dodge':
        this.scene.tweens.killTweensOf(this.bodyGfx);
        this.scene.tweens.add({
          targets: this.bodyGfx,
          scaleX: 1.3,
          scaleY: 0.7,
          duration: 120,
          yoyo: true,
          ease: 'Cubic.easeOut',
          onComplete: () => this.playAnim('idle'),
        });
        break;

      case 'cast':
        this.scene.tweens.killTweensOf(this.bodyGfx);
        this.scene.tweens.add({
          targets: this.bodyGfx,
          scaleX: 0.85,
          scaleY: 1.2,
          duration: 150,
          yoyo: true,
          ease: 'Cubic.easeOut',
          onComplete: () => this.playAnim('idle'),
        });
        break;

      case 'hurt':
        this.scene.tweens.killTweensOf(this.bodyGfx);
        this.scene.tweens.add({
          targets: this.bodyGfx,
          x: 5,
          duration: 60,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
          onComplete: () => { this.bodyGfx.x = 0; },
        });
        break;

      case 'die':
        this.scene.tweens.killTweensOf(this.bodyGfx);
        this.scene.tweens.add({
          targets: this.bodyGfx,
          angle: 90,
          alpha: 0.4,
          y: 10,
          duration: 600,
          ease: 'Cubic.easeIn',
        });
        break;
    }
  }

  updateFacingDirection(dx, dy) {
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    this.facingDx    = dx;
    this.facingDy    = dy;
    this.facingAngle = Math.atan2(dy, dx);

    // Mirror body for left/right facing
    if (this.bodyGfx) {
      this.bodyGfx.setScale(dx < 0 ? -1 : 1, 1);
    }
  }

  // ────────────────────────────────────────────────────────────
  // ABILITY MANAGEMENT
  // ────────────────────────────────────────────────────────────

  isAbilityReady(abilityId) {
    return (this.cooldowns[abilityId] || 0) <= 0;
  }

  startCooldown(abilityId) {
    const def = ABILITIES[abilityId];
    if (def) {
      this.cooldowns[abilityId] = def.cooldown;
    }
  }

  updateCooldowns(delta) {
    for (const id in this.cooldowns) {
      if (this.cooldowns[id] > 0) {
        this.cooldowns[id] = Math.max(0, this.cooldowns[id] - delta);
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // BUFFS & EFFECTS
  // ────────────────────────────────────────────────────────────

  applyBuff(buffData) {
    // buffData: { id, duration, stat?, multiplier?, reflectDamage? }
    // Remove existing buff with same id
    this.buffs = this.buffs.filter(b => b.id !== buffData.id);
    this.buffs.push({ ...buffData });
  }

  _updateBuffs(delta) {
    this.buffs = this.buffs.filter(b => {
      b.duration -= delta;
      return b.duration > 0;
    });
  }

  // ────────────────────────────────────────────────────────────
  // VISUAL / INVULNERABILITY
  // ────────────────────────────────────────────────────────────

  setInvulnerable(duration) {
    this.isInvulnerable = true;
    this.invulTimer     = duration;
  }

  flashEffect(color, duration) {
    this._flashEffect(color, duration);
  }

  _flashEffect(color, duration) {
    this._flashColor    = color;
    this._flashTimer    = duration;
    this._flashInterval = 80;
    this._flashTick     = 0;
  }

  _updateFlash(delta) {
    if (this._flashTimer <= 0) {
      if (this.bodyGfx) this.bodyGfx.setAlpha(1);
      return;
    }
    this._flashTimer -= delta;
    this._flashTick  += delta;
    if (this._flashTick >= this._flashInterval) {
      this._flashTick = 0;
      this._flashOn   = !this._flashOn;
      if (this.bodyGfx) {
        this.bodyGfx.setAlpha(this._flashOn ? 0.2 : 1);
      }
    }
  }

  _drawAttackArc(angle) {
    if (!this.attackArc) return;
    const g = this.attackArc;
    g.clear();
    g.setAlpha(0.55);
    g.fillStyle(0xffd070, 0.45);
    g.lineStyle(2, 0xffd070, 0.9);

    const halfCone = Phaser.Math.DegToRad(70);
    const r = 80;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, angle - halfCone, angle + halfCone, false);
    g.closePath();
    g.fillPath();
    g.strokePath();

    this.scene.time.delayedCall(120, () => {
      if (g) g.setAlpha(0);
    });
  }

  _emitDust() {
    if (this.dustEmitter && this._currentAnim === 'walk') {
      this.dustEmitter.emitParticle(2, 0, 14);
    }
  }

  _updateHpBar() {
    if (!this.hpBar) return;
    const pct = this.currentHp / this.stats.maxHp;
    this.hpBar.setScale(pct, 1);
    // Color shift: green → yellow → red
    const col = pct > 0.5
      ? Phaser.Display.Color.Interpolate.ColorWithColor(
          { r: 196, g: 97, b: 74 }, { r: 200, g: 168, b: 80 }, 100, Math.floor((pct - 0.5) * 200))
      : Phaser.Display.Color.Interpolate.ColorWithColor(
          { r: 200, g: 30, b: 20 }, { r: 196, g: 97, b: 74 }, 100, Math.floor(pct * 200));
    const hex = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    this.hpBar.setFillStyle(hex);
  }

  // ────────────────────────────────────────────────────────────
  // UPDATE LOOP
  // ────────────────────────────────────────────────────────────

  preUpdate(time, delta) {
    if (this.isDead) return;

    // Dodge movement
    if (this.isDodging) {
      this.dodgeTimer -= delta;
      const progress = 1 - (this.dodgeTimer / this.dodgeDuration);
      const ease = Phaser.Math.Easing.Cubic.Out(Math.min(progress, 1));
      if (this.dodgeTarget) {
        const startX = this.dodgeTarget.x - this.dodgeDir.x * 200;
        const startY = this.dodgeTarget.y - this.dodgeDir.y * 200;
        this.x = Phaser.Math.Linear(startX, this.dodgeTarget.x, ease);
        this.y = Phaser.Math.Linear(startY, this.dodgeTarget.y, ease);
      }
      if (this.dodgeTimer <= 0) {
        this.isDodging = false;
        this.playAnim('idle');
      }
    }

    // Invulnerability timer
    if (this.invulTimer > 0) {
      this.invulTimer -= delta;
      if (this.invulTimer <= 0) {
        this.isInvulnerable = false;
        if (this.bodyGfx) this.bodyGfx.setAlpha(1);
      }
    }

    // Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    }

    // Dodge cooldown
    if (this.dodgeCooldown > 0) {
      this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta);
    }

    // Flash visual
    this._updateFlash(delta);

    // Ability cooldowns
    this.updateCooldowns(delta);

    // Buff timers
    this._updateBuffs(delta);

    // MP natural regen (slow)
    if (this.currentMp < this.stats.maxMp) {
      this.currentMp = Math.min(
        this.stats.maxMp,
        this.currentMp + (this.stats.maxMp * 0.005 * delta / 1000),
      );
    }
  }

  // ────────────────────────────────────────────────────────────
  // SERIALIZATION
  // ────────────────────────────────────────────────────────────

  toSaveData() {
    return {
      characterId: this.characterData.id,
      currentHp:   this.currentHp,
      currentMp:   this.currentMp,
      level:        this.level,
      xp:           this.xp,
      xpToNext:     this.xpToNext,
      stats:        { ...this.stats },
      inventory:    [...this.inventory],
      abilities:    [...this.abilities],
    };
  }

  fromSaveData(data) {
    this.currentHp = data.currentHp ?? this.stats.maxHp;
    this.currentMp = data.currentMp ?? this.stats.maxMp;
    this.level     = data.level     ?? 1;
    this.xp        = data.xp       ?? 0;
    this.xpToNext  = data.xpToNext ?? XP_TABLE[1];
    if (data.stats) this.stats = { ...data.stats };
    if (data.inventory) this.inventory = [...data.inventory];
    if (data.abilities) {
      this.abilities = [...data.abilities];
      this.cooldowns = {};
      this.abilities.forEach(id => { this.cooldowns[id] = 0; });
    }
    this._updateHpBar();
  }

  // ────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────

  /** World-space circle collider radius */
  get colliderRadius() { return 20; }

  /** Returns current attack power including buffs */
  get effectiveAttack() {
    let atk = this.stats.attack;
    this.buffs.forEach(b => {
      if (b.stat === 'attack') atk = Math.floor(atk * b.multiplier);
    });
    return atk;
  }

  getCooldownPercent(abilityId) {
    const def = ABILITIES[abilityId];
    if (!def) return 0;
    return this.cooldowns[abilityId] / def.cooldown;
  }
}
