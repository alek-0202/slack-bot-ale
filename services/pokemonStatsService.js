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

const IV_STAT_RANGES = Object.freeze({
  attack: { min: -6, max: 12 },
  defense: { min: -6, max: 12 },
  magic: { min: -8, max: 18 },
  hp: { min: -10, max: 20 },
  speed: { min: -5, max: 15 },
});
const SHINY_TYPE = Object.freeze({
  PRIME: "prime",
  NORMAL: "normal",
});
const SHINY_MULTIPLIER = 1.15;
const SHINY_PRIME_BONUS = 10;
const LEGENDARY_BASE_BONUS = 15;
const MYTHICAL_BASE_BONUS = 20;
const SHINY_MULTIPLIER_BY_RARITY = Object.freeze({
  common: 1.07,
  uncommon: 1.07,
  rare: 1.10,
  epic: 1.15,
  legendary: 1.18,
  mythical: 1.20,
});
const SHINY_PRIME_IV_BONUS_MIN_RARITIES = new Set(["rare", "epic", "legendary", "mythical"]);

function hasCompleteBaseStats(species = {}) {
  return SPECIES_STAT_FIELDS.every((field) => toPositiveInteger(species[field], 0) > 0);
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeRarity(rarity) {
  return String(rarity || "").toLowerCase();
}

function getShinyStatMultiplier(rarity) {
  return SHINY_MULTIPLIER_BY_RARITY[normalizeRarity(rarity)] || SHINY_MULTIPLIER;
}

function canShinyPrimeReceiveIvCapBonus(rarity) {
  return SHINY_PRIME_IV_BONUS_MIN_RARITIES.has(normalizeRarity(rarity));
}

function rollPokemonIvOffsets({ shiny = false, shinyType = null, rarity = null } = {}) {
  const isPrime = shiny && shinyType === SHINY_TYPE.PRIME;
  const primeBoost = isPrime && canShinyPrimeReceiveIvCapBonus(rarity) ? SHINY_PRIME_BONUS : 0;
  return {
    attack_iv: isPrime
      ? IV_STAT_RANGES.attack.max + primeBoost
      : randomIntInclusive(IV_STAT_RANGES.attack.min, IV_STAT_RANGES.attack.max),
    defense_iv: isPrime
      ? IV_STAT_RANGES.defense.max + primeBoost
      : randomIntInclusive(IV_STAT_RANGES.defense.min, IV_STAT_RANGES.defense.max),
    magic_iv: isPrime
      ? IV_STAT_RANGES.magic.max + primeBoost
      : randomIntInclusive(IV_STAT_RANGES.magic.min, IV_STAT_RANGES.magic.max),
    hp_iv: isPrime
      ? IV_STAT_RANGES.hp.max + primeBoost
      : randomIntInclusive(IV_STAT_RANGES.hp.min, IV_STAT_RANGES.hp.max),
    speed_iv: isPrime
      ? IV_STAT_RANGES.speed.max + primeBoost
      : randomIntInclusive(IV_STAT_RANGES.speed.min, IV_STAT_RANGES.speed.max),
  };
}

function normalizeIvOffsets(offsets = {}) {
  return {
    attack: Number(offsets.attack_iv ?? offsets.attack ?? 0) || 0,
    magic: Number(offsets.magic_iv ?? offsets.magic ?? 0) || 0,
    defense: Number(offsets.defense_iv ?? offsets.defense ?? 0) || 0,
    hp: Number(offsets.hp_iv ?? offsets.hp ?? 0) || 0,
    speed: Number(offsets.speed_iv ?? offsets.speed ?? 0) || 0,
  };
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

  const rarity = String(species.rarity || "").toLowerCase();
  const rarityBonus = rarity === "mythical"
    ? MYTHICAL_BASE_BONUS
    : rarity === "legendary"
      ? LEGENDARY_BASE_BONUS
      : 0;

  if (rarityBonus > 0) {
    for (const key of Object.keys(baseStats)) {
      baseStats[key] += rarityBonus;
    }
  }

  if (!hasCompleteBaseStats(species)) {
    logger.warn("Espécie sem base stats completos; usando fallback seguro", {
      speciesId: species.id || null,
      speciesName: species.name || null,
      fallbackStats: safeFallback,
    });
  }

  return baseStats;
}

function applyIvAndShinyModifiers({ baseStats = {}, ivOffsets = {}, shiny = false, shinyType = null, rarity = null } = {}) {
  const normalizedOffsets = normalizeIvOffsets(ivOffsets);
  const isPrime = shinyType === SHINY_TYPE.PRIME;
  const primeBonus = isPrime && canShinyPrimeReceiveIvCapBonus(rarity) ? SHINY_PRIME_BONUS : 0;
  const shinyMultiplier = shiny ? getShinyStatMultiplier(rarity) : 1;

  return STAT_FIELDS.reduce((acc, statKey) => {
    const value = Math.max(1, Number(baseStats[statKey] || 0) + Number(normalizedOffsets[statKey] || 0) + primeBonus);
    acc[statKey] = Math.max(1, Math.round(value * shinyMultiplier));
    return acc;
  }, {});
}

function getLevelStatMultiplier(level = 1) {
  const safeLevel = normalizeLevel(level);
  const result = calculateProgressedStats({
    baseStats: { attack: 100, magic: 100, defense: 100, hp: 100, speed: 100 },
    level: safeLevel,
  });

  return result.stats.attack / 100;
}

function calculatePokemonStats({ species = {}, level = 1, fallbackStats = {}, ivOffsets = {}, shiny = false, shinyType = null, log = false, context = {} } = {}) {
  const baseStats = getSpeciesBaseStats(species, { fallbackStats });
  const rarity = normalizeRarity(species.rarity);
  const baseStatsWithIvPrime = applyIvAndShinyModifiers({
    baseStats,
    ivOffsets,
    shiny: false,
    shinyType: shiny ? shinyType : null,
    rarity,
  });
  const progression = calculateProgressedStats({
    baseStats: baseStatsWithIvPrime,
    level,
    log,
    context: {
      speciesId: species.id || null,
      speciesName: species.name || null,
      ...context,
    },
  });

  return applyIvAndShinyModifiers({
    baseStats: progression.stats,
    ivOffsets: {},
    shiny,
    shinyType: null,
    rarity,
  });
}

function getPokemonProgressionSnapshot({ species = {}, level = 1, fallbackStats = {}, ivOffsets = {}, shiny = false, shinyType = null, log = false, context = {} } = {}) {
  const baseStats = getSpeciesBaseStats(species, { fallbackStats });
  const rarity = normalizeRarity(species.rarity);
  const baseStatsWithIvPrime = applyIvAndShinyModifiers({
    baseStats,
    ivOffsets,
    shiny: false,
    shinyType: shiny ? shinyType : null,
    rarity,
  });
  const progression = calculateProgressedStats({
    baseStats: baseStatsWithIvPrime,
    level,
    log,
    context: {
      speciesId: species.id || null,
      speciesName: species.name || null,
      ...context,
    },
  });

  return {
    ...progression,
    stats: applyIvAndShinyModifiers({
    baseStats: progression.stats,
    ivOffsets: {},
    shiny,
    shinyType: null,
    rarity,
  }),
  };
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
  IV_STAT_RANGES,
  SHINY_TYPE,
  SHINY_MULTIPLIER,
  SHINY_MULTIPLIER_BY_RARITY,
  SHINY_PRIME_BONUS,
  getShinyStatMultiplier,
  canShinyPrimeReceiveIvCapBonus,
  LEGENDARY_BASE_BONUS,
  MYTHICAL_BASE_BONUS,
  hasCompleteBaseStats,
  rollPokemonIvOffsets,
  normalizeIvOffsets,
  applyIvAndShinyModifiers,
  getLevelStatMultiplier,
  getSpeciesBaseStats,
  getPokemonStars,
  formatPokemonStars,
  calculatePokemonStats,
  getPokemonProgressionSnapshot,
  getStatSnapshotMetadata,
};
