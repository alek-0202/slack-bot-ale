const { calculateBattleHp, decideStartingPlayer, createInitialInitiativeState, resolveNextTurnBySpeed } = require("./battleEngine");
const { SKILL_ENERGY_MAX, ensureSkillEnergyState, regenerateSkillEnergy } = require("./skillEnergy");
const { getPokemonStars, formatPokemonStars } = require("../../../services/pokemonProgressionService");
const { normalizeElementList } = require("../../../services/elementType");
const { onBattleStart } = require("./legendaryPassiveEngine");

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
    magicCooldown: {
      blockedOwnTurnsRemaining: 0,
      lastAppliedAtRound: null,
      lastMagicName: null,
    },
    magicSlots: [],
    characteristicSlots: [],
    elementalState: {
      statuses: [],
      effects: [],
      skillCooldowns: {},
    },
    team: [],
    activeTeamIndex: 0,
    skillEnergy: SKILL_ENERGY_MAX,
    skillEnergyMax: SKILL_ENERGY_MAX,
    legendaryRuntime: {},
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
    initiative: null,
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

function getExtraChance(level, perPoint, cap) {
  const safeLevel = Math.max(0, Math.min(10, Number(level) || 0));
  return Math.max(0, Math.min(cap, safeLevel * perPoint));
}

function normalizeChance(rawChance, cap = 0.95) {
  const numeric = Number(rawChance);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(Number(cap) || 0.95, normalized));
}

function resolveCritChance(pokemon) {
  const directCritChance = normalizeChance(
    pokemon?.crit_chance ?? pokemon?.critChance ?? pokemon?.critical_chance,
    0.95,
  );
  if (directCritChance > 0) return directCritChance;
  return getExtraChance(pokemon?.crit_level, 0.04, 0.4);
}

function getExpectedPickerId(battle) {
  return battle.selectionStatus === SELECTION_STATUS.WAITING_CHALLENGER
    ? battle.challengerId
    : battle.challengedId;
}

function buildTeamMemberFromPokemon(pokemon) {
  const level = Number(pokemon.level) || 1;
  const stats = {
    attack: Number(pokemon.attack) || 1,
    magic: Number(pokemon.magic) || Number(pokemon.attack) || 1,
    defense: Number(pokemon.defense) || 0,
    hp: Number(pokemon.hp) || 1,
    speed: Number(pokemon.speed) || 1,
    critLevel: Math.max(0, Math.min(10, Number(pokemon.crit_level) || 0)),
    dodgeLevel: Math.max(0, Math.min(10, Number(pokemon.dodge_level) || 0)),
    elementalLevel: Math.max(0, Math.min(10, Number(pokemon.elemental_level) || 0)),
    critChance: resolveCritChance(pokemon),
    dodgeChance: getExtraChance(pokemon.dodge_level, 0.018, 0.18),
    elementalChance: getExtraChance(pokemon.elemental_level, 0.03, 0.3),
  };

  const hpMax = calculateBattleHp(stats.hp);
  const rawPersistentCurrentHp = pokemon.current_hp;
  const persistentCurrentHp = rawPersistentCurrentHp == null
    ? Math.max(1, Number(pokemon.hp) || 1)
    : Math.max(0, Number(rawPersistentCurrentHp) || 0);
  const persistentMaxHp = Math.max(1, Number(pokemon.hp) || 1);

  return {
    id: pokemon.id,
    speciesId: pokemon.species_id,
    name: pokemon.pokemon_species?.name || `Pokémon #${pokemon.species_id}`,
    level,
    stars: getPokemonStars(level),
    starText: formatPokemonStars(level),
    spriteUrl: pokemon.pokemon_species?.sprite_url || null,
    elementTypes: normalizeElementList(pokemon.pokemon_species?.element_types || [], { includeUnknown: false }),
    stats,
    magicSlots: Array.isArray(pokemon.magicSlots) ? pokemon.magicSlots.filter((entry) => entry?.kind !== "characteristic") : [],
    characteristicSlots: Array.isArray(pokemon.magicSlots) ? pokemon.magicSlots.filter((entry) => entry?.kind === "characteristic") : [],
    battleHp: {
      base: stats.hp,
      max: hpMax,
      current: Math.max(0, Math.min(hpMax, Math.round((persistentCurrentHp / persistentMaxHp) * hpMax))),
    },
    legendaryPassive: pokemon.legendary_passive_id ? {
      passiveId: pokemon.legendary_passive_id,
      passiveCode: pokemon.legendary_passive_code,
      efficiency: Number(pokemon.legendary_passive_efficiency || 0),
      values: pokemon.legendary_passive_values || {},
    } : null,
  };
}

function syncPlayerActiveState(playerState) {
  const active = playerState.team[playerState.activeTeamIndex] || null;
  playerState.selectedPokemon = active ? {
    id: active.id,
    speciesId: active.speciesId,
    name: active.name,
    level: active.level,
    stars: active.stars,
    starText: active.starText,
    spriteUrl: active.spriteUrl,
    elementTypes: active.elementTypes,
    baseHp: active.stats.hp,
    legendaryPassive: active.legendaryPassive || null,
  } : null;
  playerState.stats = active?.stats || null;
  playerState.battleHp = active?.battleHp || null;
  playerState.magicSlots = active?.magicSlots || [];
  playerState.characteristicSlots = active?.characteristicSlots || [];
  playerState.elementalState = playerState.elementalState || { statuses: [], effects: [], skillCooldowns: {} };
  return playerState;
}

function assignSelectedPokemon(battle, userId, pokemon) {
  const playerState = battle.players[userId];
  playerState.team = [buildTeamMemberFromPokemon(pokemon)];
  playerState.activeTeamIndex = 0;
  return syncPlayerActiveState(playerState);
}

function assignSelectedPokemonTeam(battle, userId, pokemons = []) {
  const playerState = battle.players[userId];
  playerState.team = pokemons.map((pokemon) => buildTeamMemberFromPokemon(pokemon));
  playerState.activeTeamIndex = 0;
  playerState.potionsUsed = 0;
  playerState.magicCooldown = {
    blockedOwnTurnsRemaining: 0,
    lastAppliedAtRound: null,
    lastMagicName: null,
  };
  return syncPlayerActiveState(playerState);
}

function hasAnyAlivePokemon(playerState) {
  return (playerState?.team || []).some((member) => Number(member?.battleHp?.current || 0) > 0);
}

function autoSwitchToNextAlivePokemon(playerState) {
  const nextIndex = (playerState.team || []).findIndex((member) => Number(member?.battleHp?.current || 0) > 0);
  if (nextIndex < 0) return false;
  playerState.activeTeamIndex = nextIndex;
  syncPlayerActiveState(playerState);
  return true;
}

function switchActivePokemonById(playerState, pokemonId) {
  const targetIndex = (playerState.team || []).findIndex((member) => Number(member.id) === Number(pokemonId));
  if (targetIndex < 0) return { ok: false, reason: "pokemon_not_in_team" };
  if (targetIndex === playerState.activeTeamIndex) return { ok: false, reason: "pokemon_already_active" };
  if (Number(playerState.team[targetIndex]?.battleHp?.current || 0) <= 0) return { ok: false, reason: "pokemon_fainted" };
  playerState.activeTeamIndex = targetIndex;
  syncPlayerActiveState(playerState);
  return { ok: true };
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
  battle.initiative = createInitialInitiativeState({
    challengerId: battle.challengerId,
    challengedId: battle.challengedId,
    starter,
  });


  battle.metadata = battle.metadata || {};
  if (!battle.metadata.energyByUserId) {
    battle.metadata.energyByUserId = {
      [battle.challengerId]: 300,
      [battle.challengedId]: 300,
    };
  }

  ensureSkillEnergyState(battle.players[battle.challengerId]);
  ensureSkillEnergyState(battle.players[battle.challengedId]);
  onBattleStart({ battle });

  return {
    battle,
    starter,
    coinflip: result,
  };
}

function getOpponentId(battle, actorId) {
  return actorId === battle.challengerId ? battle.challengedId : battle.challengerId;
}

function passTurn(battle, actorUserId = battle.currentTurnUserId, options = {}) {
  const playerState = battle.players[actorUserId];
  if (
    playerState?.magicCooldown?.blockedOwnTurnsRemaining > 0 &&
    playerState?.magicCooldown?.lastAppliedAtRound !== battle.round
  ) {
    playerState.magicCooldown.blockedOwnTurnsRemaining = Math.max(
      0,
      Number(playerState.magicCooldown.blockedOwnTurnsRemaining || 0) - 1,
    );
  }

  const forcedNextActorUserId = options.forceNextActorUserId || null;
  if (forcedNextActorUserId) {
    const initiativeResult = {
      actorUserId,
      nextActorUserId: forcedNextActorUserId,
      extraTurn: false,
      forcedTurnPass: true,
      reason: 'turn_forced_to_opponent',
      energyPenalty: Math.max(0, Number(options.energyPenalty) || 0),
    };
    battle.currentTurnUserId = forcedNextActorUserId;
    battle.round += 1;
    for (const player of Object.values(battle.players || {})) {
      regenerateSkillEnergy(player, battle);
    }
    return initiativeResult;
  }

  const initiativeResult = resolveNextTurnBySpeed({ battle, actorUserId, energyPenalty: options.energyPenalty });
  battle.currentTurnUserId = initiativeResult.nextActorUserId;
  battle.round += 1;
  for (const player of Object.values(battle.players || {})) {
    regenerateSkillEnergy(player, battle);
  }
  return initiativeResult;
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
  assignSelectedPokemonTeam,
  hasAnyAlivePokemon,
  autoSwitchToNextAlivePokemon,
  switchActivePokemonById,
  advanceSelectionState,
  startBattle,
  getOpponentId,
  passTurn,
  finishBattle,
};
