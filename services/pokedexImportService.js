const axios = require("axios");
const { getSupabaseClient } = require("../database/supabase");

const POKE_API_BASE = "https://pokeapi.co/api/v2";

function parseIdFromUrl(url) {
  if (!url) return null;
  const id = Number(String(url).split("/").filter(Boolean).pop());
  return Number.isFinite(id) ? id : null;
}

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

function resolveEvolutionStage(id, evolvesFromById) {
  let stage = 1;
  let current = id;
  const visited = new Set();

  while (evolvesFromById.get(current)) {
    if (visited.has(current)) break;
    visited.add(current);
    current = evolvesFromById.get(current);
    stage += 1;
  }

  return stage;
}

async function fetchPokemonSpeciesPayload(id) {
  const [pokemonRes, speciesRes] = await Promise.all([
    axios.get(`${POKE_API_BASE}/pokemon/${id}`),
    axios.get(`${POKE_API_BASE}/pokemon-species/${id}`),
  ]);

  const pokemon = pokemonRes.data;
  const species = speciesRes.data;

  return {
    id,
    name: pokemon.name,
    generation: Number(species.generation?.name?.replace("generation-", "")) || null,
    sprite_url: pokemon.sprites?.front_default || null,
    evolves_from: parseIdFromUrl(species.evolves_from_species?.url),
  };
}

async function importPokemonSpecies({ limit = 151 } = {}) {
  const supabase = getSupabaseClient();
  const speciesRows = [];

  for (let id = 1; id <= limit; id += 1) {
    const species = await fetchPokemonSpeciesPayload(id);
    speciesRows.push(species);
  }

  const firstPassPayload = speciesRows.map((row) => ({
    id: row.id,
    name: row.name,
    generation: row.generation,
    sprite_url: row.sprite_url,
  }));

  const { error: firstPassError } = await supabase
    .from("pokemon_species")
    .upsert(firstPassPayload, { onConflict: "id" });

  if (firstPassError) throw firstPassError;

  const evolvesFromById = new Map(speciesRows.map((row) => [row.id, row.evolves_from || null]));
  const evolvesToById = new Map();

  for (const row of speciesRows) {
    if (!row.evolves_from) continue;

    const currentChildren = evolvesToById.get(row.evolves_from) || [];
    currentChildren.push(row.id);
    evolvesToById.set(row.evolves_from, currentChildren);
  }

  const secondPassPayload = speciesRows.map((row) => {
    const stage = resolveEvolutionStage(row.id, evolvesFromById);
    const baseRarity = rarityByStage(stage);
    const rarity = rarityByPokemonId(row.id, baseRarity);
    const evolvesToCandidates = evolvesToById.get(row.id) || [];

    return {
      id: row.id,
      evolves_from: row.evolves_from,
      evolves_to: evolvesToCandidates.length === 1 ? evolvesToCandidates[0] : null,
      evolution_stage: stage,
      rarity,
      base_value: 8 + stage * 5,
    };
  });

  const { error: secondPassError } = await supabase
    .from("pokemon_species")
    .upsert(secondPassPayload, { onConflict: "id" });

  if (secondPassError) throw secondPassError;

  return {
    totalSpecies: speciesRows.length,
    firstPassRows: firstPassPayload.length,
    secondPassRows: secondPassPayload.length,
  };
}

module.exports = {
  importPokemonSpecies,
};
