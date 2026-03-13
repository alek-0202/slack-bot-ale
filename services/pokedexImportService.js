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

function buildEvolutionUpdates(speciesPayload, existingSpeciesIds) {
  const importedIds = new Set(speciesPayload.map((species) => species.id));
  const knownSpeciesIds = new Set([...existingSpeciesIds, ...importedIds]);

  const evolvesToBySpecies = new Map();
  for (const species of speciesPayload) {
    if (!species.evolves_from || !knownSpeciesIds.has(species.evolves_from)) continue;

    const nextSpecies = evolvesToBySpecies.get(species.evolves_from) || [];
    nextSpecies.push(species.id);
    evolvesToBySpecies.set(species.evolves_from, nextSpecies);
  }

  return speciesPayload.map((species) => {
    const canReferencePrevious =
      species.evolves_from && knownSpeciesIds.has(species.evolves_from);

    const possibleNextSpecies = (evolvesToBySpecies.get(species.id) || []).sort((a, b) => a - b);
    const evolvesTo = possibleNextSpecies.length === 1 ? possibleNextSpecies[0] : null;

    const evolutionStage = canReferencePrevious ? 2 : 1;
    const rarity = rarityByPokemonId(species.id, rarityByStage(evolutionStage));

    return {
      id: species.id,
      evolves_from: canReferencePrevious ? species.evolves_from : null,
      evolves_to: evolvesTo,
      evolution_stage: evolutionStage,
      rarity,
      base_value: evolutionStage === 1 ? 10 : 18,
    };
  });
}

async function importPokemonSpecies({ limit = 151 } = {}) {
  const supabase = getSupabaseClient();
  const payload = [];

  for (let id = 1; id <= limit; id += 1) {
    const species = await fetchPokemonSpeciesPayload(id);
    payload.push(species);
  }

  const basePayload = payload.map((species) => ({
    id: species.id,
    name: species.name,
    generation: species.generation,
    sprite_url: species.sprite_url,
    rarity: species.rarity,
    evolution_stage: species.evolution_stage,
    base_value: species.base_value,
  }));

  const { error: baseUpsertError } = await supabase
    .from("pokemon_species")
    .upsert(basePayload, { onConflict: "id" });

  if (baseUpsertError) throw baseUpsertError;

  const { data: existingSpecies, error: existingSpeciesError } = await supabase
    .from("pokemon_species")
    .select("id");

  if (existingSpeciesError) throw existingSpeciesError;

  const existingSpeciesIds = new Set((existingSpecies || []).map((species) => species.id));
  const evolutionPayload = buildEvolutionUpdates(payload, existingSpeciesIds);

  const { error: evolutionUpsertError } = await supabase
    .from("pokemon_species")
    .upsert(evolutionPayload, { onConflict: "id" });

  if (evolutionUpsertError) throw evolutionUpsertError;

  return payload.length;
}

module.exports = {
  importPokemonSpecies,
};
