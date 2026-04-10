const { getSupabaseClient } = require('../database/supabase');
const { addItem } = require('./inventoryService');
const { getOwnedPokemonById } = require('./pokemonLookupService');
const { resolveShinyPrismaticReward } = require('./sellService');
const { calculatePokemonStats } = require('./pokemonStatsService');

function preserveHpRatio(currentHp, oldHp, newHp) {
  const safeOldHp = Math.max(1, Number(oldHp) || 1);
  const safeCurrentHp = Math.max(0, Number(currentHp) || 0);
  const safeNewHp = Math.max(1, Number(newHp) || 1);
  return Math.min(safeNewHp, Math.max(1, Math.round((safeCurrentHp / safeOldHp) * safeNewHp)));
}

async function resetPokemonShiny({ slackUserId, pokemonId }) {
  const supabase = getSupabaseClient();
  const pokemon = await getOwnedPokemonById(pokemonId);

  if (!pokemon || pokemon.slack_user_id !== slackUserId) {
    return { ok: false, reason: 'pokemon_not_owned' };
  }
  if (!pokemon.shiny) {
    return { ok: false, reason: 'pokemon_not_shiny', pokemon };
  }

  const rarity = String(pokemon?.pokemon_species?.rarity || '').toLowerCase();
  const shinyType = String(pokemon?.shiny_type || '').toLowerCase() === 'prime' ? 'prime' : 'normal';
  const prismaticReward = resolveShinyPrismaticReward({ rarity, shinyType });

  const updatedStats = calculatePokemonStats({
    species: pokemon.pokemon_species || {},
    level: Number(pokemon.level || 1),
    ivOffsets: {
      attack_iv: 0,
      magic_iv: 0,
      defense_iv: 0,
      hp_iv: 0,
      speed_iv: 0,
    },
    shiny: false,
    shinyType: null,
  });

  const { data: updatedPokemon, error: updateError } = await supabase
    .from('user_pokemons')
    .update({
      shiny: false,
      shiny_type: null,
      attack_iv: 0,
      magic_iv: 0,
      defense_iv: 0,
      hp_iv: 0,
      speed_iv: 0,
      attack: updatedStats.attack,
      magic: updatedStats.magic,
      defense: updatedStats.defense,
      hp: updatedStats.hp,
      current_hp: preserveHpRatio(pokemon.current_hp, pokemon.hp, updatedStats.hp),
      speed: updatedStats.speed,
    })
    .eq('id', pokemonId)
    .eq('slack_user_id', slackUserId)
    .eq('shiny', true)
    .select('id, shiny, shiny_type, attack_iv, magic_iv, defense_iv, hp_iv, speed_iv, attack, magic, defense, hp, current_hp, speed')
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedPokemon) return { ok: false, reason: 'pokemon_not_shiny' };

  if (prismaticReward > 0) {
    await addItem(slackUserId, 'prismatic_fragment', prismaticReward);
  }

  return {
    ok: true,
    pokemonId,
    pokemonName: pokemon.pokemon_species?.name || 'Pokémon',
    removedShinyType: shinyType,
    prismaticReward,
    updatedPokemon,
  };
}

module.exports = {
  resetPokemonShiny,
  preserveHpRatio,
};
