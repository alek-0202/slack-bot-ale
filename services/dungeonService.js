const { createBattle, assignSelectedPokemon, startBattle } = require('../application/battle/domain/battleState');
const { resolveBattleTurn } = require('../application/battle/domain/turnResolver');
const { BATTLE_ACTION, validateTurnAction } = require('../application/battle/domain/actionResolver');
const { calculatePokemonStats } = require('./pokemonStatsService');
const { getAllSpecies, getUserPokemonById, getUserPokemons, insertUserPokemon } = require('./pokemonService');
const { getPokemonMagicLoadout, buildMagicEntriesFromElements } = require('./pokemonMagicService');
const { assertPokemonAvailableForAction, persistBattleHp, isPokemonInActiveBattle } = require('./healingStationService');
const { getSupabaseClient } = require('../database/supabase');
const { createUserIfMissing, getUser } = require('./userService');
const { addItem } = require('./inventoryService');
const { grantAccountXp } = require('./accountProgressionService');
const { consumeDungeonEnergy } = require('./energyService');
const { formatGold } = require('../utils/gold');
const { createLogger } = require('../utils/logger');
const battleStore = require('./battleStateStore');

const FARM_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];
const DUNGEON_ENEMY_USER_ID = '__dungeon_enemy__';
const DUNGEON_ALLOWED_ENEMY_RARITIES = new Set(['common', 'uncommon', 'rare', 'epic']);
const DUNGEON_REWARDS = {
  daily_normal: { gold: 3000, accountXp: 500 },
  daily_hard: { gold: 5000, accountXp: 1500 },
};
const DAILY_CHANCES = {
  normal: { common: 70, uncommon: 15, rare: 10, epic: 5 },
  hard: { common: 30, uncommon: 40, rare: 20, epic: 7, legendary: 2, mythical: 1 },
};
const DAILY_DUNGEON_ENABLED = false;
const logger = createLogger('service:dungeon');
const dungeonProcessingLocks = new Set();

function getDungeonFarmList() { return [...FARM_LEVELS]; }

function mapDungeonFailureReason(reason) {
  return {
    invalid_dungeon_level: 'Sala de Farm inválida.',
    invalid_daily_mode: 'Modo diário inválido.',
    pokemon_not_owned: 'Esse Pokémon não pertence a você.',
    pokemon_in_healing_station: 'Pokémon na heal station não pode entrar em dungeons.',
    pokemon_fainted: 'Esse Pokémon está com HP zerado.',
    pokemon_battle_unavailable: 'Esse Pokémon está marcado como indisponível para batalha (use !battleon).',
    pokemon_in_active_battle: 'Esse Pokémon já está em outra batalha ou sessão.',
    already_used_today: 'Você já usou essa dungeon diária hoje.',
    daily_disabled: 'Dungeon diária em manutenção.',
    insufficient_energy: 'Energia insuficiente para entrar na dungeon farm.',
    battle_not_found: 'Não encontrei uma batalha de dungeon ativa para esse botão.',
    reward_already_granted: 'Essa dungeon já foi finalizada anteriormente.',
    battle_not_active: 'A batalha da dungeon já não está mais ativa.',
    actor_not_in_battle: 'Você não participa desta batalha de dungeon.',
    not_actor_turn: 'Ainda não é o seu turno na dungeon.',
    unsupported_action: 'Ação de dungeon inválida.',
    magic_not_found: 'Não encontrei essa magia no loadout atual.',
    magic_on_cooldown: 'Sua magia ainda está em cooldown.',
    elemental_skill_on_cooldown: 'Sua habilidade elemental ainda está em cooldown.',
    insufficient_skill_energy: 'Energia insuficiente para usar essa habilidade.',
    target_not_water_nature: 'Essa habilidade só pode ser aplicada em alvo de natureza Água.',
    invalid_target: 'Alvo inválido para essa habilidade.',
    characteristic_skill_requires_level_50: 'Magia característica exige Pokémon nível 50.',
    defeat: 'Seu Pokémon foi derrotado na dungeon.',
  }[reason] || 'Não foi possível iniciar a dungeon agora.';
}

async function validateDungeonPokemonSelection({ slackUserId, pokemonId }) {
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);
  if (!pokemon) return { ok: false, reason: 'pokemon_not_owned' };

  const availability = await assertPokemonAvailableForAction({ slackUserId, pokemonId, action: 'dungeon' });
  if (!availability.ok) return { ok: false, reason: availability.reason || 'pokemon_in_healing_station' };

  if (pokemon.is_battle_available === false) return { ok: false, reason: 'pokemon_battle_unavailable', pokemon };
  if (Number(pokemon.current_hp) <= 0) return { ok: false, reason: 'pokemon_fainted', pokemon };
  if (isPokemonInActiveBattle({ slackUserId, pokemonId })) return { ok: false, reason: 'pokemon_in_active_battle', pokemon };

  return { ok: true, pokemon };
}

async function getEligibleDungeonPokemons(slackUserId) {
  const pokemons = await getUserPokemons(slackUserId);
  const eligible = [];

  for (const pokemon of pokemons) {
    const validation = await validateDungeonPokemonSelection({ slackUserId, pokemonId: pokemon.id });
    if (validation.ok) eligible.push(validation.pokemon);
    if (eligible.length >= 25) break;
  }

  return eligible;
}

function getFarmReward(level) {
  const safe = Number(level);
  if (safe === 60) {
    return { gold: 50000, accountXp: 6000, ancientBookQty: 50, pokeballCQty: 10, pokemonEssenceQty: 1000 };
  }
  const pokeballCQty = safe <= 30
    ? (1 + Math.floor(Math.random() * 3))
    : (2 + Math.floor(Math.random() * 4));
  return { gold: 300 * safe, accountXp: 100 * safe, ancientBookQty: safe >= 25 ? 2 : 1, pokeballCQty };
}

function getFarmPokeballRewardRange(level) {
  const safe = Number(level);
  return safe <= 30 ? { min: 1, max: 3 } : { min: 2, max: 5 };
}

function weightedPickByConfiguredChances(speciesList, chances) {
  const pool = speciesList.filter((species) => chances[species.rarity] > 0);
  const total = pool.reduce((sum, species) => sum + chances[species.rarity], 0);
  let roll = Math.random() * total;
  for (const species of pool) {
    roll -= chances[species.rarity];
    if (roll <= 0) return species;
  }
  return pool[pool.length - 1] || null;
}

const DUNGEON_PVE_RELEVANT_STATS = ['attack', 'magic', 'defense', 'hp', 'speed'];
const DUNGEON_RARITY_STAT_MODIFIER = {
  common: 1.2,
  uncommon: 1.2,
  rare: 1,
  epic: 1,
};

function getDungeonEnemyStatModifier(rarity) {
  return DUNGEON_RARITY_STAT_MODIFIER[String(rarity || '').toLowerCase()] || 1;
}

function balanceDungeonEnemyStats(stats, rarity) {
  const modifier = getDungeonEnemyStatModifier(rarity);
  return {
    modifier,
    baseStats: { ...stats },
    relevantStats: [...DUNGEON_PVE_RELEVANT_STATS],
    stats: Object.fromEntries(Object.entries(stats).map(([key, value]) => {
      if (!DUNGEON_PVE_RELEVANT_STATS.includes(key)) return [key, value];
      const numericValue = Number(value) || 0;
      return [key, Math.max(1, Math.floor(numericValue * modifier))];
    })),
  };
}

function filterDungeonEnemySpecies(speciesList = []) {
  return speciesList.filter((species) => DUNGEON_ALLOWED_ENEMY_RARITIES.has(String(species?.rarity || '').toLowerCase()));
}

function pickDungeonEnemySpecies(speciesList = [], options = {}) {
  const onlyRarity = options.onlyRarity ? String(options.onlyRarity).toLowerCase() : null;
  const eligibleSpecies = filterDungeonEnemySpecies(speciesList).filter((species) => !onlyRarity || String(species?.rarity || "").toLowerCase() === onlyRarity);
  if (!eligibleSpecies.length) return null;
  return eligibleSpecies[Math.floor(Math.random() * eligibleSpecies.length)] || null;
}

function buildEnemyPokemon(species, level, options = {}) {
  const baseStats = calculatePokemonStats({ species, level });
  const balance = balanceDungeonEnemyStats(baseStats, species?.rarity);
  const stats = { ...balance.stats };
  if (options.hpBuffPercent || options.statBuffPercent) {
    const statBuff = Number(options.statBuffPercent || 0);
    const hpBuff = Number(options.hpBuffPercent || 0);
    stats.attack = Math.max(1, Math.floor(stats.attack * (1 + statBuff)));
    stats.magic = Math.max(1, Math.floor(stats.magic * (1 + statBuff)));
    stats.defense = Math.max(1, Math.floor(stats.defense * (1 + statBuff)));
    stats.speed = Math.max(1, Math.floor(stats.speed * (1 + statBuff)));
    stats.hp = Math.max(1, Math.floor(stats.hp * (1 + hpBuff)));
  }

  return {
    id: `enemy-${species.id}-${level}-${Math.random().toString(36).slice(2, 7)}`,
    species_id: species.id,
    level,
    attack: stats.attack,
    magic: stats.magic,
    defense: stats.defense,
    hp: stats.hp,
    current_hp: stats.hp,
    speed: stats.speed,
    pokemon_species: species,
    magicSlots: buildMagicEntriesFromElements(species.element_types || []),
    pveBalance: balance,
  };
}

function decideAiAction(playerState) {
  const availableMagic = Array.isArray(playerState?.magicSlots) ? playerState.magicSlots : [];
  const isMagicBlocked = Number(playerState?.magicCooldown?.blockedOwnTurnsRemaining) > 0;

  if (!isMagicBlocked && availableMagic.length > 0) {
    return { actionType: BATTLE_ACTION.MAGIC, actionPayload: { magicSlot: availableMagic[0].slot } };
  }

  return { actionType: BATTLE_ACTION.ATTACK, actionPayload: {} };
}

function buildDungeonBattleChannelId(slackUserId) {
  return `dungeon:${slackUserId}`;
}

function createDungeonMetadata({ slackUserId, mode, playerPokemonId, level = null, dailyMode = null, reward = null, dailyEntry = null }) {
  return {
    mode: 'dungeon',
    dungeonType: mode,
    slackUserId,
    playerPokemonId: Number(playerPokemonId),
    dungeonLevel: level == null ? null : Number(level),
    dailyMode,
    reward,
    dailyEntry,
    rewardsGranted: false,
    rewardTransactionType: mode === 'farm' ? 'dungeon_farm_reward' : `dungeon_daily_${dailyMode}_reward`,
    totalWaves: 1,
    currentWave: 1,
  };
}

function createDungeonBattle({ slackUserId, playerPokemon, enemyPokemon, metadata }) {
  const battle = createBattle({
    battleId: `dungeon:${slackUserId}:${Date.now()}`,
    channelId: buildDungeonBattleChannelId(slackUserId),
    challengerId: slackUserId,
    challengedId: DUNGEON_ENEMY_USER_ID,
    metadata,
  });

  assignSelectedPokemon(battle, slackUserId, playerPokemon);
  assignSelectedPokemon(battle, DUNGEON_ENEMY_USER_ID, enemyPokemon);
  battle.players[DUNGEON_ENEMY_USER_ID].potionsUsed = 999;
  startBattle(battle);
  return battle;
}

function createDungeonStartContext({ slackUserId, pokemonId, mode, level = null, dailyMode = null }) {
  return {
    file: 'services/dungeonService.js',
    slackUserId,
    pokemonId,
    dungeonMode: mode,
    dungeonLevel: level,
    dailyMode,
  };
}

async function persistPlayerBattleHp(slackUserId, playerState) {
  await persistBattleHp({
    slackUserId,
    pokemonId: playerState.selectedPokemon.id,
    hpStat: playerState.stats.hp,
    battleHpCurrent: playerState.battleHp.current,
    battleHpMax: playerState.battleHp.max,
  });
}

async function grantDungeonRewards({ slackUserId, reward, transactionType, capturedSpecies = null, enemyLevel = null }) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const goldPayload = {
    p_slack_user_id: slackUserId,
    p_amount: Number(reward.gold) || 0,
    p_transaction_type: transactionType,
  };

  logger.info('Iniciando pipeline de recompensa da dungeon', {
    file: 'services/dungeonService.js',
    method: 'grantDungeonRewards',
    slackUserId,
    transactionType,
    reward,
    rpcName: 'apply_gold_transaction',
    rpcPayload: goldPayload,
  });

  const { data: goldData, error: goldError } = await supabase.rpc('apply_gold_transaction', goldPayload);
  if (goldError) {
    logger.error('Erro na RPC de recompensa apply_gold_transaction', {
      file: 'services/dungeonService.js',
      method: 'grantDungeonRewards',
      rpcName: 'apply_gold_transaction',
      slackUserId,
      transactionType,
      reward,
      rpcPayload: goldPayload,
      postgresMessage: goldError.message,
      postgresDetails: goldError.details,
      postgresHint: goldError.hint,
      postgresCode: goldError.code,
      error: goldError,
    });
    throw goldError;
  }

  logger.info('RPC apply_gold_transaction concluída', {
    file: 'services/dungeonService.js',
    method: 'grantDungeonRewards',
    rpcName: 'apply_gold_transaction',
    slackUserId,
    transactionType,
    reward,
    rpcPayload: goldPayload,
    rpcResult: goldData,
    grantStatus: 'gold_granted',
  });

  const xpResult = await grantAccountXp(slackUserId, reward.accountXp, transactionType);
  logger.info('RPC grant_account_xp concluída no pipeline da dungeon', {
    file: 'services/dungeonService.js',
    method: 'grantDungeonRewards',
    rpcName: 'grant_account_xp',
    slackUserId,
    transactionType,
    grantedXp: reward.accountXp,
    rpcResult: xpResult,
    grantStatus: 'account_xp_granted',
  });

  const items = [];
  if (reward.ancientBookQty) {
    logger.info('Adicionando item de recompensa da dungeon', {
      file: 'services/dungeonService.js',
      method: 'grantDungeonRewards',
      rpcName: 'upsert_user_item',
      slackUserId,
      itemKey: 'ancient_book',
      quantity: reward.ancientBookQty,
    });
    const itemResult = await addItem(slackUserId, 'ancient_book', reward.ancientBookQty);
    items.push(itemResult);
    logger.info('RPC upsert_user_item concluída no pipeline da dungeon', {
      file: 'services/dungeonService.js',
      method: 'grantDungeonRewards',
      rpcName: 'upsert_user_item',
      slackUserId,
      itemKey: 'ancient_book',
      quantity: reward.ancientBookQty,
      rpcResult: itemResult,
      grantStatus: 'item_granted',
    });
  }
  if (reward.pokeballCQty) {
    logger.info('Adicionando item de recompensa da dungeon', {
      file: 'services/dungeonService.js',
      method: 'grantDungeonRewards',
      rpcName: 'upsert_user_item',
      slackUserId,
      itemKey: 'pokeball_c',
      quantity: reward.pokeballCQty,
    });
    const itemResult = await addItem(slackUserId, 'pokeball_c', reward.pokeballCQty);
    items.push(itemResult);
    logger.info('RPC upsert_user_item concluída no pipeline da dungeon', {
      file: 'services/dungeonService.js',
      method: 'grantDungeonRewards',
      rpcName: 'upsert_user_item',
      slackUserId,
      itemKey: 'pokeball_c',
      quantity: reward.pokeballCQty,
      rpcResult: itemResult,
      grantStatus: 'item_granted',
    });
  }

  if (reward.pokemonEssenceQty) {
    const user = await getUser(slackUserId);
    const currentEssence = Math.max(0, Number(user?.pokemonEssence || 0));
    const { error: essenceError } = await supabase
      .from("users")
      .update({ pokemon_essence: currentEssence + Number(reward.pokemonEssenceQty || 0) })
      .eq("slack_user_id", slackUserId);
    if (essenceError) throw essenceError;
  }

  let captured = null;
  if (capturedSpecies) {
    const stats = calculatePokemonStats({ species: capturedSpecies, level: enemyLevel || 1 });
    captured = await insertUserPokemon({ slackUserId, speciesId: capturedSpecies.id, level: enemyLevel || 1, shiny: false, stats, source: transactionType });
    logger.info('Pokémon de recompensa da dungeon persistido', {
      file: 'services/dungeonService.js',
      method: 'grantDungeonRewards',
      slackUserId,
      transactionType,
      capturedSpeciesId: capturedSpecies.id,
      enemyLevel: enemyLevel || 1,
      capturedPokemonId: captured?.id || null,
      grantStatus: 'captured_reward_granted',
    });
  }

  return { goldReward: formatGold(reward.gold), xpResult, items, captured, goldTransaction: Array.isArray(goldData) ? goldData[0] : goldData };
}

async function ensureDailyEntry(slackUserId, mode, metadata = {}) {
  const supabase = getSupabaseClient();
  logger.info('Chamando RPC de entrada diária da dungeon', {
    file: 'services/dungeonService.js',
    method: 'ensureDailyEntry',
    rpcName: 'claim_daily_dungeon_entry',
    slackUserId,
    mode,
    metadata,
  });

  const { data, error } = await supabase.rpc('claim_daily_dungeon_entry', {
    p_slack_user_id: slackUserId,
    p_mode: mode,
    p_metadata: metadata,
  });

  if (error) {
    logger.error('Erro na RPC claim_daily_dungeon_entry', {
      file: 'services/dungeonService.js',
      method: 'ensureDailyEntry',
      rpcName: 'claim_daily_dungeon_entry',
      slackUserId,
      mode,
      metadata,
      postgresMessage: error.message,
      postgresDetails: error.details,
      postgresHint: error.hint,
      postgresCode: error.code,
      error,
    });
    if (String(error.message || '').includes('já usada hoje')) {
      return { ok: false, reason: 'already_used_today' };
    }
    throw error;
  }

  logger.info('RPC claim_daily_dungeon_entry concluída', {
    file: 'services/dungeonService.js',
    method: 'ensureDailyEntry',
    rpcName: 'claim_daily_dungeon_entry',
    slackUserId,
    mode,
    rowCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
  });

  return { ok: true, entry: Array.isArray(data) ? data[0] : data };
}

async function startFarmDungeon({ slackUserId, pokemonId, level }) {
  const context = createDungeonStartContext({ slackUserId, pokemonId, mode: 'farm', level });
  logger.info('Iniciando fluxo de dungeon farm', { ...context, method: 'startFarmDungeon' });

  if (!FARM_LEVELS.includes(Number(level))) return { ok: false, reason: 'invalid_dungeon_level' };

  const validation = await validateDungeonPokemonSelection({ slackUserId, pokemonId });
  if (!validation.ok) return validation;

  const playerPokemon = validation.pokemon;
  const loadout = await getPokemonMagicLoadout(pokemonId);
  playerPokemon.magicSlots = loadout?.spells || [];

  const speciesList = await getAllSpecies();
  const isDungeon60 = Number(level) === 60;
  const enemySpecies = pickDungeonEnemySpecies(speciesList, isDungeon60 ? { onlyRarity: "epic" } : {});
  const enemy = buildEnemyPokemon(enemySpecies, Number(level), isDungeon60 ? { statBuffPercent: 0.30, hpBuffPercent: 0.75 } : {});

  logger.info('Inimigo de dungeon farm gerado', {
    ...context,
    method: 'startFarmDungeon',
    enemySpeciesId: enemySpecies?.id,
    enemySpeciesName: enemySpecies?.name,
    enemyRarity: enemySpecies?.rarity,
    enemyLevel: enemy.level,
    enemyStats: { attack: enemy.attack, magic: enemy.magic, defense: enemy.defense, hp: enemy.hp, speed: enemy.speed },
    enemyStatModifier: enemy.pveBalance?.modifier,
    affectedStats: enemy.pveBalance?.relevantStats,
    baseStats: enemy.pveBalance?.baseStats,
  });

  const reward = getFarmReward(level);
  const energyConsumption = await consumeDungeonEnergy(slackUserId, 1);
  if (!energyConsumption.ok) return { ok: false, reason: energyConsumption.reason, energy: energyConsumption.energy };
  const battle = createDungeonBattle({
    slackUserId,
    playerPokemon,
    enemyPokemon: enemy,
    metadata: createDungeonMetadata({ slackUserId, playerPokemonId: pokemonId, mode: 'farm', level, reward }),
  });

  battleStore.setBattle(battle.channelId, battle);

  logger.info('Batalha de dungeon farm criada', {
    ...context,
    method: 'startFarmDungeon',
    battleId: battle.id,
    sessionId: battle.channelId,
    currentTurnUserId: battle.currentTurnUserId,
  });

  const { enemyTurns } = processEnemyTurnIfNeeded({ battle, trigger: 'start_farm' });
  battle.metadata.turnLog = buildDungeonTurnLog({
    battle,
    playerTurn: null,
    enemyTurn: enemyTurns[enemyTurns.length - 1] || null,
  });
  battleStore.setBattle(battle.channelId, battle);

  let completion = null;
  if (battle.status === 'finished') {
    completion = await finalizeDungeonBattle(battle);
    battleStore.setBattle(battle.channelId, battle);
  }

  return { ok: true, mode: 'farm', level: Number(level), battle, completion };
}

async function startDailyDungeon({ slackUserId, pokemonId, mode }) {
  const normalizedMode = String(mode || '').toLowerCase();
  const context = createDungeonStartContext({ slackUserId, pokemonId, mode: 'daily', dailyMode: normalizedMode });
  logger.info('Iniciando fluxo de dungeon daily', { ...context, method: 'startDailyDungeon' });
  if (!DAILY_DUNGEON_ENABLED) {
    logger.info('Clique em dungeon diária desabilitada', {
      ...context,
      method: 'startDailyDungeon',
      maintenance: true,
    });
    return { ok: false, reason: 'daily_disabled' };
  }

  if (!['normal', 'hard'].includes(normalizedMode)) return { ok: false, reason: 'invalid_daily_mode' };

  const validation = await validateDungeonPokemonSelection({ slackUserId, pokemonId });
  if (!validation.ok) return validation;

  const playerPokemon = validation.pokemon;
  const claim = await ensureDailyEntry(slackUserId, normalizedMode, { pokemonId });
  if (!claim.ok) return claim;

  const loadout = await getPokemonMagicLoadout(pokemonId);
  playerPokemon.magicSlots = loadout?.spells || [];

  const enemyLevel = normalizedMode === 'hard' ? Number(playerPokemon.level) + 5 : Number(playerPokemon.level);
  const speciesList = await getAllSpecies();
  const enemySpecies = pickDungeonEnemySpecies(speciesList);
  const enemy = buildEnemyPokemon(enemySpecies, enemyLevel);

  logger.info('Inimigo de dungeon daily gerado', {
    ...context,
    method: 'startDailyDungeon',
    enemySpeciesId: enemySpecies?.id,
    enemySpeciesName: enemySpecies?.name,
    enemyRarity: enemySpecies?.rarity,
    enemyLevel: enemy.level,
    enemyStats: { attack: enemy.attack, magic: enemy.magic, defense: enemy.defense, hp: enemy.hp, speed: enemy.speed },
    enemyStatModifier: enemy.pveBalance?.modifier,
    affectedStats: enemy.pveBalance?.relevantStats,
    baseStats: enemy.pveBalance?.baseStats,
  });

  const battle = createDungeonBattle({
    slackUserId,
    playerPokemon,
    enemyPokemon: enemy,
    metadata: createDungeonMetadata({
      slackUserId,
      playerPokemonId: pokemonId,
      mode: 'daily',
      dailyMode: normalizedMode,
      reward: DUNGEON_REWARDS[`daily_${normalizedMode}`],
      dailyEntry: claim.entry,
    }),
  });

  battle.metadata.enemyLevel = enemyLevel;
  battleStore.setBattle(battle.channelId, battle);

  logger.info('Batalha de dungeon daily criada', {
    ...context,
    method: 'startDailyDungeon',
    battleId: battle.id,
    sessionId: battle.channelId,
    currentTurnUserId: battle.currentTurnUserId,
    enemyLevel,
  });

  const { enemyTurns } = processEnemyTurnIfNeeded({ battle, trigger: 'start_daily' });
  battle.metadata.turnLog = buildDungeonTurnLog({
    battle,
    playerTurn: null,
    enemyTurn: enemyTurns[enemyTurns.length - 1] || null,
  });
  battleStore.setBattle(battle.channelId, battle);

  let completion = null;
  if (battle.status === 'finished') {
    completion = await finalizeDungeonBattle(battle);
    battleStore.setBattle(battle.channelId, battle);
  }

  return { ok: true, mode: normalizedMode, enemyLevel, battle, completion };
}

function getDungeonBattle(channelId) {
  const battle = battleStore.getBattle(channelId);
  if (!battle || battle.metadata?.mode !== 'dungeon') return null;
  return battle;
}

function getDungeonOwnerUserId(battle) {
  return battle?.metadata?.slackUserId || battle?.challengerId || null;
}

function isDungeonProcessing(channelId) {
  return dungeonProcessingLocks.has(String(channelId || ''));
}

function tryLockDungeon(channelId) {
  const key = String(channelId || '');
  if (!key || dungeonProcessingLocks.has(key)) return false;
  dungeonProcessingLocks.add(key);
  return true;
}

function releaseDungeonLock(channelId) {
  dungeonProcessingLocks.delete(String(channelId || ''));
}

function getBattleActorLabel(battle, actorUserId) {
  const actorState = battle.players?.[actorUserId];
  const actorName = actorState?.selectedPokemon?.name || 'Pokémon';
  if (actorUserId === DUNGEON_ENEMY_USER_ID) return `👾 ${actorName}`;
  return `🧑‍💻 ${actorName}`;
}

function formatDungeonTurnLogEntry({ battle, actionType, outcome, actorUserId, phase = 'turn' }) {
  const actorLabel = getBattleActorLabel(battle, actorUserId);
  const targetState = battle.players?.[outcome?.defenderId];
  const targetLabel = outcome?.defenderId ? getBattleActorLabel(battle, outcome.defenderId) : null;
  const hpSuffix = targetState && outcome?.defenderRemainingHp != null
    ? ` (HP ${outcome.defenderRemainingHp}/${targetState.battleHp?.max || '?'})`
    : '';

  if (!outcome?.ok) {
    if (outcome?.reason === 'magic_on_cooldown') return `⏳ ${actorLabel} tentou usar magia, mas ainda está em cooldown.`;
    if (outcome?.reason === 'magic_not_found') return `⚠️ ${actorLabel} tentou usar uma magia inválida.`;
    if (outcome?.reason === 'limit') return `⚠️ ${actorLabel} tentou usar poção, mas já atingiu o limite.`;
    if (outcome?.reason === 'full_hp') return `💚 ${actorLabel} tentou usar poção com HP cheio.`;
    return `⚠️ ${actorLabel} falhou ao agir (${actionType}).`;
  }

  if (actionType === BATTLE_ACTION.ATTACK) {
    return `${phase === 'turn' ? '⚔️' : '🤖'} ${actorLabel} atacou ${targetLabel} e causou *${outcome.finalDamage}* de dano${outcome.dodged ? ' — ESQUIVADO!' : ''}${outcome.isCritical ? ' — CRÍTICO!' : ''}${hpSuffix}`;
  }

  if (actionType === BATTLE_ACTION.MAGIC) {
    const relationMessage = outcome.elemental?.hasAdvantage
      ? ' com vantagem elemental'
      : outcome.elemental?.hasDisadvantage
        ? ' com desvantagem elemental'
        : '';
    return `✨ ${actorLabel} usou *${outcome.magicEntry?.name || 'Magia'}* em ${targetLabel} e causou *${outcome.finalDamage}* de dano${relationMessage}${hpSuffix}`;
  }

  if (actionType === BATTLE_ACTION.POTION) {
    return `🧪 ${actorLabel} usou poção e recuperou *${outcome.healAmount}* HP (agora ${outcome.currentHp}/${battle.players?.[actorUserId]?.battleHp?.max || '?'})`;
  }

  return `🎯 ${actorLabel} executou ${actionType}.`;
}

function buildDungeonTurnLog({ battle, playerTurn, enemyTurn }) {
  const log = [];
  log.push(`🔁 Rodada ${battle.round} — início da resolução`);

  if (playerTurn?.outcome) {
    log.push(formatDungeonTurnLogEntry({ battle, actionType: playerTurn.actionType, outcome: playerTurn.outcome, actorUserId: playerTurn.actorUserId, phase: 'turn' }));
    if (playerTurn.outcome?.defenderRemainingHp === 0) log.push(`💀 ${getBattleActorLabel(battle, playerTurn.outcome.defenderId)} foi derrotado.`);
  }

  if (enemyTurn?.resolution?.outcome) {
    log.push('🤖 Turno automático do inimigo');
    log.push(formatDungeonTurnLogEntry({ battle, actionType: enemyTurn.action.actionType, outcome: enemyTurn.resolution.outcome, actorUserId: DUNGEON_ENEMY_USER_ID, phase: 'auto' }));
    if (enemyTurn.resolution.outcome?.defenderRemainingHp === 0) log.push(`💀 ${getBattleActorLabel(battle, enemyTurn.resolution.outcome.defenderId)} foi derrotado.`);
  }

  if (battle.status === 'finished') {
    const winnerId = battle.metadata?.lastResolution?.finalized?.winnerId;
    log.push(`🏁 Batalha encerrada. Vencedor: ${getBattleActorLabel(battle, winnerId)}.`);
  } else {
    log.push(`🎯 Próximo turno: ${getBattleActorLabel(battle, battle.currentTurnUserId)}.`);
    log.push(`✅ Rodada ${battle.round} — fim da resolução`);
  }

  return log.slice(-8);
}

function resolveDungeonAiTurn(battle) {
  const actorUserId = battle.currentTurnUserId;
  if (actorUserId !== DUNGEON_ENEMY_USER_ID) return null;

  const enemyState = battle.players[DUNGEON_ENEMY_USER_ID];
  const playerState = battle.players[battle.metadata?.slackUserId || battle.challengerId];
  const action = decideAiAction(enemyState);

  logger.info('Decisão da IA da dungeon definida', {
    file: 'services/dungeonService.js',
    method: 'resolveDungeonAiTurn',
    battleId: battle.id,
    sessionId: battle.channelId,
    slackUserId: battle.metadata?.slackUserId,
    currentTurnUserId: battle.currentTurnUserId,
    enemyPokemon: enemyState?.selectedPokemon?.name,
    playerPokemon: playerState?.selectedPokemon?.name,
    chosenActionType: action.actionType,
    chosenActionPayload: action.actionPayload,
  });
  const resolution = resolveBattleTurn({
    battle,
    actorUserId: DUNGEON_ENEMY_USER_ID,
    actionType: action.actionType,
    actionPayload: action.actionPayload,
  });

  logger.info('Turno do inimigo da dungeon resolvido', {
    file: 'services/dungeonService.js',
    method: 'resolveDungeonAiTurn',
    battleId: battle.id,
    sessionId: battle.channelId,
    slackUserId: battle.metadata?.slackUserId,
    dungeonMode: battle.metadata?.dungeonType,
    actionType: action.actionType,
    enemyPokemonId: enemyState?.selectedPokemon?.id,
    outcomeType: resolution.outcome?.type,
    finalDamage: resolution.outcome?.finalDamage || null,
    targetRemainingHp: resolution.outcome?.defenderRemainingHp || null,
    finished: resolution.finished,
  });

  return { action, resolution };
}

function processEnemyTurnIfNeeded({ battle, trigger = 'unknown', maxEnemyTurns = 3 }) {
  const playerUserId = battle.metadata?.slackUserId || battle.challengerId;
  const enemyTurns = [];
  let safeguard = 0;

  logger.info('Verificando necessidade de turno automático do inimigo na dungeon', {
    file: 'services/dungeonService.js',
    method: 'processEnemyTurnIfNeeded',
    battleId: battle.id,
    sessionId: battle.channelId,
    slackUserId: playerUserId,
    trigger,
    currentTurnUserId: battle.currentTurnUserId,
    battleStatus: battle.status,
    maxEnemyTurns,
  });

  while (battle.status === 'active' && battle.currentTurnUserId === DUNGEON_ENEMY_USER_ID && safeguard < maxEnemyTurns) {
    safeguard += 1;
    let enemyTurn = resolveDungeonAiTurn(battle);
    if (!enemyTurn) break;

    if (!enemyTurn.resolution?.outcome?.ok && enemyTurn.action.actionType !== BATTLE_ACTION.ATTACK) {
      logger.warn('Falha em ação não ofensiva da IA; aplicando fallback para ataque básico na dungeon', {
        file: 'services/dungeonService.js',
        method: 'processEnemyTurnIfNeeded',
        battleId: battle.id,
        sessionId: battle.channelId,
        slackUserId: playerUserId,
        trigger,
        attemptedActionType: enemyTurn.action.actionType,
        reason: enemyTurn.resolution?.outcome?.reason,
      });
      enemyTurn = {
        action: { actionType: BATTLE_ACTION.ATTACK, actionPayload: {} },
        resolution: resolveBattleTurn({
          battle,
          actorUserId: DUNGEON_ENEMY_USER_ID,
          actionType: BATTLE_ACTION.ATTACK,
          actionPayload: {},
        }),
      };
    }

    battle.metadata.lastResolution = enemyTurn.resolution;
    enemyTurns.push(enemyTurn);

    logger.info('Turno automático do inimigo aplicado na dungeon', {
      file: 'services/dungeonService.js',
      method: 'processEnemyTurnIfNeeded',
      battleId: battle.id,
      sessionId: battle.channelId,
      slackUserId: playerUserId,
      trigger,
      autoTurnStep: safeguard,
      actionType: enemyTurn.action.actionType,
      outcomeType: enemyTurn.resolution?.outcome?.type || null,
      outcomeOk: enemyTurn.resolution?.outcome?.ok === true,
      nextTurnUserId: battle.currentTurnUserId,
      battleStatus: battle.status,
    });

    if (!enemyTurn.resolution?.outcome?.ok && battle.currentTurnUserId === DUNGEON_ENEMY_USER_ID) {
      logger.warn('Fluxo de turno automático interrompido para evitar loop na dungeon', {
        file: 'services/dungeonService.js',
        method: 'processEnemyTurnIfNeeded',
        battleId: battle.id,
        sessionId: battle.channelId,
        slackUserId: playerUserId,
        trigger,
        autoTurnStep: safeguard,
        reason: enemyTurn.resolution?.outcome?.reason || 'unknown',
      });
      break;
    }
  }

  if (battle.status === 'active' && battle.currentTurnUserId === DUNGEON_ENEMY_USER_ID && safeguard >= maxEnemyTurns) {
    logger.error('Safeguard de turno automático da dungeon atingido', {
      file: 'services/dungeonService.js',
      method: 'processEnemyTurnIfNeeded',
      battleId: battle.id,
      sessionId: battle.channelId,
      slackUserId: playerUserId,
      trigger,
      maxEnemyTurns,
      currentTurnUserId: battle.currentTurnUserId,
    });
  }

  logger.info('Verificação de turno automático concluída na dungeon', {
    file: 'services/dungeonService.js',
    method: 'processEnemyTurnIfNeeded',
    battleId: battle.id,
    sessionId: battle.channelId,
    slackUserId: playerUserId,
    trigger,
    enemyTurnsApplied: enemyTurns.length,
    battleStatus: battle.status,
    currentTurnUserId: battle.currentTurnUserId,
  });

  return { enemyTurns };
}

async function finalizeDungeonBattle(battle) {
  const playerUserId = battle.metadata?.slackUserId || battle.challengerId;
  const playerState = battle.players[playerUserId];
  await persistPlayerBattleHp(playerUserId, playerState);

  const winnerId = battle.metadata?.lastResolution?.finalized?.winnerId;
  const isPlayerVictory = winnerId === playerUserId;

  logger.info('Finalizando batalha de dungeon', {
    file: 'services/dungeonService.js',
    method: 'finalizeDungeonBattle',
    battleId: battle.id,
    sessionId: battle.channelId,
    slackUserId: playerUserId,
    pokemonId: playerState?.selectedPokemon?.id,
    dungeonMode: battle.metadata?.dungeonType,
    dailyMode: battle.metadata?.dailyMode || null,
    winnerId,
    rewardsGranted: battle.metadata?.rewardsGranted || false,
  });

  if (!isPlayerVictory) {
    return { ok: true, outcome: 'defeat', rewards: null };
  }

  if (battle.metadata?.rewardsGranted) {
    return { ok: false, reason: 'reward_already_granted' };
  }

  let capturedSpecies = null;
  let enemyLevel = battle.metadata?.enemyLevel || battle.players[DUNGEON_ENEMY_USER_ID]?.selectedPokemon?.level || 1;
  if (battle.metadata?.dungeonType === 'daily') {
    const speciesList = await getAllSpecies();
    capturedSpecies = weightedPickByConfiguredChances(speciesList, DAILY_CHANCES[battle.metadata.dailyMode]);
  }

  if (battle.metadata?.dungeonType === 'farm' && Number(battle.metadata?.dungeonLevel) === 60) {
    const speciesList = await getAllSpecies();
    capturedSpecies = weightedPickByConfiguredChances(speciesList, { epic: 95, legendary: 4, mythical: 1 });
  }

  const rewards = await grantDungeonRewards({
    slackUserId: playerUserId,
    reward: battle.metadata.reward,
    transactionType: battle.metadata.rewardTransactionType,
    capturedSpecies,
    enemyLevel,
  });

  battle.metadata.rewardsGranted = true;
  battle.metadata.capturedSpecies = capturedSpecies;

  logger.info('Recompensas de dungeon concedidas', {
    file: 'services/dungeonService.js',
    method: 'finalizeDungeonBattle',
    battleId: battle.id,
    sessionId: battle.channelId,
    slackUserId: playerUserId,
    dungeonMode: battle.metadata?.dungeonType,
    dailyMode: battle.metadata?.dailyMode || null,
    rewardTransactionType: battle.metadata.rewardTransactionType,
    capturedSpeciesId: capturedSpecies?.id || null,
  });

  return { ok: true, outcome: 'victory', rewards, capturedSpecies };
}

async function processDungeonTurn({ channelId, actorUserId, actionType, actionPayload = {} }) {
  const battle = getDungeonBattle(channelId);
  if (!battle) return { ok: false, reason: 'battle_not_found' };
  const ownerUserId = getDungeonOwnerUserId(battle);
  if (ownerUserId !== actorUserId) {
    return { ok: false, reason: 'not_dungeon_owner', battle, ownerUserId };
  }
  if (!tryLockDungeon(channelId)) {
    return { ok: false, reason: 'processing_in_progress', battle };
  }

  try {
    const lockedBattle = getDungeonBattle(channelId);
    if (!lockedBattle) return { ok: false, reason: 'battle_not_found' };
    const lockedOwnerUserId = getDungeonOwnerUserId(lockedBattle);
    if (lockedOwnerUserId !== actorUserId) {
      return { ok: false, reason: 'not_dungeon_owner', battle: lockedBattle, ownerUserId: lockedOwnerUserId };
    }

    const validation = validateTurnAction({ battle: lockedBattle, actorUserId, actionType });
    if (!validation.ok) return { ok: false, reason: validation.reason, battle: lockedBattle, validation };

    logger.info('Ação recebida do player na dungeon', {
      file: 'services/dungeonService.js',
      method: 'processDungeonTurn',
      battleId: lockedBattle.id,
      sessionId: lockedBattle.channelId,
      slackUserId: actorUserId,
      pokemonId: lockedBattle.players[actorUserId]?.selectedPokemon?.id,
      dungeonMode: lockedBattle.metadata?.dungeonType,
      dailyMode: lockedBattle.metadata?.dailyMode || null,
      actionType,
      actionPayload,
      enemyPokemon: lockedBattle.players[DUNGEON_ENEMY_USER_ID]?.selectedPokemon?.name,
    });

    const roundBeforeResolution = lockedBattle.round;
    const playerResolution = resolveBattleTurn({ battle: lockedBattle, actorUserId, actionType, actionPayload });
    if (!playerResolution?.outcome?.ok) {
      return { ok: false, reason: playerResolution.outcome.reason || 'unsupported_action', battle: lockedBattle };
    }
    lockedBattle.metadata.lastResolution = playerResolution;
    logger.info('Ação do player resolvida na dungeon', {
      file: 'services/dungeonService.js',
      method: 'processDungeonTurn',
      battleId: lockedBattle.id,
      sessionId: lockedBattle.channelId,
      slackUserId: actorUserId,
      currentTurnUserId: lockedBattle.currentTurnUserId,
      roundBeforeResolution,
      roundAfterPlayerResolution: lockedBattle.round,
      outcomeType: playerResolution.outcome?.type,
      result: playerResolution.outcome,
      nextTurnUserId: lockedBattle.currentTurnUserId,
      finished: playerResolution.finished,
    });

    const turnLog = [{ actorUserId, actionType, outcome: playerResolution.outcome }];
    let enemyTurn = null;
    let enemyTurns = [];

    if (!playerResolution.finished && lockedBattle.currentTurnUserId === DUNGEON_ENEMY_USER_ID) {
      logger.info('Troca de turno player -> bot detectada na dungeon', {
        file: 'services/dungeonService.js',
        method: 'processDungeonTurn',
        battleId: lockedBattle.id,
        sessionId: lockedBattle.channelId,
        slackUserId: actorUserId,
        previousActorUserId: actorUserId,
        currentTurnUserId: lockedBattle.currentTurnUserId,
      });
      const enemyTurnProcessing = processEnemyTurnIfNeeded({ battle: lockedBattle, trigger: 'post_player_action' });
      enemyTurns = enemyTurnProcessing.enemyTurns;
      enemyTurn = enemyTurns[enemyTurns.length - 1] || null;
      for (const appliedEnemyTurn of enemyTurns) {
        turnLog.push({
          actorUserId: DUNGEON_ENEMY_USER_ID,
          actionType: appliedEnemyTurn.action.actionType,
          outcome: appliedEnemyTurn.resolution.outcome,
        });
      }
    }

    lockedBattle.metadata.turnLog = buildDungeonTurnLog({
      battle: lockedBattle,
      playerTurn: { actorUserId, actionType, outcome: playerResolution.outcome },
      enemyTurn,
    });

    logger.info('Renderização pós-resolução da dungeon preparada', {
      file: 'services/dungeonService.js',
      method: 'processDungeonTurn',
      battleId: lockedBattle.id,
      sessionId: lockedBattle.channelId,
      slackUserId: actorUserId,
      currentTurnUserId: lockedBattle.currentTurnUserId,
      battleStatus: lockedBattle.status,
      playerControlsVisible: lockedBattle.status === 'active' && lockedBattle.currentTurnUserId === actorUserId,
      turnLog: lockedBattle.metadata.turnLog,
    });

    battleStore.setBattle(lockedBattle.channelId, lockedBattle);

    let completion = null;
    if (lockedBattle.status === 'finished') {
      completion = await finalizeDungeonBattle(lockedBattle);
      battleStore.setBattle(lockedBattle.channelId, lockedBattle);
    }

    return {
      ok: true,
      battle: lockedBattle,
      playerResolution,
      enemyTurn,
      completion,
      turnLog,
    };
  } finally {
    releaseDungeonLock(channelId);
  }
}

module.exports = {
  FARM_LEVELS,
  DAILY_CHANCES,
  DAILY_DUNGEON_ENABLED,
  DUNGEON_ENEMY_USER_ID,
  getDungeonEnemyStatModifier,
  balanceDungeonEnemyStats,
  getDungeonFarmList,
  getFarmReward,
  getFarmPokeballRewardRange,
  decideAiAction,
  processEnemyTurnIfNeeded,
  getEligibleDungeonPokemons,
  validateDungeonPokemonSelection,
  mapDungeonFailureReason,
  startFarmDungeon,
  startDailyDungeon,
  processDungeonTurn,
  getDungeonBattle,
  buildDungeonBattleChannelId,
  getDungeonOwnerUserId,
  isDungeonProcessing,
};
