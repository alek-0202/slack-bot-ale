const { createLogger } = require("../utils/logger");

const logger = createLogger("pokemon-stats-service");

const STAT_FIELDS = ["attack", "defense", "hp", "speed"];
const SPECIES_STAT_FIELDS = ["base_attack", "base_defense", "base_hp", "base_speed"];
const STAT_SCALE_PER_LEVEL = 0.02;
const MIN_EVOLUTION_GROWTH = 1.35;

function toPositiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function hasCompleteBaseStats(species = {}) {
  return SPECIES_STAT_FIELDS.every((field) => toPositiveInteger(species[field], 0) > 0);
}

function getLevelStatMultiplier(level = 1) {
  const safeLevel = Math.max(1, toPositiveInteger(level, 1));
  return Math.pow(1 + STAT_SCALE_PER_LEVEL, Math.max(safeLevel - 1, 0));
}

function getSpeciesBaseStats(species = {}, options = {}) {
  const fallbackStats = options.fallbackStats || {};
  const safeFallback = {
    attack: toPositiveInteger(fallbackStats.attack, 10),
    defense: toPositiveInteger(fallbackStats.defense, 10),
    hp: toPositiveInteger(fallbackStats.hp, 10),
    speed: toPositiveInteger(fallbackStats.speed, 10),
  };

  const baseStats = {
    attack: toPositiveInteger(species.base_attack, safeFallback.attack),
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

function calculatePokemonStats({ species = {}, level = 1, fallbackStats = {} } = {}) {
  const baseStats = getSpeciesBaseStats(species, { fallbackStats });
  const multiplier = getLevelStatMultiplier(level);

  return {
    attack: Math.max(1, Math.ceil(baseStats.attack * multiplier)),
    defense: Math.max(1, Math.ceil(baseStats.defense * multiplier)),
    hp: Math.max(1, Math.ceil(baseStats.hp * multiplier)),
    speed: Math.max(1, Math.ceil(baseStats.speed * multiplier)),
  };
}

function getStatSnapshotMetadata({ species = {}, level = 1, previousSpeciesId = null } = {}) {
  return {
    speciesId: species.id || null,
    level: Math.max(1, toPositiveInteger(level, 1)),
    previousSpeciesId: previousSpeciesId || null,
  };
}

module.exports = {
  STAT_FIELDS,
  SPECIES_STAT_FIELDS,
  STAT_SCALE_PER_LEVEL,
  MIN_EVOLUTION_GROWTH,
  hasCompleteBaseStats,
  getLevelStatMultiplier,
  getSpeciesBaseStats,
  calculatePokemonStats,
  getStatSnapshotMetadata,
};
