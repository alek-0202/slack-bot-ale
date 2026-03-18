const { calculateBattleHp, decideStartingPlayer } = require("./battleEngine");

const BATTLE_STATUS = {
  PENDING: "pending",
  SELECTING: "selecting",
  ACTIVE: "active",
  FINISHED: "finished",
  DECLINED: "declined",
};

const INVITE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
};

const SELECTION_STATUS = {
  WAITING_CHALLENGER: "waiting_challenger",
  WAITING_CHALLENGED: "waiting_challenged",
  COMPLETE: "complete",
};

function createPlayerState(userId) {
  return {
    userId,
    selectedPokemon: null,
    stats: null,
    battleHp: null,
    potionsUsed: 0,
    magicCooldown: 0,
  };
}

function createBattle({ battleId, channelId, challengerId, challengedId, platform = "slack", metadata = {} }) {
  return {
    id: battleId || channelId,
    platform,
    channelId,
    challengerId,
    challengedId,
    status: BATTLE_STATUS.PENDING,
    inviteStatus: INVITE_STATUS.PENDING,
    selectionStatus: SELECTION_STATUS.WAITING_CHALLENGER,
    currentTurnUserId: null,
    round: 0,
    startedAt: null,
    finishedAt: null,
    metadata,
    players: {
      [challengerId]: createPlayerState(challengerId),
      [challengedId]: createPlayerState(challengedId),
    },
  };
}

function isBattleOpen(battle) {
  return Boolean(battle) && [BATTLE_STATUS.PENDING, BATTLE_STATUS.SELECTING, BATTLE_STATUS.ACTIVE].includes(battle.status);
}

function acceptInvite(battle) {
  battle.status = BATTLE_STATUS.SELECTING;
  battle.inviteStatus = INVITE_STATUS.ACCEPTED;
  battle.selectionStatus = SELECTION_STATUS.WAITING_CHALLENGER;
  return battle;
}

function declineInvite(battle) {
  battle.status = BATTLE_STATUS.DECLINED;
  battle.inviteStatus = INVITE_STATUS.DECLINED;
  battle.finishedAt = new Date().toISOString();
  return battle;
}

function getExpectedPickerId(battle) {
  return battle.selectionStatus === SELECTION_STATUS.WAITING_CHALLENGER
    ? battle.challengerId
    : battle.challengedId;
}

function assignSelectedPokemon(battle, userId, pokemon) {
  const playerState = battle.players[userId];
  playerState.selectedPokemon = {
    id: pokemon.id,
    speciesId: pokemon.species_id,
    name: pokemon.pokemon_species?.name || `Pokémon #${pokemon.species_id}`,
    level: pokemon.level,
    spriteUrl: pokemon.pokemon_species?.sprite_url || null,
    baseHp: Number(pokemon.hp) || 1,
  };
  playerState.stats = {
    attack: Number(pokemon.attack) || 1,
    defense: Number(pokemon.defense) || 0,
    hp: Number(pokemon.hp) || 1,
  };

  const hpMax = calculateBattleHp(playerState.stats.hp);
  playerState.battleHp = {
    base: playerState.stats.hp,
    max: hpMax,
    current: hpMax,
  };

  return playerState;
}

function advanceSelectionState(battle) {
  battle.selectionStatus = battle.selectionStatus === SELECTION_STATUS.WAITING_CHALLENGER
    ? SELECTION_STATUS.WAITING_CHALLENGED
    : SELECTION_STATUS.COMPLETE;
  return battle;
}

function startBattle(battle) {
  const { result, starter } = decideStartingPlayer(battle.challengerId, battle.challengedId);
  battle.currentTurnUserId = starter;
  battle.round = 1;
  battle.status = BATTLE_STATUS.ACTIVE;
  battle.selectionStatus = SELECTION_STATUS.COMPLETE;
  battle.startedAt = new Date().toISOString();

  return {
    battle,
    starter,
    coinflip: result,
  };
}

function getOpponentId(battle, actorId) {
  return actorId === battle.challengerId ? battle.challengedId : battle.challengerId;
}

function passTurn(battle) {
  battle.currentTurnUserId = getOpponentId(battle, battle.currentTurnUserId);
  battle.round += 1;
  return battle;
}

function finishBattle(battle, winnerId) {
  battle.status = BATTLE_STATUS.FINISHED;
  battle.finishedAt = new Date().toISOString();
  return {
    battle,
    winnerId,
    loserId: getOpponentId(battle, winnerId),
  };
}

module.exports = {
  BATTLE_STATUS,
  INVITE_STATUS,
  SELECTION_STATUS,
  createPlayerState,
  createBattle,
  isBattleOpen,
  acceptInvite,
  declineInvite,
  getExpectedPickerId,
  assignSelectedPokemon,
  advanceSelectionState,
  startBattle,
  getOpponentId,
  passTurn,
  finishBattle,
};
