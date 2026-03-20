const { createLogger } = require("../utils/logger");
const {
  STAT_FIELDS,
  MAX_LEVEL,
  LEVEL_GROWTH_RATES,
  MILESTONE_GROWTH_RATES,
  LEVEL_FIFTY_FLAT_BONUS,
  toPositiveInteger,
  normalizeLevel,
  getPokemonStars,
  formatPokemonStars,
  calculateProgressedStats,
} = require("./pokemonProgressionService");

const logger = createLogger("pokemon-stats-service");

const SPECIES_STAT_FIELDS = ["base_attack", "base_magic", "base_defense", "base_hp", "base_speed"];
const MIN_EVOLUTION_GROWTH = 1.35;

function hasCompleteBaseStats(species = {}) {
  return SPECIES_STAT_FIELDS.every((field) => toPositiveInteger(species[field], 0) > 0);
}

function getSpeciesBaseStats(species = {}, options = {}) {
  const fallbackStats = options.fallbackStats || {};
  const safeFallback = {
    attack: toPositiveInteger(fallbackStats.attack, 10),
    magic: toPositiveInteger(fallbackStats.magic, toPositiveInteger(fallbackStats.attack, 10)),
    defense: toPositiveInteger(fallbackStats.defense, 10),
    hp: toPositiveInteger(fallbackStats.hp, 10),
    speed: toPositiveInteger(fallbackStats.speed, 10),
  };

  const baseStats = {
    attack: toPositiveInteger(species.base_attack, safeFallback.attack),
    magic: toPositiveInteger(species.base_magic, safeFallback.magic),
    defense: toPositiveInteger(species.base_defense, safeFallback.defense),
    hp: toPositiveInteger(species.base_hp, safeFallback.hp),
    speed: toPositiveInteger(species.base_speed, safeFallback.speed),
  };

  if (!hasCompleteBaseStats(species)) {
    logger.warn("Espécie sem base stats completos; usando fallback seguro", {
      speciesId: species.id || null,
      speciesName: species.name || null,
      fallbackStats: safeFallback,
    });
  }

  return baseStats;
}

function getLevelStatMultiplier(level = 1) {
  const safeLevel = normalizeLevel(level);
  const result = calculateProgressedStats({
    baseStats: { attack: 100, magic: 100, defense: 100, hp: 100, speed: 100 },
    level: safeLevel,
  });

  return result.stats.attack / 100;
}

function calculatePokemonStats({ species = {}, level = 1, fallbackStats = {}, log = false, context = {} } = {}) {
  const baseStats = getSpeciesBaseStats(species, { fallbackStats });
  const progression = calculateProgressedStats({
    baseStats,
    level,
    log,
    context: {
      speciesId: species.id || null,
      speciesName: species.name || null,
      ...context,
    },
  });

  return progression.stats;
}

function getPokemonProgressionSnapshot({ species = {}, level = 1, fallbackStats = {}, log = false, context = {} } = {}) {
  const baseStats = getSpeciesBaseStats(species, { fallbackStats });
  return calculateProgressedStats({
    baseStats,
    level,
    log,
    context: {
      speciesId: species.id || null,
      speciesName: species.name || null,
      ...context,
    },
  });
}

function getStatSnapshotMetadata({ species = {}, level = 1, previousSpeciesId = null } = {}) {
  const safeLevel = normalizeLevel(level);
  return {
    speciesId: species.id || null,
    level: safeLevel,
    previousSpeciesId: previousSpeciesId || null,
    stars: getPokemonStars(safeLevel),
    starText: formatPokemonStars(safeLevel),
  };
}

module.exports = {
  STAT_FIELDS,
  SPECIES_STAT_FIELDS,
  MAX_LEVEL,
  LEVEL_GROWTH_RATES,
  MILESTONE_GROWTH_RATES,
  LEVEL_FIFTY_FLAT_BONUS,
  MIN_EVOLUTION_GROWTH,
  hasCompleteBaseStats,
  getLevelStatMultiplier,
  getSpeciesBaseStats,
  getPokemonStars,
  formatPokemonStars,
  calculatePokemonStats,
  getPokemonProgressionSnapshot,
  getStatSnapshotMetadata,
};
