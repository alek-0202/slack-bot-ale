const { EPIC_AFFIX_TYPES, normalizeEpicAffix } = require('../../../services/epicAffixRegistry');
const { addOrRefreshEffect } = require('./elementalRules');

const EPIC_AFFIX_SHIELD_EFFECT_ID = 'epic_affix_shield_bonus';

function pct(value) {
  return Math.max(0, Number(value || 0)) / 100;
}

function applyEpicAffixToStats({ stats, epicAffix }) {
  const normalized = normalizeEpicAffix(epicAffix);
  if (!normalized) {
    return {
      stats,
      epicCombat: {
        onHitFlatDamage: 0,
        damageReductionFlat: 0,
      },
    };
  }

  const nextStats = { ...stats };
  const nextCombat = {
    onHitFlatDamage: 0,
    damageReductionFlat: 0,
  };

  switch (normalized.type) {
    case EPIC_AFFIX_TYPES.ATTACK_PCT:
      nextStats.attack = Math.max(1, Math.round(Number(nextStats.attack || 1) * (1 + pct(normalized.value))));
      break;
    case EPIC_AFFIX_TYPES.MAGIC_PCT:
      nextStats.magic = Math.max(1, Math.round(Number(nextStats.magic || 1) * (1 + pct(normalized.value))));
      break;
    case EPIC_AFFIX_TYPES.HP_PCT:
      nextStats.hp = Math.max(1, Math.round(Number(nextStats.hp || 1) * (1 + pct(normalized.value))));
      break;
    case EPIC_AFFIX_TYPES.SPEED_PCT:
      nextStats.speed = Math.max(1, Math.round(Number(nextStats.speed || 1) * (1 + pct(normalized.value))));
      break;
    case EPIC_AFFIX_TYPES.DEFENSE_PCT:
      nextStats.defense = Math.max(0, Math.round(Number(nextStats.defense || 0) * (1 + pct(normalized.value))));
      break;
    case EPIC_AFFIX_TYPES.DODGE_PCT:
      nextStats.dodgeChance = Math.max(0, Math.min(0.95, Number(nextStats.dodgeChance || 0) + pct(normalized.value)));
      break;
    case EPIC_AFFIX_TYPES.MAGIC_EFFICIENCY_PCT:
      nextStats.magicEfficiencyBonusPct = Math.max(0, Number(nextStats.magicEfficiencyBonusPct || 0) + Number(normalized.value || 0));
      break;
    case EPIC_AFFIX_TYPES.ON_HIT_FLAT:
      nextCombat.onHitFlatDamage = Math.max(0, Math.round(normalized.value));
      break;
    case EPIC_AFFIX_TYPES.DAMAGE_REDUCTION_FLAT:
      nextCombat.damageReductionFlat = Math.max(0, Math.round(normalized.value));
      break;
    default:
      break;
  }

  return {
    stats: nextStats,
    epicCombat: nextCombat,
  };
}

function applyEpicAffixBattleStart({ player, actorId, logs = [] }) {
  const affix = normalizeEpicAffix(player?.selectedPokemon?.epicAffix);
  if (!affix || affix.type !== EPIC_AFFIX_TYPES.SHIELD_START_HP_PCT) return logs;

  const shieldAmount = Math.max(1, Math.round(Number(player?.battleHp?.max || 0) * pct(affix.value)));
  addOrRefreshEffect(player, {
    id: EPIC_AFFIX_SHIELD_EFFECT_ID,
    sourceUserId: actorId,
    name: 'Afixo Épico: Shield',
    remainingRounds: 999,
    shieldCurrentHp: shieldAmount,
    shieldInitialHp: shieldAmount,
  });
  logs.push(`🛡️ Afixo Épico concedeu escudo inicial de ${shieldAmount}.`);
  return logs;
}

function applyEpicAffixOutgoingDamage({ attacker, damage, logs = [] }) {
  const bonus = Math.max(0, Number(attacker?.epicCombat?.onHitFlatDamage || 0));
  if (bonus <= 0) return { damage, logs };
  const finalDamage = Math.max(0, Math.round(Number(damage || 0) + bonus));
  logs.push(`💥 Afixo Épico adicionou ${bonus} de dano on-hit.`);
  return { damage: finalDamage, logs };
}

function applyEpicAffixIncomingDamage({ defender, damage, logs = [] }) {
  const reduction = Math.max(0, Number(defender?.epicCombat?.damageReductionFlat || 0));
  if (reduction <= 0) return { damage, logs };
  const finalDamage = Math.max(0, Math.round(Number(damage || 0) - reduction));
  logs.push(`🧱 Afixo Épico reduziu ${Math.min(reduction, Math.round(Number(damage || 0)))} de dano.`);
  return { damage: finalDamage, logs };
}

module.exports = {
  applyEpicAffixToStats,
  applyEpicAffixBattleStart,
  applyEpicAffixOutgoingDamage,
  applyEpicAffixIncomingDamage,
};
