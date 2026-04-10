const { getSupabaseClient } = require('../database/supabase');
const { IV_STAT_RANGES, calculatePokemonStats } = require('./pokemonStatsService');

function getMaxIvOffsets() {
  return {
    attack_iv: Number(IV_STAT_RANGES.attack?.max || 0),
    magic_iv: Number(IV_STAT_RANGES.magic?.max || 0),
    defense_iv: Number(IV_STAT_RANGES.defense?.max || 0),
    hp_iv: Number(IV_STAT_RANGES.hp?.max || 0),
    speed_iv: Number(IV_STAT_RANGES.speed?.max || 0),
  };
}

function buildShinyConsistencyPatch(pokemon) {
  if (!pokemon) return null;
  const patch = {};
  const isShiny = Boolean(pokemon.shiny);
  const normalizedShinyType = isShiny
    ? (String(pokemon.shiny_type || '').toLowerCase() === 'prime' ? 'prime' : 'normal')
    : null;

  if (pokemon.shiny_type !== normalizedShinyType) {
    patch.shiny_type = normalizedShinyType;
  }

  if (!isShiny) return Object.keys(patch).length > 0 ? patch : null;

  const normalizedCurrentIv = {
    attack_iv: Number(pokemon.attack_iv || 0),
    magic_iv: Number(pokemon.magic_iv || 0),
    defense_iv: Number(pokemon.defense_iv || 0),
    hp_iv: Number(pokemon.hp_iv || 0),
    speed_iv: Number(pokemon.speed_iv || 0),
  };
  const maxIv = getMaxIvOffsets();

  for (const [key, cap] of Object.entries(maxIv)) {
    if (normalizedCurrentIv[key] !== cap) {
      patch[key] = cap;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

async function applyShinyConsistencyIfNeeded(pokemon) {
  const patch = buildShinyConsistencyPatch(pokemon);
  if (!patch) return pokemon;

  const ivOffsets = {
    attack_iv: patch.attack_iv ?? Number(pokemon.attack_iv || 0),
    magic_iv: patch.magic_iv ?? Number(pokemon.magic_iv || 0),
    defense_iv: patch.defense_iv ?? Number(pokemon.defense_iv || 0),
    hp_iv: patch.hp_iv ?? Number(pokemon.hp_iv || 0),
    speed_iv: patch.speed_iv ?? Number(pokemon.speed_iv || 0),
  };
  const shiny = Boolean(pokemon.shiny);
  const shinyType = patch.shiny_type !== undefined ? patch.shiny_type : pokemon.shiny_type;
  const stats = calculatePokemonStats({
    species: pokemon.pokemon_species || {},
    level: pokemon.level,
    fallbackStats: {
      attack: pokemon.attack,
      magic: pokemon.magic,
      defense: pokemon.defense,
      hp: pokemon.hp,
      speed: pokemon.speed,
    },
    ivOffsets,
    shiny,
    shinyType,
  });
  const oldHp = Math.max(1, Number(pokemon.hp || stats.hp || 1));
  const currentHp = Number(pokemon.current_hp ?? pokemon.hp ?? stats.hp ?? 1);
  const hpRatio = Math.max(0, Math.min(1, currentHp / oldHp));
  const nextCurrentHp = Math.max(1, Math.min(Number(stats.hp || 1), Math.round(Number(stats.hp || 1) * hpRatio)));

  const updatePayload = {
    ...patch,
    attack: stats.attack,
    magic: stats.magic,
    defense: stats.defense,
    hp: stats.hp,
    speed: stats.speed,
    current_hp: nextCurrentHp,
  };
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('user_pokemons')
    .update(updatePayload)
    .eq('id', pokemon.id)
    .eq('slack_user_id', pokemon.slack_user_id);
  if (error) throw error;

  return {
    ...pokemon,
    ...updatePayload,
  };
}

module.exports = {
  getMaxIvOffsets,
  buildShinyConsistencyPatch,
  applyShinyConsistencyIfNeeded,
};
