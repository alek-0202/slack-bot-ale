const { getSupabaseClient } = require('../database/supabase');
const { createLogger } = require('../utils/logger');

const logger = createLogger('pokemon-enhancement-service');

const EXTRA_STAT_CONFIG = Object.freeze({
  crit: { column: 'crit_level', cap: 10, perPoint: 4, label: 'Chance crítica' },
  dodge: { column: 'dodge_level', cap: 10, perPoint: 1.8, label: 'Esquiva' },
  elemental: { column: 'elemental_level', cap: 10, perPoint: 3, label: 'Efeito elemental' },
});

const EXTRA_STAT_UPGRADE_GOLD_COST = 10000;
const EXTRA_STAT_UPGRADE_ESSENCE_COST = 500;

function parseActionValue(value) {
  try { return JSON.parse(value); } catch { return null; }
}

async function transferShiny({ slackUserId, sourcePokemonId, targetPokemonId }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('transfer_pokemon_shiny', {
    p_slack_user_id: slackUserId,
    p_source_pokemon_id: sourcePokemonId,
    p_target_pokemon_id: targetPokemonId,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) return { ok: false, reason: 'unknown' };
  logger.info('Transferência de shiny processada', { slackUserId, sourcePokemonId, targetPokemonId, ok: result.ok, reason: result.reason || null });
  return result;
}

async function upgradePokemonExtraStat({ slackUserId, pokemonId, statKey }) {
  const supabase = getSupabaseClient();
  if (!EXTRA_STAT_CONFIG[statKey]) return { ok: false, reason: 'invalid_stat' };

  const { data, error } = await supabase.rpc('upgrade_pokemon_extra_stat', {
    p_slack_user_id: slackUserId,
    p_pokemon_id: pokemonId,
    p_stat_key: statKey,
  });

  if (error) throw error;
  return data?.[0] || { ok: false, reason: 'unknown' };
}

module.exports = {
  EXTRA_STAT_CONFIG,
  EXTRA_STAT_UPGRADE_GOLD_COST,
  EXTRA_STAT_UPGRADE_ESSENCE_COST,
  parseActionValue,
  transferShiny,
  upgradePokemonExtraStat,
};
