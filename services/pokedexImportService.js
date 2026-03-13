const axios = require("axios");
const { getSupabaseClient } = require("../database/supabase");

const POKE_API_BASE = "https://pokeapi.co/api/v2";

function rarityByStage(stage) {
  if (stage <= 1) return "common";
  if (stage === 2) return "uncommon";
  if (stage === 3) return "rare";
  return "epic";
}

function rarityByPokemonId(id, baseRarity) {
  if ([144, 145, 146, 150, 151].includes(id)) return "legendary";
  if (id >= 243 && id <= 251) return "legendary";
  return baseRarity;
}

async function fetchPokemonSpeciesPayload(id) {
  const [pokemonRes, speciesRes] = await Promise.all([
    axios.get(`${POKE_API_BASE}/pokemon/${id}`),
    axios.get(`${POKE_API_BASE}/pokemon-species/${id}`),
  ]);

  const pokemon = pokemonRes.data;
  const species = speciesRes.data;

  const evolvesFromId = species.evolves_from_species?.url
    ? Number(species.evolves_from_species.url.split("/").filter(Boolean).pop())
    : null;

  const stage = evolvesFromId ? 2 : 1;
  const rarity = rarityByPokemonId(id, rarityByStage(stage));

  return {
    id,
    name: pokemon.name,
    generation: Number(species.generation?.name?.replace("generation-", "")) || null,
    sprite_url: pokemon.sprites?.front_default || null,
    rarity,
    evolution_stage: stage,
    evolves_from: evolvesFromId,
    base_value: stage === 1 ? 10 : 18,
  };
}

async function importPokemonSpecies({ limit = 151 } = {}) {
  const supabase = getSupabaseClient();
  const payload = [];

  for (let id = 1; id <= limit; id += 1) {
    const species = await fetchPokemonSpeciesPayload(id);
    payload.push(species);
  }

  const { error } = await supabase
    .from("pokemon_species")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;

  return payload.length;
}

module.exports = {
  importPokemonSpecies,
};
