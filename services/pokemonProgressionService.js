const { createLogger } = require("../utils/logger");

const logger = createLogger("pokemon-progression-service");

const MAX_LEVEL = 50;
const STAR_STEP = 10;
const MAX_STARS = 5;
const DEFAULT_BASE_STAT = 10;
const LEVEL_GROWTH_RATES = Object.freeze({
  attack: 0.18,
  magic: 0.19,
  defense: 0.18,
  hp: 0.24,
  speed: 0.10,
});
const MILESTONE_GROWTH_RATES = Object.freeze({
  attack: 0.25,
  magic: 0.26,
  defense: 0.25,
  hp: 0.35,
  speed: 0.15,
});
const LEVEL_FIFTY_FLAT_BONUS = Object.freeze({
  attack: 5,
  magic: 6,
  defense: 5,
  hp: 15,
  speed: 5,
});
const STAT_FIELDS = ["attack", "magic", "defense", "hp", "speed"];

function toPositiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function normalizeLevel(level = 1) {
  return Math.max(1, Math.min(MAX_LEVEL, toPositiveInteger(level, 1)));
}

function roundStat(value) {
  return Math.max(1, Math.round(Number(value) || 0));
}

function getPokemonStars(level = 1) {
  return Math.max(0, Math.min(MAX_STARS, Math.floor(normalizeLevel(level) / STAR_STEP)));
}

function formatPokemonStars(level = 1) {
  const stars = getPokemonStars(level);
  return stars > 0 ? "★".repeat(stars) : "-";
}

function calculateSingleStat({ baseValue, level, statKey }) {
  const safeBase = toPositiveInteger(baseValue, DEFAULT_BASE_STAT);
  const safeLevel = normalizeLevel(level);
  const levelGains = Math.max(safeLevel - 1, 0);
  const milestoneCount = getPokemonStars(safeLevel);
  const standardValue = safeBase * (1 + (LEVEL_GROWTH_RATES[statKey] * levelGains));
  const milestoneValue = safeBase * (MILESTONE_GROWTH_RATES[statKey] * milestoneCount);
  let result = roundStat(standardValue + milestoneValue);

  if (safeLevel === MAX_LEVEL) {
    result = roundStat(result + LEVEL_FIFTY_FLAT_BONUS[statKey]);
  }

  return result;
}

function buildProgressionBreakdown(level = 1) {
  const safeLevel = normalizeLevel(level);
  const milestones = [];

  for (let currentLevel = 2; currentLevel <= safeLevel; currentLevel += 1) {
    const isMilestone = currentLevel % STAR_STEP === 0;
    milestones.push({
      level: currentLevel,
      type: isMilestone ? "milestone" : "standard",
      milestoneApplied: isMilestone,
      level50BonusApplied: currentLevel === MAX_LEVEL,
      stars: getPokemonStars(currentLevel),
    });
  }

  return {
    level: safeLevel,
    totalGains: Math.max(safeLevel - 1, 0),
    milestoneLevels: milestones.filter((entry) => entry.milestoneApplied).map((entry) => entry.level),
    stars: getPokemonStars(safeLevel),
    steps: milestones,
  };
}

function calculateProgressedStats({ baseStats = {}, level = 1, log = false, context = {} } = {}) {
  const safeLevel = normalizeLevel(level);
  const currentStats = STAT_FIELDS.reduce((stats, field) => {
    stats[field] = calculateSingleStat({ baseValue: baseStats[field], level: safeLevel, statKey: field });
    return stats;
  }, {});

  const milestonesApplied = [];
  const perLevelLog = [];
  for (let currentLevel = 2; currentLevel <= safeLevel; currentLevel += 1) {
    const milestoneApplied = currentLevel % STAR_STEP === 0;
    if (milestoneApplied) milestonesApplied.push(currentLevel);

    perLevelLog.push({
      level: currentLevel,
      final: STAT_FIELDS.reduce((stats, field) => {
        stats[field] = calculateSingleStat({ baseValue: baseStats[field], level: currentLevel, statKey: field });
        return stats;
      }, {}),
      milestoneApplied,
      level50BonusApplied: currentLevel === MAX_LEVEL,
      stars: getPokemonStars(currentLevel),
    });
  }

  const result = {
    level: safeLevel,
    stats: currentStats,
    stars: getPokemonStars(safeLevel),
    starText: formatPokemonStars(safeLevel),
    milestonesApplied,
    level50BonusApplied: safeLevel >= MAX_LEVEL,
    progressionSteps: perLevelLog,
  };

  if (log) {
    logger.info("Stats recalculados com progressão centralizada", {
      ...context,
      level: safeLevel,
      baseStats,
      finalStats: result.stats,
      stars: result.stars,
      milestoneLevels: milestonesApplied,
      level50BonusApplied: result.level50BonusApplied,
    });
  }

  return result;
}

module.exports = {
  MAX_LEVEL,
  STAR_STEP,
  MAX_STARS,
  DEFAULT_BASE_STAT,
  STAT_FIELDS,
  LEVEL_GROWTH_RATES,
  MILESTONE_GROWTH_RATES,
  LEVEL_FIFTY_FLAT_BONUS,
  toPositiveInteger,
  normalizeLevel,
  roundStat,
  getPokemonStars,
  formatPokemonStars,
  buildProgressionBreakdown,
  calculateProgressedStats,
};
