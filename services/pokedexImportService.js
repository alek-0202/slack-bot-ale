const axios = require("axios");
const { getSupabaseClient } = require("../database/supabase");
const { getBaseGoldByRarity } = require("./economyService");
const { classifySpeciesRarity } = require("./rarityService");

const POKE_API_BASE = "https://pokeapi.co/api/v2";
const DEFAULT_BATCH_SIZE = 12;

const GENERATION_MAP = {
  "generation-i": 1,
  "generation-ii": 2,
  "generation-iii": 3,
  "generation-iv": 4,
  "generation-v": 5,
  "generation-vi": 6,
  "generation-vii": 7,
  "generation-viii": 8,
  "generation-ix": 9,
};

function parsePokemonIdFromUrl(url) {
  if (!url) return null;
  const parsed = Number(String(url).split("/").filter(Boolean).pop());
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeGeneration(generationName) {
  if (!generationName) return null;
  return GENERATION_MAP[generationName] || null;
}

async function fetchSpeciesList(limit = null) {
  const { data } = await axios.get(`${POKE_API_BASE}/pokemon-species`, {
    params: {
      limit: 100000,
      offset: 0,
    },
  });

  const all = (data.results || [])
    .map((item) => ({
      id: parsePokemonIdFromUrl(item.url),
      name: item.name,
      url: item.url,
    }))
    .filter((item) => item.id)
    .sort((a, b) => a.id - b.id);

  if (!limit) return all;
  return all.slice(0, Math.max(1, Number(limit) || all.length));
}

function walkChainNode(node, stage, evolvesFrom, map) {
  const id = parsePokemonIdFromUrl(node?.species?.url);
  if (!id) return;

  const evolvesToIds = (node.evolves_to || [])
    .map((child) => parsePokemonIdFromUrl(child?.species?.url))
    .filter(Boolean)
    .sort((a, b) => a - b);

  map.set(id, {
    evolution_stage: stage,
    evolves_from: evolvesFrom,
    evolves_to_ids: evolvesToIds,
  });

  for (const child of node.evolves_to || []) {
    walkChainNode(child, stage + 1, id, map);
  }
}

async function buildEvolutionLookup(speciesDetails) {
  const chainByUrl = new Map();
  const lookup = new Map();

  for (const species of speciesDetails) {
    const chainUrl = species.evolution_chain?.url;
    if (!chainUrl) continue;

    if (!chainByUrl.has(chainUrl)) {
      const { data } = await axios.get(chainUrl);
      const chainMap = new Map();
      walkChainNode(data.chain, 1, null, chainMap);
      chainByUrl.set(chainUrl, chainMap);
    }

    const chainMap = chainByUrl.get(chainUrl);
    for (const [id, value] of chainMap.entries()) {
      lookup.set(id, value);
    }
  }

  return lookup;
}

async function fetchSpeciesPayload(entry, species, evolutionLookup) {
  const pokemonRes = await axios.get(`${POKE_API_BASE}/pokemon/${entry.id}`);
  const pokemon = pokemonRes.data;
  const evolution = evolutionLookup.get(entry.id) || {};
  const evolutionStage = Math.max(1, Number(evolution.evolution_stage) || 1);

  const rarity = classifySpeciesRarity({
    isLegendary: species.is_legendary,
    isMythical: species.is_mythical,
    captureRate: species.capture_rate,
    baseHappiness: species.base_happiness,
    evolutionStage,
    isBaby: species.is_baby,
  });

  return {
    id: entry.id,
    name: species.name || pokemon.name || entry.name,
    generation: normalizeGeneration(species.generation?.name),
    sprite_url:
      pokemon.sprites?.other?.["official-artwork"]?.front_default ||
      pokemon.sprites?.front_default ||
      null,
    rarity,
    evolution_stage: evolutionStage,
    evolves_from: evolution.evolves_from || null,
    evolves_to: (evolution.evolves_to_ids || [])[0] || null,
    base_value: getBaseGoldByRarity(rarity),
  };
}

function validateSpeciesPayload(species) {
  const issues = [];

  if (!Number.isInteger(species.id) || species.id <= 0) issues.push("id ausente ou inválido");
  if (!species.name || typeof species.name !== "string" || !species.name.trim()) {
    issues.push("name ausente");
  }

  return { isValid: issues.length === 0, issues };
}

async function mapInBatches(items, mapper, batchSize = DEFAULT_BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const rows = await Promise.all(batch.map(mapper));
    out.push(...rows);
  }
  return out;
}

async function importPokemonSpecies({ limit = null, batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const supabase = getSupabaseClient();
  const entries = await fetchSpeciesList(limit);

  if (!entries.length) return 0;

  const speciesDetails = await mapInBatches(
    entries,
    async (entry) => ({
      id: entry.id,
      data: (await axios.get(`${POKE_API_BASE}/pokemon-species/${entry.id}`)).data,
    }),
    batchSize,
  );

  const speciesById = new Map(speciesDetails.map((item) => [item.id, item.data]));
  const evolutionLookup = await buildEvolutionLookup(speciesDetails.map((item) => item.data));

  const payload = await mapInBatches(
    entries,
    (entry) => fetchSpeciesPayload(entry, speciesById.get(entry.id), evolutionLookup),
    batchSize,
  );

  const validPayload = [];
  for (const species of payload) {
    const validation = validateSpeciesPayload(species);
    if (!validation.isValid) {
      console.warn(
        `[pokedex-import] Registro inválido ignorado (id=${species.id}): ${validation.issues.join(", ")}`,
      );
      continue;
    }

    validPayload.push(species);
  }

  if (validPayload.length > 0) {
    const { error } = await supabase
      .from("pokemon_species")
      .upsert(validPayload, { onConflict: "id" });

    if (error) throw error;
  }

  return validPayload.length;
}

module.exports = {
  importPokemonSpecies,
  normalizeGeneration,
  parsePokemonIdFromUrl,
};
