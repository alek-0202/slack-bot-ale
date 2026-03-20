const { getSupabaseClient } = require('../database/supabase');
const { createLogger } = require('../utils/logger');
const battleStore = require('./battleStateStore');
const { createUserIfMissing } = require('./userService');

const logger = createLogger('healing-station-service');

const MAX_STATION_LEVEL = 10;
const MAX_STATION_SLOTS = 5;
const BASE_UPGRADE_COST = 7000n;
const UPGRADE_COST_STEP = 3000n;
const BASE_REGEN_PER_MINUTE = 2;
const REGEN_PER_LEVEL_STEP = 1;

function getHealingStationUpgradeCost(targetLevel) {
  const safeTargetLevel = Math.max(1, Math.min(MAX_STATION_LEVEL, Number(targetLevel) || 1));
  return BASE_UPGRADE_COST + BigInt(safeTargetLevel - 1) * UPGRADE_COST_STEP;
}

function getHealingRatePerMinute(level = 1) {
  const safeLevel = Math.max(1, Math.min(MAX_STATION_LEVEL, Number(level) || 1));
  return BASE_REGEN_PER_MINUTE + (safeLevel - 1) * REGEN_PER_LEVEL_STEP;
}

async function ensureHealingStation(slackUserId) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const payload = { slack_user_id: slackUserId };
  const { data, error } = await supabase
    .from('healing_stations')
    .upsert(payload, { onConflict: 'slack_user_id', ignoreDuplicates: false })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function mapHealingEntry(slot, level) {
  const pokemon = slot.user_pokemons || {};
  const species = pokemon.pokemon_species || {};
  const hpMax = Number(pokemon.hp) || 1;
  const currentHp = Number(pokemon.current_hp) || 0;
  const percent = Math.max(0, Math.min(100, Math.round((currentHp / Math.max(hpMax, 1)) * 100)));
  return {
    slotId: slot.id,
    insertedAt: slot.healing_started_at,
    lastProcessedAt: slot.last_processed_at,
    pokemonId: pokemon.id,
    speciesName: species.name || `Pokémon #${pokemon.species_id || '?'}`,
    currentHp,
    hpMax,
    percent,
    level: pokemon.level,
    shiny: Boolean(pokemon.shiny),
    ratePerMinute: getHealingRatePerMinute(level),
  };
}

async function refreshHealingStation(slackUserId) {
  const station = await ensureHealingStation(slackUserId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('healing_station_slots')
    .select('id, slack_user_id, healing_started_at, last_processed_at, user_pokemons(id, slack_user_id, species_id, level, shiny, hp, current_hp, pokemon_species(name))')
    .eq('slack_user_id', slackUserId)
    .order('healing_started_at', { ascending: true });
  if (error) throw error;

  const ratePerMinute = getHealingRatePerMinute(station.level);
  const now = Date.now();
  const completedPokemonIds = [];

  for (const slot of data || []) {
    const pokemon = slot.user_pokemons;
    if (!pokemon) continue;
    const hpMax = Number(pokemon.hp) || 1;
    const currentHp = Number(pokemon.current_hp) || 0;
    const lastProcessedAt = new Date(slot.last_processed_at || slot.healing_started_at || station.created_at).getTime();
    const elapsedMinutes = Math.max(0, Math.floor((now - lastProcessedAt) / 60000));
    if (elapsedMinutes <= 0) continue;
    const healedHp = elapsedMinutes * ratePerMinute;
    const nextHp = Math.min(hpMax, currentHp + healedHp);

    logger.info('Regen calculada na estação', { slackUserId, pokemonId: pokemon.id, elapsedMinutes, healedHp, previousHp: currentHp, nextHp, hpMax, ratePerMinute });

    const { error: updateError } = await supabase
      .from('user_pokemons')
      .update({ current_hp: nextHp })
      .eq('id', pokemon.id)
      .eq('slack_user_id', slackUserId);
    if (updateError) throw updateError;

    if (nextHp >= hpMax) {
      completedPokemonIds.push(pokemon.id);
      logger.info('Pokémon removido automaticamente da estação por cura completa', { slackUserId, pokemonId: pokemon.id, hpMax });
      continue;
    }

    const { error: slotUpdateError } = await supabase
      .from('healing_station_slots')
      .update({ last_processed_at: new Date(now).toISOString() })
      .eq('id', slot.id)
      .eq('slack_user_id', slackUserId);
    if (slotUpdateError) throw slotUpdateError;
  }

  if (completedPokemonIds.length) {
    const { error: deleteError } = await supabase
      .from('healing_station_slots')
      .delete()
      .eq('slack_user_id', slackUserId)
      .in('user_pokemon_id', completedPokemonIds);
    if (deleteError) throw deleteError;
  }

  const { data: refreshedSlots, error: refreshError } = await supabase
    .from('healing_station_slots')
    .select('id, slack_user_id, healing_started_at, last_processed_at, user_pokemons(id, slack_user_id, species_id, level, shiny, hp, current_hp, pokemon_species(name))')
    .eq('slack_user_id', slackUserId)
    .order('healing_started_at', { ascending: true });
  if (refreshError) throw refreshError;

  return {
    station,
    slots: (refreshedSlots || []).map((slot) => mapHealingEntry(slot, station.level)),
    ratePerMinute,
    maxSlots: MAX_STATION_SLOTS,
  };
}

async function getHealingStationView(slackUserId) {
  return refreshHealingStation(slackUserId);
}

function getBattleForUser(userId) {
  const channelId = battleStore.getUserActiveBattleChannel(userId);
  if (!channelId) return null;
  return battleStore.getBattle(channelId);
}

function isPokemonInActiveBattle({ slackUserId, pokemonId }) {
  const battle = getBattleForUser(slackUserId);
  if (!battle) return false;
  return Object.values(battle.players || {}).some((player) => Number(player?.selectedPokemon?.id) === Number(pokemonId));
}

async function getHealingStationPokemonIds(slackUserId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('healing_station_slots').select('user_pokemon_id').eq('slack_user_id', slackUserId);
  if (error) throw error;
  return new Set((data || []).map((entry) => Number(entry.user_pokemon_id)));
}

async function getHealingEligibilityList(slackUserId) {
  const supabase = getSupabaseClient();
  await refreshHealingStation(slackUserId);
  const healingIds = await getHealingStationPokemonIds(slackUserId);
  const { data, error } = await supabase
    .from('user_pokemons')
    .select('id, slack_user_id, level, shiny, hp, current_hp, pokemon_species(name)')
    .eq('slack_user_id', slackUserId)
    .order('captured_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data || []).filter((pokemon) => Number(pokemon.current_hp) < Number(pokemon.hp) && !healingIds.has(Number(pokemon.id)));
}

async function addPokemonToHealingStation({ slackUserId, pokemonId }) {
  const supabase = getSupabaseClient();
  const view = await refreshHealingStation(slackUserId);
  const { data: pokemon, error: pokemonError } = await supabase
    .from('user_pokemons')
    .select('id, slack_user_id, level, hp, current_hp, pokemon_species(name)')
    .eq('id', pokemonId)
    .eq('slack_user_id', slackUserId)
    .maybeSingle();
  if (pokemonError) throw pokemonError;
  if (!pokemon) return { ok: false, reason: 'pokemon_not_owned' };
  if (view.slots.length >= MAX_STATION_SLOTS) return { ok: false, reason: 'station_full' };
  if (view.slots.some((slot) => Number(slot.pokemonId) === Number(pokemonId))) return { ok: false, reason: 'already_in_station' };
  if (Number(pokemon.current_hp) >= Number(pokemon.hp)) return { ok: false, reason: 'already_full_hp' };
  if (isPokemonInActiveBattle({ slackUserId, pokemonId })) return { ok: false, reason: 'pokemon_in_active_battle' };

  await ensureHealingStation(slackUserId);
  const now = new Date().toISOString();
  const { error } = await supabase.from('healing_station_slots').insert({ slack_user_id: slackUserId, user_pokemon_id: pokemonId, healing_started_at: now, last_processed_at: now });
  if (error) throw error;

  logger.info('Pokémon adicionado à estação de cura', { slackUserId, pokemonId, currentHp: pokemon.current_hp, hpMax: pokemon.hp });
  return { ok: true, pokemon };
}

async function removePokemonFromHealingStation({ slackUserId, pokemonId, reason = 'manual' }) {
  const supabase = getSupabaseClient();
  await refreshHealingStation(slackUserId);
  const { data, error } = await supabase
    .from('healing_station_slots')
    .delete()
    .eq('slack_user_id', slackUserId)
    .eq('user_pokemon_id', pokemonId)
    .select('user_pokemon_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: 'not_in_station' };
  logger.info('Pokémon removido da estação de cura', { slackUserId, pokemonId, reason });
  return { ok: true };
}

async function assertPokemonAvailableForAction({ slackUserId, pokemonId, action }) {
  const healingIds = await getHealingStationPokemonIds(slackUserId);
  if (!healingIds.has(Number(pokemonId))) return { ok: true };
  logger.warn('Ação bloqueada por Pokémon em estação', { slackUserId, pokemonId, action });
  return { ok: false, reason: 'pokemon_in_healing_station' };
}

async function persistBattleHp({ slackUserId, pokemonId, hpStat, battleHpCurrent, battleHpMax }) {
  const supabase = getSupabaseClient();
  const safeMax = Math.max(1, Number(battleHpMax) || 1);
  const safeCurrent = Math.max(0, Number(battleHpCurrent) || 0);
  const persistentHp = Math.max(0, Math.min(Number(hpStat) || 1, Math.round((safeCurrent / safeMax) * (Number(hpStat) || 1))));
  const { error } = await supabase.from('user_pokemons').update({ current_hp: persistentHp }).eq('id', pokemonId).eq('slack_user_id', slackUserId);
  if (error) throw error;
  logger.info('HP persistido após batalha', { slackUserId, pokemonId, hpStat, battleHpCurrent: safeCurrent, battleHpMax: safeMax, persistentHp });
  return persistentHp;
}

module.exports = {
  MAX_STATION_LEVEL,
  MAX_STATION_SLOTS,
  BASE_UPGRADE_COST,
  UPGRADE_COST_STEP,
  getHealingStationUpgradeCost,
  getHealingRatePerMinute,
  ensureHealingStation,
  refreshHealingStation,
  getHealingStationView,
  getHealingEligibilityList,
  addPokemonToHealingStation,
  removePokemonFromHealingStation,
  assertPokemonAvailableForAction,
  getHealingStationPokemonIds,
  persistBattleHp,
  isPokemonInActiveBattle,
};
