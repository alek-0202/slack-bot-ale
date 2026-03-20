const axios = require("axios");
const { getSupabaseClient } = require("../database/supabase");
const { getBaseGoldByRarity } = require("./economyService");
const { classifySpeciesRarity } = require("./rarityService");
const { normalizePokemonTypes } = require("./pokemonTypeService");
const { createLogger } = require("../utils/logger");
const { MIN_EVOLUTION_GROWTH } = require("./pokemonStatsService");

const POKE_API_BASE = "https://pokeapi.co/api/v2";
const DEFAULT_BATCH_SIZE = 12;
const logger = createLogger("pokedex-import");

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

const RARITY_BASE_STATS = {
  common: { attack: 10, magic: 10, defense: 10, hp: 14, speed: 9 },
  uncommon: { attack: 12, magic: 12, defense: 12, hp: 17, speed: 11 },
  rare: { attack: 15, magic: 15, defense: 14, hp: 21, speed: 14 },
  epic: { attack: 19, magic: 19, defense: 18, hp: 26, speed: 17 },
  legendary: { attack: 24, magic: 24, defense: 22, hp: 32, speed: 21 },
  mythical: { attack: 30, magic: 30, defense: 28, hp: 39, speed: 26 },
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

function deriveBaseStats({ rarity, evolutionStage }) {
  const raritySeed = RARITY_BASE_STATS[rarity] || RARITY_BASE_STATS.common;
  const stageMultiplier = Math.pow(MIN_EVOLUTION_GROWTH, Math.max((Number(evolutionStage) || 1) - 1, 0));

  return {
    base_attack: Math.ceil(raritySeed.attack * stageMultiplier),
    base_magic: Math.ceil((raritySeed.magic || raritySeed.attack) * stageMultiplier),
    base_defense: Math.ceil(raritySeed.defense * stageMultiplier),
    base_hp: Math.ceil(raritySeed.hp * stageMultiplier),
    base_speed: Math.ceil(raritySeed.speed * stageMultiplier),
  };
}

function getPokemonStatValue(pokemon, statName, fallback = null) {
  const entry = (pokemon?.stats || []).find((item) => item?.stat?.name === statName);
  const value = Number(entry?.base_stat);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
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
  const derivedBaseStats = deriveBaseStats({ rarity, evolutionStage });

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
    element_types: normalizePokemonTypes(
      (pokemon.types || [])
        .sort((a, b) => (a.slot || 0) - (b.slot || 0))
        .map((typeEntry) => typeEntry.type?.name),
    ),
    ...derivedBaseStats,
    // PokeAPI não possui um atributo "magic" nativo; usamos "special-attack" como base oficial mais próxima.
    base_magic:
      getPokemonStatValue(pokemon, "special-attack", null) ||
      getPokemonStatValue(pokemon, "attack", null) ||
      derivedBaseStats.base_magic,
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
    logger.info("Persistindo espécies importadas", { count: validPayload.length });
    const { error } = await supabase
      .from("pokemon_species")
      .upsert(validPayload, { onConflict: "id" });

    if (error) throw error;
  }

  logger.info("Importação da pokédex concluída", {
    importedCount: validPayload.length,
    hasTypesCount: validPayload.filter((species) => species.element_types?.length).length,
  });

  return validPayload.length;
}

module.exports = {
  importPokemonSpecies,
  normalizeGeneration,
  parsePokemonIdFromUrl,
  deriveBaseStats,
};
