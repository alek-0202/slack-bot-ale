const { ensureElementalState, addOrRefreshEffect } = require("./elementalRules");
const { applyHpDamage } = require("./damagePipeline");

function getOpponentUserIds(battle, actorId) {
  return Object.keys(battle.players || {}).filter((userId) => userId !== actorId);
}

function buildPlayerTargetRefs(playerState, userId, { includeBench = false, onlyAlive = true } = {}) {
  const team = Array.isArray(playerState?.team) && playerState.team.length
    ? playerState.team
    : (playerState?.selectedPokemon ? [{
      id: playerState.selectedPokemon.id,
      battleHp: playerState.battleHp,
    }] : []);

  return team
    .map((member, index) => ({
      userId,
      targetType: "pokemon",
      pokemonId: member.id,
      teamIndex: index,
      isActive: index === Number(playerState?.activeTeamIndex || 0),
      currentHp: Number(member?.battleHp?.current || 0),
    }))
    .filter((entry) => (includeBench ? true : entry.isActive))
    .filter((entry) => (onlyAlive ? entry.currentHp > 0 : true));
}

function buildSummonTargetRefs(playerState, userId, { onlyAlive = true } = {}) {
  const entities = playerState?.elementalState?.secondaryEntities || [];
  return entities
    .map((entity, index) => ({
      userId,
      targetType: "summon",
      entityId: entity.id,
      isActive: false,
      currentHp: Number(entity?.hpCurrent || 0),
      teamIndex: index,
    }))
    .filter((entry) => (onlyAlive ? entry.currentHp > 0 : true));
}

function resolveSkillTargets({
  battle,
  actorId,
  primaryDefenderId = null,
  targeting = {},
}) {
  const mode = String(targeting?.mode || "single");
  const includeBench = Boolean(targeting?.includeBench);
  const includeSecondaryEntities = Boolean(targeting?.includeSecondaryEntities);
  const allowSecondaryOutsideActive = Boolean(targeting?.allowSecondaryOutsideActive);
  const maxTargets = Math.max(1, Number(targeting?.maxTargets || 1));
  const opponentIds = getOpponentUserIds(battle, actorId);
  const allOpponentRefs = opponentIds.flatMap((userId) =>
    [
      ...buildPlayerTargetRefs(battle.players[userId], userId, {
        includeBench: includeBench || allowSecondaryOutsideActive,
        onlyAlive: true,
      }),
      ...(includeSecondaryEntities ? buildSummonTargetRefs(battle.players[userId], userId, { onlyAlive: true }) : []),
    ]);
  const activeOpponentRefs = opponentIds.flatMap((userId) =>
    buildPlayerTargetRefs(battle.players[userId], userId, { includeBench: false, onlyAlive: true }));

  const primaryCandidates = primaryDefenderId
    ? activeOpponentRefs.filter((entry) => entry.userId === primaryDefenderId)
    : activeOpponentRefs;
  const primaryTarget = primaryCandidates[0] || allOpponentRefs[0] || null;
  if (!primaryTarget) return [];

  if (mode === "single") return [primaryTarget];
  if (mode === "area") return allOpponentRefs.slice(0, maxTargets);

  const rest = allOpponentRefs.filter((entry) => !(entry.userId === primaryTarget.userId && entry.pokemonId === primaryTarget.pokemonId));
  if (mode === "chain" || mode === "splash") {
    return [primaryTarget, ...rest.slice(0, Math.max(0, maxTargets - 1))];
  }

  return [primaryTarget];
}

function applyDamageToTargetRef(battle, targetRef, damage) {
  let value = Math.max(0, Math.round(Number(damage || 0)));
  const player = battle.players?.[targetRef.userId];
  if (!player) return { damageApplied: 0, remainingHp: 0 };

  if (targetRef.targetType === "summon") {
    const entities = player?.elementalState?.secondaryEntities || [];
    const index = entities.findIndex((entity) => String(entity.id) === String(targetRef.entityId));
    if (index < 0) return { damageApplied: 0, remainingHp: 0 };
    value = Math.round(value * 1.1);
    if (targetRef.isAreaDamage) value = Math.round(value * 1.25);
    entities[index].hpCurrent = Math.max(0, Number(entities[index].hpCurrent || 0) - value);
    if (Number(entities[index].hpCurrent || 0) <= 0) {
      entities.splice(index, 1);
    }
    return {
      damageApplied: value,
      remainingHp: Number(entities[index]?.hpCurrent || 0),
      isActiveTarget: false,
    };
  }
  const team = Array.isArray(player.team) ? player.team : [];
  const index = team.findIndex((member) => Number(member.id) === Number(targetRef.pokemonId));
  if (index < 0) return { damageApplied: 0, remainingHp: 0 };

  const applyResult = applyHpDamage({ target: team[index], amount: value });
  if (index === Number(player.activeTeamIndex || 0) && player.battleHp) {
    player.battleHp.current = applyResult.remainingHp;
  }
  return {
    damageApplied: applyResult.damageApplied,
    remainingHp: Number(applyResult.remainingHp || 0),
    isActiveTarget: index === Number(player.activeTeamIndex || 0),
  };
}

function applyStatusEffectToTargetRef(battle, targetRef, effect) {
  const player = battle.players?.[targetRef.userId];
  if (!player) return null;
  ensureElementalState(player);
  return addOrRefreshEffect(player, effect);
}

module.exports = {
  resolveSkillTargets,
  applyDamageToTargetRef,
  applyStatusEffectToTargetRef,
};
