const { MAX_POTIONS_PER_BATTLE } = require("../domain/battleEngine");

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
    players: [
      buildPlayerViewModel(battle.challengerId, challenger, battle.initiative),
      buildPlayerViewModel(battle.challengedId, challenged, battle.initiative),
    ],
  };
}

function buildPlayerViewModel(userId, playerState, initiative) {
  return {
    userId,
    selectedPokemonName: playerState.selectedPokemon?.name || null,
    selectedPokemonTypes: playerState.selectedPokemon?.elementTypes || [],
    level: playerState.selectedPokemon?.level || null,
    stars: playerState.selectedPokemon?.stars || 0,
    starText: playerState.selectedPokemon?.starText || "-",
    hpCurrent: playerState.battleHp?.current ?? null,
    hpMax: playerState.battleHp?.max ?? null,
    attack: playerState.stats?.attack ?? null,
    magic: playerState.stats?.magic ?? playerState.stats?.attack ?? null,
    defense: playerState.stats?.defense ?? null,
    speed: playerState.stats?.speed ?? null,
    initiativeGauge: initiative?.gauges?.[userId] ?? null,
    initiativeThreshold: initiative?.threshold ?? null,
    potionsRemaining: Math.max(0, MAX_POTIONS_PER_BATTLE - (playerState.potionsUsed || 0)),
    magicCooldownRemaining: Math.max(0, playerState.magicCooldown?.blockedOwnTurnsRemaining || 0),
    magicSlots: Array.isArray(playerState.magicSlots) ? playerState.magicSlots : [],
  };
}

module.exports = {
  buildBattleViewModel,
};
