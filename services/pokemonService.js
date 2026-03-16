const { getSupabaseClient } = require("../database/supabase");

async function getAllSpecies() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_species")
    .select("id, name, sprite_url, rarity, base_value, evolution_stage")
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function insertUserPokemon({
  slackUserId,
  speciesId,
  level,
  shiny,
  stats = {},
  source = "capture",
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .insert({
      slack_user_id: slackUserId,
      species_id: speciesId,
      level,
      shiny,
      attack: stats.attack,
      defense: stats.defense,
      hp: stats.hp,
      speed: stats.speed,
      source,
    })
    .select("id, species_id, level, shiny, attack, defense, hp, speed, source, captured_at")
    .single();

  if (error) throw error;
  return data;
}

async function getProfileStats(slackUserId) {
  const supabase = getSupabaseClient();

  const { count: totalCaptured, error: totalError } = await supabase
    .from("user_pokemons")
    .select("id", { count: "exact", head: true })
    .eq("slack_user_id", slackUserId);
  if (totalError) throw totalError;

  const { data: uniqueRows, error: uniqueError } = await supabase
    .from("user_pokemons")
    .select("species_id")
    .eq("slack_user_id", slackUserId);
  if (uniqueError) throw uniqueError;

  const uniqueCount = new Set((uniqueRows || []).map((row) => row.species_id)).size;

  return {
    totalCaptured: totalCaptured || 0,
    uniqueCount,
  };
}

async function getUserPokemonPage(slackUserId, index) {
  const supabase = getSupabaseClient();
  const safeIndex = Number.isInteger(index) ? index : Number(index) || 0;
  const clampedIndex = Math.max(0, safeIndex);

  const { data, count, error } = await supabase
    .from("user_pokemons")
    .select(
      "id, species_id, level, shiny, attack, defense, hp, speed, source, captured_at, pokemon_species(id, name, sprite_url, rarity)",
      { count: "exact" },
    )
    .eq("slack_user_id", slackUserId)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false })
    .range(clampedIndex, clampedIndex);

  if (error) throw error;

  return {
    total: count || 0,
    index: clampedIndex,
    entry: data?.[0] || null,
  };
}

async function getUserPokemonById(slackUserId, pokemonId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .select("id, slack_user_id, species_id, level, shiny, attack, defense, hp, speed, pokemon_species(id, name, rarity)")
    .eq("id", pokemonId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

module.exports = {
  getAllSpecies,
  insertUserPokemon,
  getProfileStats,
  getUserPokemonPage,
  getUserPokemonById,
};
