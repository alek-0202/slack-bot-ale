const { getSupabaseClient } = require("../database/supabase");

async function getAllSpecies() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_species")
    .select("id, name, sprite_url, rarity, base_value, evolution_stage, element_types, base_attack, base_defense, base_hp, base_speed")
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
    .select("id, species_id, level, shiny, attack, defense, hp, speed, source, captured_at, upgrade_spent_gold")
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
      "id, species_id, level, shiny, attack, defense, hp, speed, source, captured_at, upgrade_spent_gold, pokemon_species(id, name, sprite_url, rarity, element_types, base_attack, base_defense, base_hp, base_speed)",
      
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
    .select(
      "id, slack_user_id, species_id, level, shiny, attack, defense, hp, speed, upgrade_spent_gold, pokemon_species(id, name, rarity, base_value, sprite_url, element_types, evolves_to, evolution_stage, base_attack, base_defense, base_hp, base_speed)",
    )
    .eq("id", pokemonId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getUserPokemons(slackUserId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .select(
      "id, species_id, level, shiny, attack, defense, hp, speed, source, captured_at, upgrade_spent_gold, pokemon_species(id, name, sprite_url, rarity, element_types, base_attack, base_defense, base_hp, base_speed)",
    )
    .eq("slack_user_id", slackUserId)
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw error;
  return data || [];
}

function buildPokedexDisplayEntries(pokemons) {
  const grouped = new Map();
  const entries = [];

  for (const pokemon of pokemons || []) {
    const canGroup = Number(pokemon.level || 1) === 1;
    const groupKey = `${pokemon.species_id}|${pokemon.shiny ? 1 : 0}|${pokemon.attack}|${pokemon.defense}|${pokemon.hp}|${pokemon.speed}`;

    if (!canGroup) {
      entries.push({
        ...pokemon,
        quantity: 1,
        pokemonIds: [pokemon.id],
        grouped: false,
      });
      continue;
    }

    const current = grouped.get(groupKey);
    if (!current) {
      const groupedEntry = {
        ...pokemon,
        quantity: 1,
        pokemonIds: [pokemon.id],
        grouped: false,
      };
      grouped.set(groupKey, groupedEntry);
      entries.push(groupedEntry);
      continue;
    }

    current.quantity += 1;
    current.pokemonIds.push(pokemon.id);
    current.grouped = true;
  }

  return entries;
}

module.exports = {
  getAllSpecies,
  insertUserPokemon,
  getProfileStats,
  getUserPokemonPage,
  getUserPokemonById,
  getUserPokemons,
  buildPokedexDisplayEntries,
};
