// ============================================================
// POSEIDON — COMBAT SYSTEM
// Damage calculations, effects, loot generation
// ============================================================
import { ABILITIES, ITEMS } from '../data/GameData.js';

export const DAMAGE_TYPES = {
  PHYSICAL: 'physical',
  MAGIC: 'magic',
  FIRE: 'fire',
  ELECTRIC: 'electric',
  HOLY: 'holy',
  VOID: 'void',
};

export const STATUS_EFFECTS = {
  BURN: { id: 'burn', duration: 3000, tickInterval: 500, color: 0xE87840 },
  STUN: { id: 'stun', duration: 1500, color: 0xFFFF00 },
  SLOW: { id: 'slow', duration: 2000, speedMult: 0.4, color: 0x6B7FA3 },
  SHIELD: { id: 'shield', duration: 4000, absorbAmount: 50, color: 0x6B7FA3 },
  POWER: { id: 'power', duration: 5000, attackMult: 1.5, color: 0xC8A850 },
  INVISIBLE: { id: 'invisible', duration: 3000, color: 0xA0A0C0 },
};

export class CombatSystem {
  constructor() {
    this.combatLog = [];
  }

  // Calculate damage dealt from attacker to target
  calculateDamage(attacker, target, baseAmount, type = DAMAGE_TYPES.PHYSICAL) {
    let dmg = baseAmount;

    // Attacker power buff
    if (attacker.statusEffects?.has('power')) {
      dmg *= STATUS_EFFECTS.POWER.attackMult;
    }

    // Defense reduction
    const defense = target.stats?.defense || 0;
    const damageReduction = Math.min(defense / (defense + 50), 0.75);
    dmg *= (1 - damageReduction);

    // Target shield absorption
    if (target.statusEffects?.has('shield')) {
      const shield = target.statusEffects.get('shield');
      const absorbed = Math.min(shield.remaining, dmg);
      shield.remaining -= absorbed;
      dmg -= absorbed;
      if (shield.remaining <= 0) target.statusEffects.delete('shield');
    }

    // Stun: target takes more damage
    if (target.statusEffects?.has('stun')) {
      dmg *= 1.35;
    }

    // Random variance ±10%
    dmg *= 0.9 + Math.random() * 0.2;

    // Critical hit (15% chance, 2x damage)
    const isCrit = Math.random() < 0.15;
    if (isCrit) dmg *= 2;

    // Type weaknesses
    dmg = this._applyTypeModifiers(dmg, type, target.enemyData?.resistances);

    return {
      amount: Math.max(1, Math.floor(dmg)),
      isCrit,
      type,
    };
  }

  _applyTypeModifiers(dmg, type, resistances) {
    if (!resistances) return dmg;
    const mult = resistances[type] || 1;
    return dmg * mult;
  }

  // Apply a status effect to a target
  applyStatusEffect(target, effectId, overrideDuration) {
    if (!target.statusEffects) target.statusEffects = new Map();
    const effectDef = STATUS_EFFECTS[effectId.toUpperCase()];
    if (!effectDef) return;

    target.statusEffects.set(effectId, {
      ...effectDef,
      startTime: Date.now(),
      duration: overrideDuration || effectDef.duration,
      remaining: effectDef.absorbAmount || 0,
    });
  }

  // Update all status effects (call every frame)
  updateStatusEffects(entity, delta) {
    if (!entity.statusEffects) return;
    const now = Date.now();

    for (const [id, effect] of entity.statusEffects) {
      const elapsed = now - effect.startTime;
      if (elapsed >= effect.duration) {
        entity.statusEffects.delete(id);
        continue;
      }

      // Burn tick
      if (id === 'burn' && effect.lastTick) {
        if (now - effect.lastTick >= effect.tickInterval) {
          effect.lastTick = now;
          if (entity.takeDamage) {
            entity.takeDamage(5, DAMAGE_TYPES.FIRE, false);
          }
        }
      } else if (id === 'burn' && !effect.lastTick) {
        effect.lastTick = now;
      }
    }
  }

  // Check if entity has a status effect
  hasEffect(entity, effectId) {
    return entity.statusEffects?.has(effectId) || false;
  }

  // Calculate ability damage
  calculateAbilityDamage(abilityId, casterStats) {
    const ability = ABILITIES[abilityId];
    if (!ability) return 0;

    let dmg = ability.damage;

    // Scale with caster stats
    if (ability.type === 'projectile' || ability.type === 'area') {
      dmg += Math.floor(casterStats.attack * 0.5);
    } else if (ability.type === 'melee_aoe' || ability.type === 'melee_combo') {
      dmg += Math.floor(casterStats.attack * 0.8);
    } else if (ability.type === 'dash') {
      dmg += Math.floor(casterStats.attack * 0.6);
    }

    return dmg;
  }

  // Generate loot from a killed enemy
  generateLoot(enemyData, difficulty = 1) {
    const drops = [];
    const possibleDrops = enemyData.drops || [];

    possibleDrops.forEach(itemId => {
      const dropChance = 0.3 + (difficulty - 1) * 0.1;
      if (Math.random() < dropChance) {
        const item = ITEMS[itemId];
        if (item) drops.push({ ...item, quantity: 1 });
      }
    });

    // Gold drop
    const goldAmount = Math.floor(
      (enemyData.xp || 10) * (0.5 + Math.random() * 1.0) * difficulty
    );

    return { items: drops, gold: goldAmount, xp: enemyData.xp || 10 };
  }

  // Calculate XP needed for next level
  xpForLevel(level) {
    return Math.floor(100 * Math.pow(1.4, level - 1));
  }

  // Check if entity should level up
  checkLevelUp(entityData) {
    const needed = this.xpForLevel(entityData.level);
    if (entityData.xp >= needed) {
      entityData.xp -= needed;
      entityData.level += 1;

      // Stat bonuses on level up
      entityData.stats.maxHp += 10;
      entityData.stats.hp = entityData.stats.maxHp;
      entityData.stats.maxMp += 5;
      entityData.stats.mp = entityData.stats.maxMp;
      entityData.stats.attack += 3;
      entityData.stats.defense += 2;

      return true;
    }
    return false;
  }

  log(message) {
    this.combatLog.unshift({ time: Date.now(), message });
    if (this.combatLog.length > 50) this.combatLog.pop();
  }
}

// Shared singleton
export const combatSystem = new CombatSystem();
