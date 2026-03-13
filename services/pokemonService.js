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

async function insertUserPokemon({ slackUserId, speciesId, level, shiny }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .insert({
      slack_user_id: slackUserId,
      species_id: speciesId,
      level,
      shiny,
    })
    .select("id, species_id, level, shiny, captured_at")
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

module.exports = {
  getAllSpecies,
  insertUserPokemon,
  getProfileStats,
};
