const { getSupabaseClient } = require("../database/supabase");

async function getAllSpecies() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_species")
    .select("id, name, sprite_url, rarity, base_value, evolution_stage, element_types, base_attack, base_magic, base_defense, base_hp, base_speed")
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function insertUserPokemon({
  slackUserId,
  speciesId,
  level,
  shiny,
  shinyType = null,
  ivOffsets = {},
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
      shiny_type: shiny ? (shinyType || "prime") : null,
      attack_iv: ivOffsets.attack_iv ?? 0,
      magic_iv: ivOffsets.magic_iv ?? 0,
      defense_iv: ivOffsets.defense_iv ?? 0,
      hp_iv: ivOffsets.hp_iv ?? 0,
      speed_iv: ivOffsets.speed_iv ?? 0,
      attack: stats.attack,
      magic: stats.magic ?? stats.attack,
      defense: stats.defense,
      hp: stats.hp,
      current_hp: stats.currentHp ?? stats.hp,
      speed: stats.speed,
      source,
      is_battle_available: false,
      is_favorite: false,
    })
    .select("id, species_id, level, shiny, shiny_type, attack_iv, magic_iv, defense_iv, hp_iv, speed_iv, crit_level, dodge_level, elemental_level, attack, magic, defense, hp, current_hp, speed, source, captured_at, upgrade_spent_gold, book_bonus_attack, book_bonus_magic, book_bonus_defense, book_bonus_hp, book_bonus_speed, is_battle_available, is_favorite")
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
      "id, species_id, level, shiny, shiny_type, attack_iv, magic_iv, defense_iv, hp_iv, speed_iv, crit_level, dodge_level, elemental_level, attack, magic, defense, hp, current_hp, speed, source, captured_at, upgrade_spent_gold, book_bonus_attack, book_bonus_magic, book_bonus_defense, book_bonus_hp, book_bonus_speed, is_battle_available, is_favorite, pokemon_species(id, name, sprite_url, rarity, element_types, evolves_to, evolution_stage, base_attack, base_magic, base_defense, base_hp, base_speed)",
      
      { count: "exact" },
    )
    .eq("slack_user_id", slackUserId)
    .order("is_favorite", { ascending: false })
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
      "id, slack_user_id, species_id, level, shiny, attack, magic, defense, hp, current_hp, speed, upgrade_spent_gold, book_bonus_attack, book_bonus_magic, book_bonus_defense, book_bonus_hp, book_bonus_speed, is_battle_available, is_favorite, pokemon_species(id, name, rarity, base_value, sprite_url, element_types, evolves_to, evolution_stage, base_attack, base_magic, base_defense, base_hp, base_speed)",
    )
    .eq("id", pokemonId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getUserPokemonsByIds(slackUserId, pokemonIds) {
  const safeIds = [...new Set((pokemonIds || []).map((id) => Number.parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!safeIds.length) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .select(
      "id, slack_user_id, species_id, level, shiny, attack, magic, defense, hp, current_hp, speed, upgrade_spent_gold, book_bonus_attack, book_bonus_magic, book_bonus_defense, book_bonus_hp, book_bonus_speed, is_battle_available, is_favorite, pokemon_species(id, name, rarity, base_value, sprite_url, element_types, evolves_to, evolution_stage, base_attack, base_magic, base_defense, base_hp, base_speed)",
    )
    .eq("slack_user_id", slackUserId)
    .in("id", safeIds);

  if (error) throw error;
  return data || [];
}

async function getUserPokemons(slackUserId, options = {}) {
  const supabase = getSupabaseClient();
  const onlyBattleAvailable = options.onlyBattleAvailable === true;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : null;

  let query = supabase
    .from("user_pokemons")
    .select(
      "id, species_id, level, shiny, shiny_type, attack_iv, magic_iv, defense_iv, hp_iv, speed_iv, crit_level, dodge_level, elemental_level, attack, magic, defense, hp, current_hp, speed, source, captured_at, upgrade_spent_gold, book_bonus_attack, book_bonus_magic, book_bonus_defense, book_bonus_hp, book_bonus_speed, is_battle_available, is_favorite, pokemon_species(id, name, sprite_url, rarity, element_types, evolves_to, evolution_stage, base_attack, base_magic, base_defense, base_hp, base_speed)",
    )
    .eq("slack_user_id", slackUserId);

  if (onlyBattleAvailable) query = query.eq("is_battle_available", true);

  query = query
    .order("is_favorite", { ascending: false })
    .order("captured_at", { ascending: false })
    .order("id", { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

function buildPokedexDisplayEntries(pokemons) {
  const grouped = new Map();
  const entries = [];

  for (const pokemon of pokemons || []) {
    const canGroup = Number(pokemon.level || 1) === 1;
    const groupKey = `${pokemon.species_id}|${pokemon.shiny ? 1 : 0}|${pokemon.attack}|${pokemon.magic ?? pokemon.attack}|${pokemon.defense}|${pokemon.hp}|${pokemon.speed}`;

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



function normalizePokemonFilter(rawFilter = {}) {
  const filter = rawFilter || {};
  const rarity = filter.rarity ? String(filter.rarity).toLowerCase() : null;
  const element = filter.element ? String(filter.element).toLowerCase() : null;
  return { rarity, element };
}

function matchesPokemonFilter(pokemon, filter = {}) {
  const normalized = normalizePokemonFilter(filter);
  if (normalized.rarity && String(pokemon?.pokemon_species?.rarity || '').toLowerCase() !== normalized.rarity) return false;
  if (normalized.element) {
    const types = Array.isArray(pokemon?.pokemon_species?.element_types)
      ? pokemon.pokemon_species.element_types.map((type) => String(type).toLowerCase())
      : [];
    if (!types.includes(normalized.element)) return false;
  }
  return true;
}

function filterUserPokemons(pokemons = [], filter = {}) {
  const normalized = normalizePokemonFilter(filter);
  if (!normalized.rarity && !normalized.element) return pokemons;
  return pokemons.filter((pokemon) => matchesPokemonFilter(pokemon, normalized));
}

async function updatePokemonBattleAvailability(slackUserId, pokemonId, isBattleAvailable) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .update({ is_battle_available: Boolean(isBattleAvailable) })
    .eq("id", pokemonId)
    .eq("slack_user_id", slackUserId)
    .select("id, is_battle_available")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function togglePokemonFavorite(slackUserId, pokemonId) {
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);
  if (!pokemon) return null;

  return setPokemonFavorite(slackUserId, pokemonId, !pokemon.is_favorite);
}

async function setPokemonFavorite(slackUserId, pokemonId, isFavorite) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_pokemons")
    .update({ is_favorite: Boolean(isFavorite) })
    .eq("id", pokemonId)
    .eq("slack_user_id", slackUserId)
    .select("id, is_favorite")
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
  getUserPokemonsByIds,
  getUserPokemons,
  buildPokedexDisplayEntries,
  normalizePokemonFilter,
  filterUserPokemons,
  updatePokemonBattleAvailability,
  togglePokemonFavorite,
  setPokemonFavorite,
};
