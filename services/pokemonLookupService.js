const { getSupabaseClient } = require("../database/supabase");

async function getSpeciesById(speciesId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_species")
    .select("id, name, rarity, sprite_url, evolves_to, evolution_stage, element_types")
    .eq("id", speciesId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getOwnedPokemonById(pokemonId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .select(
      "id, slack_user_id, species_id, level, shiny, shiny_type, attack_iv, magic_iv, defense_iv, hp_iv, speed_iv, crit_level, dodge_level, elemental_level, extra_stats, attack, magic, defense, hp, current_hp, speed, captured_at, book_bonus_attack, book_bonus_magic, book_bonus_defense, book_bonus_hp, book_bonus_speed, pokemon_species(id, name, rarity, sprite_url, evolves_to, evolution_stage, element_types, base_attack, base_magic, base_defense, base_hp, base_speed)",
    )
    .eq("id", pokemonId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function findUserPokemonsBySpeciesName({ slackUserId, speciesName }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .select(
      "id, slack_user_id, species_id, level, shiny, shiny_type, attack_iv, magic_iv, defense_iv, hp_iv, speed_iv, crit_level, dodge_level, elemental_level, extra_stats, attack, magic, defense, hp, current_hp, speed, captured_at, book_bonus_attack, book_bonus_magic, book_bonus_defense, book_bonus_hp, book_bonus_speed, pokemon_species!inner(id, name, rarity, sprite_url)",
    )
    .eq("slack_user_id", slackUserId)
    .ilike("pokemon_species.name", speciesName)
    .order("level", { ascending: false })
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

module.exports = {
  getSpeciesById,
  getOwnedPokemonById,
  findUserPokemonsBySpeciesName,
};
