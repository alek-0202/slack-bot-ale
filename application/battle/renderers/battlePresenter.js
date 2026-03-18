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
    players: [
      buildPlayerViewModel(battle.challengerId, challenger),
      buildPlayerViewModel(battle.challengedId, challenged),
    ],
  };
}

function buildPlayerViewModel(userId, playerState) {
  return {
    userId,
    selectedPokemonName: playerState.selectedPokemon?.name || null,
    level: playerState.selectedPokemon?.level || null,
    hpCurrent: playerState.battleHp?.current ?? null,
    hpMax: playerState.battleHp?.max ?? null,
    attack: playerState.stats?.attack ?? null,
    defense: playerState.stats?.defense ?? null,
    potionsRemaining: MAX_POTIONS_PER_BATTLE - (playerState.potionsUsed || 0),
  };
}

module.exports = {
  buildBattleViewModel,
};
