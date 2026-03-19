const { randomCoinflip } = require("../../../utils/helpers");
const { resolveElementalRelation } = require("../../../services/pokemonElementsService");

const BATTLE_HP_MULTIPLIER = 12.5;
const MAX_POTIONS_PER_BATTLE = 5;
const INITIATIVE_THRESHOLD = 100;
const MAGIC_ENERGY_COST = 50;

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

function calculateMagicDamage({ attackerAttack, magicElement, defenderElements = [], d10Roll, d6Roll }) {
  const attack = Math.max(1, Number(attackerAttack) || 1);
  const elemental = resolveElementalRelation({ attackElement: magicElement, defenderElements });
  const useDisadvantageDie = elemental.hasDisadvantage && !elemental.hasAdvantage;
  const rollSides = useDisadvantageDie ? 6 : 10;
  const rolledValue = useDisadvantageDie ? (d6Roll || rollDie(6)) : (d10Roll || rollDie(10));
  const normalDamage = attack + rolledValue;

  let finalDamage = normalDamage;
  let isCritical = false;
  let multiplier = 1;

  if (elemental.hasAdvantage) {
    multiplier = 2.0;
    isCritical = true;
    finalDamage = normalDamage * multiplier;
  } else if (elemental.hasDisadvantage) {
    multiplier = 0.7;
    finalDamage = normalDamage * multiplier;
  }

  return {
    rollSides,
    rollValue: rolledValue,
    normalDamage: Math.round(normalDamage),
    multiplier,
    finalDamage: Math.max(0, Math.round(finalDamage)),
    isCritical,
    elemental,
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

function resolveMagicTurn({ attacker, defender, magicEntry }) {
  const result = calculateMagicDamage({
    attackerAttack: attacker.stats.attack,
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
      const speed = Math.max(1, Number(battle.players[userId]?.stats?.speed) || 1);
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
  calculateDamage,
  calculateMagicDamage,
  resolveAttackTurn,
  resolveMagicTurn,
  resolvePotionTurn,
  decideStartingPlayer,
  createInitialInitiativeState,
  resolveNextTurnBySpeed,
};
