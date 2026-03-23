const { createBattle, assignSelectedPokemon, startBattle, finishBattle } = require('../application/battle/domain/battleState');
const { resolveBattleTurn } = require('../application/battle/domain/turnResolver');
const { BATTLE_ACTION } = require('../application/battle/domain/actionResolver');
const { calculatePokemonStats } = require('./pokemonStatsService');
const { getAllSpecies, getUserPokemonById, insertUserPokemon } = require('./pokemonService');
const { getPokemonMagicLoadout, buildMagicEntriesFromElements } = require('./pokemonMagicService');
const { assertPokemonAvailableForAction, persistBattleHp } = require('./healingStationService');
const { getSupabaseClient } = require('../database/supabase');
const { createUserIfMissing } = require('./userService');
const { pickByRarity } = require('../pokemon/rarity');
const { addItem } = require('./inventoryService');
const { grantAccountXp } = require('./accountProgressionService');
const { addGold, assertNonNegativeGold, toDatabaseGold, toGoldBigInt, formatGold } = require('../utils/gold');

const FARM_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const DUNGEON_ENEMY_USER_ID = '__dungeon_enemy__';
const DUNGEON_REWARDS = {
  daily_normal: { gold: 3000, accountXp: 500 },
  daily_hard: { gold: 5000, accountXp: 1500 },
};
const DAILY_CHANCES = {
  normal: { common: 70, uncommon: 15, rare: 10, epic: 5 },
  hard: { common: 30, uncommon: 40, rare: 20, epic: 7, legendary: 2, mythical: 1 },
};

function getDungeonFarmList() { return [...FARM_LEVELS]; }
function getFarmReward(level) {
  const safe = Number(level);
  return { gold: 300 * safe, accountXp: 100 * safe, ancientBookQty: safe >= 25 ? 2 : 1 };
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
function buildEnemyPokemon(species, level) {
  const stats = calculatePokemonStats({ species, level });
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
  };
}
function decideAiAction(playerState) {
  const hasMagic = Array.isArray(playerState?.magicSlots) && playerState.magicSlots.length > 0;
  const blocked = Number(playerState?.magicCooldown?.blockedOwnTurnsRemaining) > 0;
  if (hasMagic && !blocked && Math.random() < 0.35) {
    return { actionType: BATTLE_ACTION.MAGIC, actionPayload: { magicSlot: playerState.magicSlots[0].slot } };
  }
  return { actionType: BATTLE_ACTION.ATTACK };
}
async function createPveBattle({ slackUserId, playerPokemon, enemyPokemon, metadata }) {
  const battle = createBattle({
    battleId: `dungeon:${slackUserId}:${Date.now()}`,
    channelId: `dungeon:${slackUserId}`,
    challengerId: slackUserId,
    challengedId: DUNGEON_ENEMY_USER_ID,
    metadata: { mode: 'dungeon', ...metadata },
  });
  assignSelectedPokemon(battle, slackUserId, playerPokemon);
  assignSelectedPokemon(battle, DUNGEON_ENEMY_USER_ID, enemyPokemon);
  battle.players[DUNGEON_ENEMY_USER_ID].potionsUsed = 999;
  startBattle(battle);
  return battle;
}
async function runSingleEnemyBattle({ battle }) {
  const log = [];
  while (battle.status !== 'finished') {
    const actorUserId = battle.currentTurnUserId;
    const playerState = battle.players[actorUserId];
    const action = actorUserId === DUNGEON_ENEMY_USER_ID ? decideAiAction(playerState) : { actionType: BATTLE_ACTION.ATTACK };
    const resolution = resolveBattleTurn({ battle, actorUserId, ...action });
    log.push({ actorUserId, actionType: action.actionType, outcome: resolution.outcome, round: battle.round });
    if (resolution.finished) {
      finishBattle(battle, resolution.finalized.winnerId);
      return { winnerId: resolution.finalized.winnerId, battle, log };
    }
  }
  return { winnerId: null, battle, log };
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
  const { data: user, error } = await supabase.from('users').select('gold').eq('slack_user_id', slackUserId).single();
  if (error) throw error;
  const nextGold = assertNonNegativeGold(addGold(toGoldBigInt(user.gold), toGoldBigInt(reward.gold)));
  const { error: updateError } = await supabase.from('users').update({ gold: toDatabaseGold(nextGold) }).eq('slack_user_id', slackUserId);
  if (updateError) throw updateError;
  const { error: trxError } = await supabase.from('transactions').insert({ slack_user_id: slackUserId, type: transactionType, amount: toDatabaseGold(reward.gold) });
  if (trxError) throw trxError;
  const xpResult = await grantAccountXp(slackUserId, reward.accountXp, transactionType);
  const items = [];
  if (reward.ancientBookQty) {
    items.push(await addItem(slackUserId, 'ancient_book', reward.ancientBookQty));
  }
  let captured = null;
  if (capturedSpecies) {
    const stats = calculatePokemonStats({ species: capturedSpecies, level: enemyLevel || 1 });
    captured = await insertUserPokemon({ slackUserId, speciesId: capturedSpecies.id, level: enemyLevel || 1, shiny: false, stats, source: transactionType });
  }
  return { goldReward: formatGold(reward.gold), xpResult, items, captured };
}
async function ensureDailyEntry(slackUserId, mode, metadata = {}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('claim_daily_dungeon_entry', {
    p_slack_user_id: slackUserId,
    p_mode: mode,
    p_metadata: metadata,
  });
  if (error) {
    if (String(error.message || '').includes('já usada hoje')) {
      return { ok: false, reason: 'already_used_today' };
    }
    throw error;
  }
  return { ok: true, entry: Array.isArray(data) ? data[0] : data };
}
async function startFarmDungeon({ slackUserId, pokemonId, level }) {
  if (!FARM_LEVELS.includes(Number(level))) return { ok: false, reason: 'invalid_dungeon_level' };
  const playerPokemon = await getUserPokemonById(slackUserId, pokemonId);
  if (!playerPokemon) return { ok: false, reason: 'pokemon_not_owned' };
  const availability = await assertPokemonAvailableForAction({ slackUserId, pokemonId, action: 'dungeon' });
  if (!availability.ok) return { ok: false, reason: 'pokemon_in_healing_station' };
  const loadout = await getPokemonMagicLoadout(pokemonId);
  playerPokemon.magicSlots = loadout?.spells || [];
  const speciesList = await getAllSpecies();
  const enemies = [0,1].map(() => buildEnemyPokemon(pickByRarity(speciesList), Number(level)));
  const runs = [];
  let latestPlayerState = null;
  for (const enemy of enemies) {
    if (latestPlayerState) playerPokemon.current_hp = Math.max(0, latestPlayerState.battleHp.current / latestPlayerState.battleHp.max * playerPokemon.hp);
    const battle = await createPveBattle({ slackUserId, playerPokemon, enemyPokemon: enemy, metadata: { dungeonType: 'farm', dungeonLevel: level } });
    const result = await runSingleEnemyBattle({ battle });
    latestPlayerState = battle.players[slackUserId];
    runs.push({ enemy, winnerId: result.winnerId, log: result.log, playerHpLeft: latestPlayerState.battleHp.current });
    if (result.winnerId !== slackUserId) {
      await persistPlayerBattleHp(slackUserId, latestPlayerState);
      return { ok: false, reason: 'defeat', runs };
    }
  }
  await persistPlayerBattleHp(slackUserId, latestPlayerState);
  const reward = getFarmReward(level);
  const rewards = await grantDungeonRewards({ slackUserId, reward, transactionType: 'dungeon_farm_reward' });
  return { ok: true, mode: 'farm', level, runs, rewards };
}
async function startDailyDungeon({ slackUserId, pokemonId, mode }) {
  const normalizedMode = String(mode || '').toLowerCase();
  if (!['normal', 'hard'].includes(normalizedMode)) return { ok: false, reason: 'invalid_daily_mode' };
  const playerPokemon = await getUserPokemonById(slackUserId, pokemonId);
  if (!playerPokemon) return { ok: false, reason: 'pokemon_not_owned' };
  const availability = await assertPokemonAvailableForAction({ slackUserId, pokemonId, action: 'dungeon' });
  if (!availability.ok) return { ok: false, reason: 'pokemon_in_healing_station' };
  const claim = await ensureDailyEntry(slackUserId, normalizedMode, { pokemonId });
  if (!claim.ok) return claim;
  const loadout = await getPokemonMagicLoadout(pokemonId);
  playerPokemon.magicSlots = loadout?.spells || [];
  const enemyLevel = normalizedMode === 'hard' ? Number(playerPokemon.level) + 5 : Number(playerPokemon.level);
  const speciesList = await getAllSpecies();
  const enemy = buildEnemyPokemon(pickByRarity(speciesList), enemyLevel);
  const battle = await createPveBattle({ slackUserId, playerPokemon, enemyPokemon: enemy, metadata: { dungeonType: 'daily', dailyMode: normalizedMode } });
  const result = await runSingleEnemyBattle({ battle });
  await persistPlayerBattleHp(slackUserId, battle.players[slackUserId]);
  if (result.winnerId !== slackUserId) return { ok: false, reason: 'defeat', mode: normalizedMode, log: result.log };
  const capturedSpecies = weightedPickByConfiguredChances(speciesList, DAILY_CHANCES[normalizedMode]);
  const rewards = await grantDungeonRewards({ slackUserId, reward: DUNGEON_REWARDS[`daily_${normalizedMode}`], transactionType: `dungeon_daily_${normalizedMode}_reward`, capturedSpecies, enemyLevel });
  return { ok: true, mode: normalizedMode, enemyLevel, rewards, battleLog: result.log, capturedSpecies };
}

module.exports = {
  FARM_LEVELS,
  DAILY_CHANCES,
  getDungeonFarmList,
  getFarmReward,
  decideAiAction,
  startFarmDungeon,
  startDailyDungeon,
};
