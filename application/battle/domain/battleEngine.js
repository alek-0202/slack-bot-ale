const { randomCoinflip } = require("../../../utils/helpers");
const { resolveElementalRelation } = require("../../../services/pokemonElementsService");
const { resolveElementalDamageRule, getElementalEfficiencyMultiplier } = require("./elementalRules");

const BATTLE_HP_MULTIPLIER = 12.5;
const MAX_POTIONS_PER_BATTLE = 5;
const INITIATIVE_THRESHOLD = 100;
const MAGIC_ENERGY_COST = 50;

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function normalizeChance(rawChance, cap = 1) {
  const numeric = Number(rawChance);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(Number(cap) || 1, normalized));
}

function resolveBattleChance(playerState, key) {
  const statsValue = playerState?.stats?.[key];
  if (statsValue != null && Number.isFinite(Number(statsValue))) {
    return Number(statsValue);
  }
  const selectedValue = playerState?.selectedPokemon?.[key];
  if (selectedValue != null && Number.isFinite(Number(selectedValue))) {
    return Number(selectedValue);
  }
  return 0;
}

function rollCriticalStrike({ critChance, critMultiplier = 1.6 }) {
  const normalizedCritChance = normalizeChance(critChance, 0.95);
  const roll = Math.random();
  const isCrit = roll < normalizedCritChance;
  return {
    isCrit,
    critMultiplier: isCrit ? Math.max(1, Number(critMultiplier) || 1.6) : 1,
    critChanceRaw: Number(critChance) || 0,
    critChanceNormalized: normalizedCritChance,
    critRoll: Number(roll.toFixed(4)),
  };
}

function calculateBattleHp(baseHp) {
  const safeBaseHp = Math.max(1, Number(baseHp) || 1);
  return Math.max(1, Math.round(safeBaseHp * BATTLE_HP_MULTIPLIER));
}

function calculateDamage({ attackerAttack, defenderDefense, attackerCritChance = 0, defenderDodgeChance = 0, varianceRoll }) {
  const attack = Math.max(1, Number(attackerAttack) || 1);
  const defense = Math.max(0, Number(defenderDefense) || 0);
  const damageVariance = varianceRoll || ((Math.random() * 0.28) + 0.86);

  const baseDamage = Math.max(1, Math.round((attack * damageVariance) - (defense * 0.42)));
  const critChanceRaw = Number(attackerCritChance) || 0;
  const critChance = normalizeChance(attackerCritChance, 0.95);
  const dodgeChance = normalizeChance(defenderDodgeChance, 0.95);
  const dodgeRoll = Math.random();
  const dodged = dodgeRoll < dodgeChance;

  if (dodged) {
    return {
      isCritical: false,
      dodged: true,
      didHit: false,
      didDodge: true,
      wasDodged: true,
      normalDamage: baseDamage,
      finalDamage: 0,
      critChance,
      critChanceRaw,
      dodgeChance,
      varianceRoll: Number(damageVariance.toFixed(4)),
      critRoll: null,
      critMultiplier: 1,
      dodgeRoll: Number(dodgeRoll.toFixed(4)),
    };
  }

  const crit = rollCriticalStrike({ critChance, critMultiplier: 1.6 });
  const isCritical = crit.isCrit;
  const critMultiplier = crit.critMultiplier;
  const finalDamage = Math.max(1, Math.round(baseDamage * critMultiplier));

  return {
    isCritical,
    dodged: false,
    normalDamage: baseDamage,
    finalDamage,
    critChance: crit.critChanceNormalized,
    critChanceRaw,
    dodgeChance,
    varianceRoll: Number(damageVariance.toFixed(4)),
    critRollInputChance: crit.critChanceRaw,
    critRoll: crit.critRoll,
    critMultiplier,
    didHit: true,
    didDodge: false,
    wasDodged: false,
    dodgeRoll: Number(dodgeRoll.toFixed(4)),
  };
}

function calculateMagicDamage({
  attacker,
  attackerAttack,
  attackerMagic,
  attackerCritChance = 0,
  defenderDodgeChance = 0,
  magicElement,
  defenderElements = [],
  d12Roll,
  d6Roll,
}) {
  const attack = Math.max(1, Number(attackerAttack) || 1);
  const magic = Math.max(1, Number(attackerMagic) || attack);
  const baseStatUsed = Number(attackerMagic) > 0 ? "magic" : "attack";
  const elemental = resolveElementalRelation({ attackElement: magicElement, defenderElements });
  const elementalRule = resolveElementalDamageRule({ attackElement: magicElement, defenderElements });
  const efficiencyMultiplier = getElementalEfficiencyMultiplier(attacker);
  const primaryRoll = d12Roll || rollDie(12);
  const bonusRoll = d6Roll || rollDie(6);
  const attackBonusBase = Math.max(1, Math.round(attack * 0.15));
  const normalDamage = magic + primaryRoll + attackBonusBase + bonusRoll;
  const dodgeChance = normalizeChance(defenderDodgeChance, 0.95);
  const dodgeRoll = Math.random();
  const dodged = dodgeRoll < dodgeChance;

  if (dodged) {
    return {
      baseStatUsed,
      magicStat: magic,
      attackStat: attack,
      primaryRollSides: 12,
      primaryRollValue: primaryRoll,
      bonusRollSides: 6,
      bonusRollValue: bonusRoll,
      attackBonusBase,
      normalDamage: Math.round(normalDamage),
      finalDamage: 0,
      didHit: false,
      didDodge: true,
      wasDodged: true,
      dodged: true,
      dodgeChance,
      dodgeRoll: Number(dodgeRoll.toFixed(4)),
      critChanceRaw: Number(attackerCritChance) || 0,
      critChance: normalizeChance(attackerCritChance, 0.95),
      critRoll: null,
      critMultiplier: 1,
      isCritical: false,
      elemental,
      elementalBaseMultiplier: Number(elementalRule.multiplier || 1),
      elementalModifier: Number((elementalRule.multiplier || 1) * efficiencyMultiplier),
      elementalOutcome: elementalRule.relation || "neutral",
      efficiencyMultiplier,
      multiplier: Number((elementalRule.multiplier || 1) * efficiencyMultiplier),
    };
  }
  const crit = rollCriticalStrike({ critChance: attackerCritChance, critMultiplier: 1.6 });
  const critMultiplier = Number(crit.critMultiplier || 1);
  const elementalBaseMultiplier = Number(elementalRule.multiplier || 1);
  const elementalModifier = elementalBaseMultiplier * efficiencyMultiplier;
  const finalDamage = normalDamage * critMultiplier * elementalModifier;

  return {
    baseStatUsed,
    magicStat: magic,
    attackStat: attack,
    primaryRollSides: 12,
    primaryRollValue: primaryRoll,
    bonusRollSides: 6,
    bonusRollValue: bonusRoll,
    attackBonusBase,
    normalDamage: Math.round(normalDamage),
    multiplier: Number(elementalModifier),
    elementalModifier: Number(elementalModifier),
    elementalBaseMultiplier: Number(elementalBaseMultiplier),
    efficiencyMultiplier,
    finalDamage: Math.max(0, Math.round(finalDamage)),
    isCritical: Boolean(crit.isCrit),
    critMultiplier,
    critChanceRaw: Number(attackerCritChance) || 0,
    critChance: Number(crit.critChanceNormalized || 0),
    critRoll: Number(crit.critRoll),
    dodgeChance,
    dodgeRoll: Number(dodgeRoll.toFixed(4)),
    dodged: false,
    didHit: true,
    didDodge: false,
    wasDodged: false,
    elementalOutcome: elementalRule.relation || "neutral",
    elemental,
  };
}

function resolveAttackTurn({ attacker, defender }) {
  const attackerCritChance = resolveBattleChance(attacker, "critChance");
  const defenderDodgeChance = resolveBattleChance(defender, "dodgeChance");
  const result = calculateDamage({
    attackerAttack: attacker.stats.attack,
    defenderDefense: defender.stats.defense,
    attackerCritChance,
    defenderDodgeChance,
  });

  const finalDamage = result.dodged ? 0 : Math.max(0, Number(result.finalDamage || 0));
  const elemental = {
    elemental: { relation: "neutral", hasAdvantage: false, hasDisadvantage: false },
    multiplier: 1,
    relation: "neutral",
    finalDamage,
  };

  defender.battleHp.current = Math.max(0, defender.battleHp.current - finalDamage);

  return {
    ...result,
    elemental,
    elementalModifier: 1,
    elementalOutcome: "neutral",
    attackElement: null,
    finalDamage,
    defenderRemainingHp: defender.battleHp.current,
  };
}

function resolveMagicTurn({ attacker, defender, magicEntry }) {
  const attackerCritChance = resolveBattleChance(attacker, "critChance");
  const defenderDodgeChance = resolveBattleChance(defender, "dodgeChance");
  const result = calculateMagicDamage({
    attacker,
    attackerAttack: attacker.stats.attack,
    attackerMagic: attacker.stats.magic,
    attackerCritChance: attacker.stats.critChance,
    defenderDodgeChance: defender.stats.dodgeChance,
    magicElement: magicEntry?.element,
    defenderElements: defender.selectedPokemon?.elementTypes || [],
  });

  defender.battleHp.current = Math.max(0, defender.battleHp.current - result.finalDamage);

  return {
    ok: true,
    magicEntry,
    energyConsumed: MAGIC_ENERGY_COST,
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

function createInitialInitiativeState({ challengerId, challengedId, starter }) {
  return {
    threshold: INITIATIVE_THRESHOLD,
    gauges: {
      [challengerId]: starter === challengerId ? INITIATIVE_THRESHOLD : 0,
      [challengedId]: starter === challengedId ? INITIATIVE_THRESHOLD : 0,
    },
    lastActorUserId: null,
    lastTickCount: 0,
    lastDebug: null,
  };
}

function resolveNextTurnBySpeed({ battle, actorUserId, energyPenalty = 0 }) {
  const playerIds = [battle.challengerId, battle.challengedId];
  const gauges = battle.initiative?.gauges || {};
  const threshold = battle.initiative?.threshold || INITIATIVE_THRESHOLD;
  const appliedPenalty = Math.max(0, Number(energyPenalty) || 0);

  gauges[actorUserId] = Math.max(0, (Number(gauges[actorUserId]) || 0) - threshold - appliedPenalty);

  let ticks = 0;
  while (!playerIds.some((userId) => (Number(gauges[userId]) || 0) >= threshold) && ticks < 1000) {
    for (const userId of playerIds) {
      const baseSpeed = Math.max(1, Number(battle.players[userId]?.stats?.speed) || 1);
      const effects = battle.players[userId]?.elementalState?.effects || [];
      const speedMultiplier = effects
        .filter((effect) => Number(effect?.remainingRounds ?? 1) > 0 && effect?.speedMultiplier != null)
        .reduce((acc, effect) => acc * Math.max(0.1, Number(effect.speedMultiplier || 1)), 1);
      const speed = Math.max(1, Math.round(baseSpeed * speedMultiplier));
      gauges[userId] = (Number(gauges[userId]) || 0) + speed;
    }
    ticks += 1;
  }

  const sortedCandidates = playerIds
    .map((userId) => ({
      userId,
      gauge: Number(gauges[userId]) || 0,
      speed: Math.max(1, Number(battle.players[userId]?.stats?.speed) || 1),
    }))
    .sort((left, right) => {
      if (right.gauge !== left.gauge) return right.gauge - left.gauge;
      if (right.speed !== left.speed) return right.speed - left.speed;
      if (left.userId === actorUserId) return 1;
      if (right.userId === actorUserId) return -1;
      return left.userId.localeCompare(right.userId);
    });

  const nextActorUserId = sortedCandidates[0]?.userId || actorUserId;
  const opponentId = playerIds.find((userId) => userId !== actorUserId) || actorUserId;
  const extraTurn = nextActorUserId === actorUserId;

  const debug = {
    actorUserId,
    opponentId,
    nextActorUserId,
    ticks,
    threshold,
    energyPenalty: appliedPenalty,
    gauges: Object.fromEntries(playerIds.map((userId) => [userId, Number(gauges[userId]) || 0])),
    speeds: Object.fromEntries(playerIds.map((userId) => [userId, Math.max(1, Number(battle.players[userId]?.stats?.speed) || 1)])),
    reason: extraTurn
      ? "same_actor_retained_turn_due_to_higher_initiative"
      : "turn_passed_after_initiative_resolution",
  };

  battle.initiative = {
    threshold,
    gauges,
    lastActorUserId: actorUserId,
    lastTickCount: ticks,
    lastDebug: debug,
  };

  return {
    nextActorUserId,
    extraTurn,
    ...debug,
  };
}

module.exports = {
  BATTLE_HP_MULTIPLIER,
  MAX_POTIONS_PER_BATTLE,
  INITIATIVE_THRESHOLD,
  MAGIC_ENERGY_COST,
  rollDie,
  calculateBattleHp,
  normalizeChance,
  rollCriticalStrike,
  calculateDamage,
  calculateMagicDamage,
  resolveAttackTurn,
  resolveMagicTurn,
  resolvePotionTurn,
  decideStartingPlayer,
  createInitialInitiativeState,
  resolveNextTurnBySpeed,
};
