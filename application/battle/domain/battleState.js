const { calculateBattleHp, decideStartingPlayer, createInitialInitiativeState, resolveNextTurnBySpeed } = require("./battleEngine");
const { SKILL_ENERGY_MAX, ensureSkillEnergyState, regenerateSkillEnergy } = require("./skillEnergy");
const { getPokemonStars, formatPokemonStars } = require("../../../services/pokemonProgressionService");
const { normalizeElementList } = require("../../../services/elementType");

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

function readNumericCandidate(...candidates) {
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function normalizeChance(rawChance, cap = 0.95) {
  const numeric = Number(rawChance);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(Number(cap) || 0.95, normalized));
}

function resolveCritChance(pokemon) {
  const directCritChance = normalizeChance(
    readNumericCandidate(
      pokemon?.crit_chance,
      pokemon?.critChance,
      pokemon?.critical_chance,
      pokemon?.criticalChance,
      pokemon?.extra_stats?.crit_chance,
      pokemon?.extraStats?.critChance,
      pokemon?.battle_stats?.crit_chance,
      pokemon?.battleStats?.critChance,
    ),
    0.95,
  );
  if (directCritChance > 0) return directCritChance;
  const critLevel = readNumericCandidate(
    pokemon?.crit_level,
    pokemon?.critLevel,
    pokemon?.extra_stats?.crit_level,
    pokemon?.extraStats?.critLevel,
  );
  return getExtraChance(critLevel, 0.04, 0.4);
}

function resolveDodgeChance(pokemon) {
  const directDodgeChance = normalizeChance(
    readNumericCandidate(
      pokemon?.dodge_chance,
      pokemon?.dodgeChance,
      pokemon?.evade_chance,
      pokemon?.evadeChance,
      pokemon?.extra_stats?.dodge_chance,
      pokemon?.extraStats?.dodgeChance,
      pokemon?.battle_stats?.dodge_chance,
      pokemon?.battleStats?.dodgeChance,
    ),
    0.95,
  );
  if (directDodgeChance > 0) return directDodgeChance;
  const dodgeLevel = readNumericCandidate(
    pokemon?.dodge_level,
    pokemon?.dodgeLevel,
    pokemon?.extra_stats?.dodge_level,
    pokemon?.extraStats?.dodgeLevel,
  );
  return getExtraChance(dodgeLevel, 0.018, 0.18);
}

function resolveElementalChance(pokemon) {
  const directElementalChance = normalizeChance(
    readNumericCandidate(
      pokemon?.elemental_chance,
      pokemon?.elementalChance,
      pokemon?.elemental_efficiency,
      pokemon?.elementalEfficiency,
      pokemon?.extra_stats?.elemental_chance,
      pokemon?.extraStats?.elementalChance,
      pokemon?.battle_stats?.elemental_chance,
      pokemon?.battleStats?.elementalChance,
    ),
    0.95,
  );
  if (directElementalChance > 0) return directElementalChance;
  const elementalLevel = readNumericCandidate(
    pokemon?.elemental_level,
    pokemon?.elementalLevel,
    pokemon?.extra_stats?.elemental_level,
    pokemon?.extraStats?.elementalLevel,
  );
  return getExtraChance(elementalLevel, 0.03, 0.3);
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
    dodgeLevel: Math.max(0, Math.min(10, Number(readNumericCandidate(pokemon.dodge_level, pokemon.dodgeLevel)) || 0)),
    elementalLevel: Math.max(0, Math.min(10, Number(readNumericCandidate(pokemon.elemental_level, pokemon.elementalLevel)) || 0)),
    critChance: resolveCritChance(pokemon),
    dodgeChance: resolveDodgeChance(pokemon),
    elementalChance: resolveElementalChance(pokemon),
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
    critChance: Number(active?.stats?.critChance || 0),
    dodgeChance: Number(active?.stats?.dodgeChance || 0),
    elementalChance: Number(active?.stats?.elementalChance || 0),
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
