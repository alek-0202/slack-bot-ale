const { ENABLE_ELEMENTAL_SKILLS_BATTLE, getAvailableMagicActions, getSkillCooldownRemaining } = require("../domain/elementalRules");
const { MAX_POTIONS_PER_BATTLE } = require("../domain/battleEngine");

function resolveCurrentShield(playerState) {
  const effects = playerState?.elementalState?.effects || [];
  return effects
    .filter((effect) => Number(effect?.remainingRounds ?? 1) > 0 && effect?.shieldCurrentHp != null)
    .reduce((total, effect) => total + Math.max(0, Number(effect.shieldCurrentHp || 0)), 0);
}

function buildBattleViewModel(battle) {
  const challenger = battle.players[battle.challengerId];
  const challenged = battle.players[battle.challengedId];

  return {
    id: battle.id,
    platform: battle.platform,
    status: battle.status,
    round: battle.round,
    currentTurnUserId: battle.currentTurnUserId,
    challengerId: battle.challengerId,
    challengedId: battle.challengedId,
    initiative: battle.initiative || null,
    pvpEconomy: {
      entryFee: Number(battle?.metadata?.pvpEntryFee || 0),
      winnerPrize: Number(battle?.metadata?.pvpWinPrize || 0),
    },
    players: [
      buildPlayerViewModel(battle.challengerId, challenger, battle.initiative, battle),
      buildPlayerViewModel(battle.challengedId, challenged, battle.initiative, battle),
    ],
  };
}

function buildPlayerViewModel(userId, playerState, initiative, battle) {
  return {
    userId,
    activePokemonId: playerState.selectedPokemon?.id || null,
    selectedPokemonName: playerState.selectedPokemon?.name || null,
    selectedPokemonTypes: playerState.selectedPokemon?.elementTypes || [],
    selectedPokemonSpriteUrl: playerState.selectedPokemon?.spriteUrl || null,
    level: playerState.selectedPokemon?.level || null,
    stars: playerState.selectedPokemon?.stars || 0,
    starText: playerState.selectedPokemon?.starText || "-",
    hpCurrent: playerState.battleHp?.current ?? null,
    hpMax: playerState.battleHp?.max ?? null,
    shieldCurrent: resolveCurrentShield(playerState),
    attack: playerState.stats?.attack ?? null,
    magic: playerState.stats?.magic ?? playerState.stats?.attack ?? null,
    defense: playerState.stats?.defense ?? null,
    speed: playerState.stats?.speed ?? null,
    initiativeGauge: initiative?.gauges?.[userId] ?? null,
    initiativeThreshold: initiative?.threshold ?? null,
    energyCurrent: playerState?.skillEnergy ?? null,
    potionsRemaining: Math.max(0, MAX_POTIONS_PER_BATTLE - (playerState.potionsUsed || 0)),
    magicCooldownRemaining: Math.max(0, playerState.magicCooldown?.blockedOwnTurnsRemaining || 0),
    magicSlots: Array.isArray(playerState.magicSlots) ? playerState.magicSlots : [],
    magicActions: getAvailableMagicActions(playerState),
    elementalCooldowns: Object.fromEntries(
      getAvailableMagicActions(playerState)
        .filter((entry) => entry.kind === "elemental")
        .map((entry) => [entry.id, getSkillCooldownRemaining(playerState, entry.id)]),
    ),
    activeStatuses: ENABLE_ELEMENTAL_SKILLS_BATTLE ? (playerState.elementalState?.statuses || [])
      .filter((status) => Number(status?.remainingRounds ?? status?.durationTurnsRemaining ?? 1) > 0)
      .filter((status) => status?.stacks == null || Number(status.stacks) > 0)
      .map((status) => ({
        id: status.id,
        name: status.name,
        stacks: status.stacks,
        remainingRounds: status.remainingRounds,
      })) : [],
    activeEffects: ENABLE_ELEMENTAL_SKILLS_BATTLE ? (playerState.elementalState?.effects || []).map((effect) => ({
      id: effect.id,
      name: effect.name,
      chargesRemaining: effect.chargesRemaining,
      remainingRounds: effect.remainingRounds,
    })) : [],
    reserves: (playerState.team || [])
      .map((member, index) => ({
        id: member.id,
        name: member.name,
        hpCurrent: Number(member?.battleHp?.current || 0),
        hpMax: Number(member?.battleHp?.max || 0),
        isActive: index === Number(playerState.activeTeamIndex || 0),
        isAlive: Number(member?.battleHp?.current || 0) > 0,
      }))
      .filter((member) => !member.isActive),
  };
}

module.exports = {
  buildBattleViewModel,
};
