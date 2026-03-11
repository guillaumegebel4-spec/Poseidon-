// ============================================================
// POSEIDON — ENEMY ENTITY
// AI-driven enemy with patrol, chase, and combat behaviors.
// Phaser 3 Container-based, depth-sorted with WorldScene.
// ============================================================

import Phaser from 'phaser';
import { PALETTE, INT } from '../data/Palette.js';
import { ENEMIES }       from '../data/GameData.js';
import { audioEngine }   from '../audio/AudioEngine.js';

// ─── AI STATES ───────────────────────────────────────────────────
const AI = {
  IDLE:    'idle',
  PATROL:  'patrol',
  CHASE:   'chase',
  ATTACK:  'attack',
  HURT:    'hurt',
  DEAD:    'dead',
  RETURN:  'return',   // returning to spawn after losing player
};

// ─────────────────────────────────────────────────────────────────
export class Enemy extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x          World pixel X
   * @param {number} y          World pixel Y
   * @param {string} enemyId    Key into ENEMIES data (e.g. 'rust_crawler')
   * @param {object} [overrides] Optional stat overrides
   */
  constructor(scene, x, y, enemyId, overrides = {}) {
    super(scene, x, y);
    scene.add.existing(this);

    this.enemyId   = enemyId;
    this.data_     = { ...(ENEMIES[enemyId] || ENEMIES.rust_crawler), ...overrides };

    // ── Stats ─────────────────────────────────────────────────
    this.stats     = { ...this.data_.stats };
    this.currentHp = this.stats.hp;
    this.xpReward  = this.data_.xp || 15;

    // ── AI ────────────────────────────────────────────────────
    this.aiState       = AI.IDLE;
    this.aggroRange    = (this.data_.aggroRange  || 110) * this._tierScale();
    this.deaggroRange  = this.aggroRange * 2.2;
    this.combatRange   = 72;
    this.patrolRadius  = 80;
    this.returnRange   = 20;

    this.spawnX        = x;
    this.spawnY        = y;
    this.patrolTarget  = { x, y };
    this.patrolTimer   = 0;
    this.patrolWait    = 2000 + Math.random() * 2000;

    this.attackCooldown    = 0;
    this.attackCooldownMax = 1200 + Math.random() * 400;
    this.hurtTimer         = 0;
    this.hurtDuration      = 280;
    this.isDead            = false;
    this.deathTimer        = 0;

    // ── Movement ─────────────────────────────────────────────
    this.speed         = (this.stats.speed || 2) * 36;  // px/sec
    this.chaseSpeed    = this.speed * 1.4;
    this.vx = 0;
    this.vy = 0;

    // ── Visuals ───────────────────────────────────────────────
    this._buildSprite();
    this._buildHealthBar();
    this._buildAggroIndicator();

    // ── Physics body ─────────────────────────────────────────
    scene.physics.world.enable(this);
    this.body.setSize(24, 18);
    this.body.setOffset(-12, -9);
    this.body.setCollideWorldBounds(false);
  }

  // ─── VISUAL SETUP ────────────────────────────────────────────

  _buildSprite() {
    const tier = this.data_.tier || 1;
    const pal  = this.data_.palette || {};

    // Choose sprite based on size/type
    const spriteMap = {
      small:  'enemy_spider_idle',
      medium: 'enemy_golem_idle',
      large:  'enemy_golem_idle',
      boss:   'enemy_boss_idle',
    };
    const size = this.data_.size || 'medium';
    const sprKey = spriteMap[size] || 'enemy_golem_idle';

    if (this.scene.textures.exists(sprKey)) {
      this._sprite = this.scene.add.image(0, 0, sprKey);
      this._sprite.setScale(this._tierScale() * (size === 'boss' ? 1.3 : 1));
    } else {
      // Fallback: coloured block
      this._sprite = this.scene.add.graphics();
      const bodyColor = parseInt((pal.body || '#8B7355').replace('#', ''), 16);
      this._sprite.fillStyle(bodyColor, 1);
      const s = size === 'boss' ? 24 : size === 'large' ? 16 : 12;
      this._sprite.fillRect(-s, -s * 1.5, s * 2, s * 2);
      this._sprite.lineStyle(1.5, INT.ink, 1);
      this._sprite.strokeRect(-s, -s * 1.5, s * 2, s * 2);

      // Eye glow
      const eyeColor = parseInt((pal.eye || '#E87840').replace('#', ''), 16);
      this._sprite.fillStyle(eyeColor, 0.9);
      this._sprite.fillRect(-4, -s, 3, 3);
      this._sprite.fillRect(1, -s, 3, 3);
    }

    this.add(this._sprite);

    // Shadow
    this._shadow = this.scene.add.graphics();
    this._shadow.fillStyle(0x000000, 0.25);
    this._shadow.fillEllipse(0, 8, 28, 8);
    this.addAt(this._shadow, 0);

    // Idle bob tween
    this._idleTween = this.scene.tweens.add({
      targets: this._sprite,
      y: -3,
      duration: 1100 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  _buildHealthBar() {
    this._hpBarBg = this.scene.add.graphics();
    this._hpBarFg = this.scene.add.graphics();

    const barW = 30, barH = 4;
    const barX = -barW / 2, barY = -28;

    this._hpBarBg.fillStyle(0x000000, 0.6);
    this._hpBarBg.fillRect(barX, barY, barW, barH);

    this._hpBarFg.fillStyle(INT.red, 1);
    this._hpBarFg.fillRect(barX, barY, barW, barH);

    this._hpBarBg.setVisible(false);
    this._hpBarFg.setVisible(false);

    this.add(this._hpBarBg);
    this.add(this._hpBarFg);

    this._hpBarW   = barW;
    this._hpBarX   = barX;
    this._hpBarY   = barY;
    this._hpBarH   = barH;
  }

  _buildAggroIndicator() {
    this._aggroIcon = this.scene.add.text(0, -36, '!', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: PALETTE.red,
      stroke: PALETTE.ink,
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    this.add(this._aggroIcon);
  }

  _tierScale() {
    return 0.8 + (this.data_.tier || 1) * 0.15;
  }

  // ─── AI UPDATE ───────────────────────────────────────────────

  /**
   * Main update — call from WorldScene each frame.
   * @param {number} delta   ms since last frame
   * @param {number} playerX Player world X
   * @param {number} playerY Player world Y
   * @returns {{ enterCombat: boolean }} flags for WorldScene
   */
  update(delta, playerX, playerY) {
    if (this.isDead) {
      this._updateDeath(delta);
      return { enterCombat: false };
    }

    const dt = delta / 1000;
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

    // Cooldown timers
    if (this.attackCooldown > 0) this.attackCooldown -= delta;
    if (this.hurtTimer > 0) {
      this.hurtTimer -= delta;
      if (this.hurtTimer <= 0) {
        this.aiState = this._prevAiState || AI.PATROL;
        this._sprite.setAlpha(1);
      }
    }

    let enterCombat = false;

    switch (this.aiState) {
      case AI.IDLE:
        enterCombat = this._updateIdle(dt, distToPlayer);
        break;

      case AI.PATROL:
        enterCombat = this._updatePatrol(dt, delta, distToPlayer);
        break;

      case AI.CHASE:
        enterCombat = this._updateChase(dt, playerX, playerY, distToPlayer);
        break;

      case AI.RETURN:
        this._updateReturn(dt);
        // Re-enter idle when close to spawn
        if (Phaser.Math.Distance.Between(this.x, this.y, this.spawnX, this.spawnY) < this.returnRange) {
          this.x = this.spawnX;
          this.y = this.spawnY;
          this.aiState = AI.IDLE;
          this._setAggroVisible(false);
        }
        break;

      case AI.ATTACK:
        // Handled by WorldScene (triggers CombatScene)
        break;
    }

    this._applyVelocity(dt);
    this._updateSprite();

    return { enterCombat };
  }

  _updateIdle(dt, distToPlayer) {
    this.vx = 0; this.vy = 0;

    if (distToPlayer < this.aggroRange) {
      this._enterChase();
    }

    // Occasional random look around (already handled by bob tween)
    return false;
  }

  _updatePatrol(dt, delta, distToPlayer) {
    if (distToPlayer < this.aggroRange) {
      this._enterChase();
      return false;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.patrolTarget.x, this.patrolTarget.y);

    if (dist < 8) {
      // Reached patrol point — wait then pick new one
      this.vx = 0; this.vy = 0;
      this.patrolTimer += delta;

      if (this.patrolTimer >= this.patrolWait) {
        this.patrolTimer = 0;
        this.patrolWait = 1500 + Math.random() * 2500;
        this._pickNewPatrolTarget();
      }
    } else {
      // Move toward patrol target
      const angle = Math.atan2(this.patrolTarget.y - this.y, this.patrolTarget.x - this.x);
      const s = this.speed * 0.55;
      this.vx = Math.cos(angle) * s;
      this.vy = Math.sin(angle) * s;
    }

    return false;
  }

  _updateChase(dt, playerX, playerY, distToPlayer) {
    // Lost player — return to spawn
    if (distToPlayer > this.deaggroRange) {
      this.aiState = AI.RETURN;
      this._setAggroVisible(false);
      return false;
    }

    // In combat range
    if (distToPlayer < this.combatRange) {
      return true; // signal WorldScene to trigger combat
    }

    // Move toward player
    const angle = Math.atan2(playerY - this.y, playerX - this.x);
    this.vx = Math.cos(angle) * this.chaseSpeed;
    this.vy = Math.sin(angle) * this.chaseSpeed;

    return false;
  }

  _updateReturn(dt) {
    const angle = Math.atan2(this.spawnY - this.y, this.spawnX - this.x);
    this.vx = Math.cos(angle) * this.speed * 0.7;
    this.vy = Math.sin(angle) * this.speed * 0.7;
  }

  _enterChase() {
    if (this.aiState === AI.CHASE) return;
    this.aiState = AI.CHASE;
    this._setAggroVisible(true);
    audioEngine.playSfx('footstep');
  }

  _pickNewPatrolTarget() {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 20 + Math.random() * this.patrolRadius;
    this.patrolTarget = {
      x: this.spawnX + Math.cos(angle) * dist,
      y: this.spawnY + Math.sin(angle) * dist,
    };
  }

  // ─── COMBAT ──────────────────────────────────────────────────

  /**
   * Receive damage from player.
   * @param {number} amount   Raw damage before defense
   * @param {boolean} isCrit
   * @returns {{ died: boolean }}
   */
  takeDamage(amount, isCrit = false) {
    if (this.isDead) return { died: false };

    const reduced = Math.max(1, Math.round(amount - this.stats.defense * 0.3));
    this.currentHp -= reduced;

    this._updateHpBar();
    this._hpBarBg.setVisible(true);
    this._hpBarFg.setVisible(true);

    // Hurt flash
    this._prevAiState = this.aiState;
    this.aiState      = AI.HURT;
    this.hurtTimer    = this.hurtDuration;
    this._sprite.setAlpha(0.4);
    audioEngine.playSfx('attack_hit');

    if (isCrit) {
      this.scene.cameras.main.shake(80, 0.004);
      audioEngine.playSfx('attack_crit');
    }

    if (this.currentHp <= 0) {
      this.currentHp = 0;
      this._die();
      return { died: true, xpReward: this.xpReward, drops: this.data_.drops || [] };
    }

    // Auto aggro on hit
    if (this.aiState !== AI.CHASE) this._enterChase();

    return { died: false };
  }

  _die() {
    this.isDead   = true;
    this.aiState  = AI.DEAD;
    this.deathTimer = 800;

    audioEngine.playSfx('enemy_die');

    if (this._idleTween) this._idleTween.stop();
    if (this.body) this.body.setVelocity(0, 0);

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y + 16,
      duration: 700,
      ease: 'Power2',
    });

    this._hpBarBg.setVisible(false);
    this._hpBarFg.setVisible(false);
    this._aggroIcon.setAlpha(0);
  }

  _updateDeath(delta) {
    this.deathTimer -= delta;
    if (this.deathTimer <= 0) {
      this.destroy();
    }
  }

  // ─── VISUAL HELPERS ──────────────────────────────────────────

  _applyVelocity(dt) {
    if (this.isDead) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.body) {
      this.body.setVelocity(this.vx, this.vy);
    }
  }

  _updateSprite() {
    // Flip toward movement direction
    if (this.vx < -0.5) this._sprite.setFlipX(false);
    if (this.vx > 0.5)  this._sprite.setFlipX(true);

    // Chase: scale up slightly for menace
    const targetScale = this.aiState === AI.CHASE ? this._tierScale() * 1.08 : this._tierScale();
    if (this._sprite.scaleX !== targetScale) {
      this._sprite.setScale(
        Phaser.Math.Linear(this._sprite.scaleX, targetScale, 0.1),
        Phaser.Math.Linear(this._sprite.scaleY, targetScale, 0.1)
      );
    }
  }

  _updateHpBar() {
    const pct = Math.max(0, this.currentHp / this.stats.hp);
    this._hpBarFg.clear();

    const color = pct > 0.5 ? INT.green : pct > 0.25 ? INT.gold : INT.red;
    this._hpBarFg.fillStyle(color, 1);
    this._hpBarFg.fillRect(this._hpBarX, this._hpBarY, Math.round(this._hpBarW * pct), this._hpBarH);
  }

  _setAggroVisible(visible) {
    this.scene.tweens.add({
      targets: this._aggroIcon,
      alpha: visible ? 1 : 0,
      y: visible ? -42 : -36,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        if (visible) {
          this.scene.tweens.add({
            targets: this._aggroIcon,
            alpha: 0,
            delay: 800,
            duration: 300,
          });
        }
      },
    });
  }

  // ─── GETTERS ─────────────────────────────────────────────────

  get name()        { return this.data_.name || 'Enemy'; }
  get tier()        { return this.data_.tier || 1; }
  get sprite()      { return this.data_.size || 'golem'; }
  get biomes()      { return this.data_.biomes || ['forest']; }
  get drops()       { return this.data_.drops || []; }
  get isAggressive(){ return this.data_.behavior === 'aggressive'; }
}

// ─── ENEMY FACTORY ───────────────────────────────────────────────

/**
 * Spawn an enemy appropriate for the given biome.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} biomeId
 * @param {number} [difficultyMult=1]  Scales stats
 * @returns {Enemy}
 */
export function spawnEnemy(scene, x, y, biomeId, difficultyMult = 1) {
  // Find enemies for this biome
  const candidates = Object.values(ENEMIES).filter(e =>
    e.biomes?.includes(biomeId) && e.tier <= 2
  );

  const pick = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : Object.values(ENEMIES)[0];

  const overrides = {
    stats: {
      ...pick.stats,
      hp:      Math.round(pick.stats.hp * difficultyMult),
      attack:  Math.round(pick.stats.attack * difficultyMult),
      defense: Math.round(pick.stats.defense * difficultyMult),
    },
  };

  return new Enemy(scene, x, y, pick.id, overrides);
}

/**
 * Spawn a boss enemy.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} biomeId
 * @returns {Enemy}
 */
export function spawnBoss(scene, x, y, biomeId) {
  const bossCandidates = Object.values(ENEMIES).filter(e =>
    e.biomes?.includes(biomeId) && e.tier >= 3
  );

  const boss = bossCandidates.length > 0
    ? bossCandidates[0]
    : Object.values(ENEMIES).find(e => e.tier >= 3) || Object.values(ENEMIES)[0];

  return new Enemy(scene, x, y, boss.id, {
    stats: { ...boss.stats, hp: boss.stats.hp * 2, attack: boss.stats.attack * 1.5 },
    aggroRange: 200,
  });
}
