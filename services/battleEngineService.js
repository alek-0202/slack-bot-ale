const { randomCoinflip } = require("../utils/helpers");

const BATTLE_HP_MULTIPLIER = 12.5;
const MAX_POTIONS_PER_BATTLE = 5;

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function calculateBattleHp(baseHp) {
  const safeBaseHp = Math.max(1, Number(baseHp) || 1);
  return Math.max(1, Math.round(safeBaseHp * BATTLE_HP_MULTIPLIER));
}

function calculateDamage({ attackerAttack, defenderDefense, d6Roll, d20Roll }) {
  const attack = Math.max(1, Number(attackerAttack) || 1);
  const defense = Math.max(0, Number(defenderDefense) || 0);
  const baseRoll = d6Roll || rollDie(6);
  const critRoll = d20Roll || rollDie(20);

  const normalDamage = attack + baseRoll;
  const isCritical = attack - defense + critRoll > 17;
  const criticalDamage = isCritical ? normalDamage * 1.6 : normalDamage;

  let finalDamage = criticalDamage;

  if (defense > criticalDamage * 2) {
    finalDamage = 0;
  } else if (defense === Math.round(criticalDamage)) {
    finalDamage = criticalDamage * 0.5;
  } else if (defense <= criticalDamage / 2) {
    finalDamage = criticalDamage * 1.15;
  }

  return {
    d6Roll: baseRoll,
    d20Roll: critRoll,
    isCritical,
    normalDamage: Math.round(normalDamage),
    finalDamage: Math.max(0, Math.round(finalDamage)),
  };
}

function resolveAttackTurn({ attacker, defender }) {
  const result = calculateDamage({
    attackerAttack: attacker.stats.attack,
    defenderDefense: defender.stats.defense,
  });

  defender.battleHp.current = Math.max(0, defender.battleHp.current - result.finalDamage);

  return {
    ...result,
    defenderRemainingHp: defender.battleHp.current,
  };
}

function resolvePotionTurn(playerState) {
  if (playerState.potionsUsed >= MAX_POTIONS_PER_BATTLE) {
    return { ok: false, reason: "limit" };
  }

  const missingHp = Math.max(0, playerState.battleHp.max - playerState.battleHp.current);
  if (missingHp <= 0) {
    return { ok: false, reason: "full_hp" };
  }

  const healAmount = Math.max(1, Math.round(missingHp * 0.35));

  playerState.potionsUsed += 1;
  playerState.battleHp.current = Math.min(
    playerState.battleHp.max,
    playerState.battleHp.current + healAmount,
  );

  return {
    ok: true,
    healAmount,
    remainingPotions: MAX_POTIONS_PER_BATTLE - playerState.potionsUsed,
    currentHp: playerState.battleHp.current,
  };
}

function decideStartingPlayer(challengerId, challengedId) {
  const result = randomCoinflip();
  const starter = result === "cara" ? challengerId : challengedId;

  return {
    result,
    starter,
  };
}

module.exports = {
  BATTLE_HP_MULTIPLIER,
  MAX_POTIONS_PER_BATTLE,
  rollDie,
  calculateBattleHp,
  calculateDamage,
  resolveAttackTurn,
  resolvePotionTurn,
  decideStartingPlayer,
};
