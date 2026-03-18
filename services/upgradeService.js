const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById } = require("./pokemonService");
const { createLogger } = require("../utils/logger");
const { formatGold, toGoldBigInt } = require("../utils/gold");

const logger = createLogger("upgrade-service");

const MAX_LEVEL = 50;
const UPGRADE_COST_BANDS = [
  { minLevel: 1, maxLevel: 4, baseCost: 200n, stepCost: 150n },
  { minLevel: 5, maxLevel: 9, baseCost: 800n, stepCost: 200n },
  { minLevel: 10, maxLevel: 14, baseCost: 1850n, stepCost: 250n },
  { minLevel: 15, maxLevel: 19, baseCost: 3100n, stepCost: 250n },
  { minLevel: 20, maxLevel: 24, baseCost: 4300n, stepCost: 100n },
  { minLevel: 25, maxLevel: 34, baseCost: 4800n, stepCost: 20n },
  { minLevel: 35, maxLevel: MAX_LEVEL - 1, baseCost: 5000n, stepCost: 0n },
];

function normalizeUpgradeLevel(level) {
  return Math.max(1, Math.min(MAX_LEVEL - 1, Number(level) || 1));
}

function getUpgradeCostBand(currentLevel) {
  const safeLevel = normalizeUpgradeLevel(currentLevel);
  return (
    UPGRADE_COST_BANDS.find((band) => safeLevel >= band.minLevel && safeLevel <= band.maxLevel) ||
    UPGRADE_COST_BANDS[UPGRADE_COST_BANDS.length - 1]
  );
}

function calculateUpgradeCost(currentLevel) {
  const safeLevel = normalizeUpgradeLevel(currentLevel);
  const band = getUpgradeCostBand(safeLevel);
  const offset = BigInt(safeLevel - band.minLevel);
  return band.baseCost + band.stepCost * offset;
}

function calculateTotalUpgradeCost(currentLevel, targetLevel) {
  const safeCurrentLevel = Math.min(MAX_LEVEL, Math.max(1, Number(currentLevel) || 1));
  const normalizedTargetLevel = Math.max(safeCurrentLevel, Number(targetLevel) || safeCurrentLevel);
  const safeTargetLevel = Math.min(MAX_LEVEL, normalizedTargetLevel);
  let totalCost = 0n;

  for (let level = safeCurrentLevel; level < safeTargetLevel; level += 1) {
    totalCost += calculateUpgradeCost(level);
  }

  return totalCost;
}

async function upgradePokemon({ slackUserId, pokemonId }) {
  const supabase = getSupabaseClient();
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);

  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_owned" };
  }

  const { data, error } = await supabase.rpc("upgrade_user_pokemon", {
    p_slack_user_id: slackUserId,
    p_pokemon_id: pokemonId,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) {
    return { ok: false, reason: "unknown" };
  }

  if (!result.ok) {
    logger.warn("Upgrade recusado", {
      slackUserId,
      pokemonId,
      currentLevel: result.previous_level ?? pokemon.level,
      targetLevel: result.new_level ?? pokemon.level,
      unitCost: formatGold(result.cost || 0),
      totalCost: formatGold(result.cost || 0),
      goldBefore: formatGold(result.remaining_gold || 0),
      goldAfter: formatGold(result.remaining_gold || 0),
      reason: result.reason,
    });

    return {
      ok: false,
      reason: result.reason,
      cost: formatGold(result.cost || 0),
      currentGold: formatGold(result.remaining_gold || 0),
    };
  }

  const upgradedPokemon = await getUserPokemonById(slackUserId, pokemonId);
  const unitCost = toGoldBigInt(result.cost);
  const goldAfter = toGoldBigInt(result.remaining_gold);
  const goldBefore = goldAfter + unitCost;

  logger.info("Upgrade aplicado com sucesso", {
    slackUserId,
    pokemonId,
    speciesId: upgradedPokemon?.species_id || pokemon?.species_id || null,
    currentLevel: result.previous_level,
    targetLevel: result.new_level,
    unitCost,
    totalCost: unitCost,
    goldBefore,
    goldAfter,
    upgradeSpentGold: upgradedPokemon?.upgrade_spent_gold || null,
  });

  return {
    ok: true,
    pokemon: upgradedPokemon || pokemon,
    previousLevel: result.previous_level,
    newLevel: result.new_level,
    cost: formatGold(result.cost),
    remainingGold: formatGold(result.remaining_gold),
  };
}

async function upgradePokemonBatch({ slackUserId, pokemonId, targetLevel }) {
  const supabase = getSupabaseClient();
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);

  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_owned" };
  }

  const { data, error } = await supabase.rpc("upgrade_user_pokemon_batch", {
    p_slack_user_id: slackUserId,
    p_pokemon_id: pokemonId,
    p_target_level: targetLevel,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) {
    return { ok: false, reason: "unknown" };
  }

  if (!result.ok) {
    logger.warn("Upgrade em lote recusado", {
      slackUserId,
      pokemonId,
      currentLevel: result.previous_level ?? pokemon.level,
      targetLevel: result.new_level ?? targetLevel,
      totalCost: formatGold(result.cost || 0),
      goldBefore: formatGold(result.remaining_gold || 0),
      goldAfter: formatGold(result.remaining_gold || 0),
      reason: result.reason,
    });

    return {
      ok: false,
      reason: result.reason,
      cost: formatGold(result.cost || 0),
      currentGold: formatGold(result.remaining_gold || 0),
      previousLevel: result.previous_level ?? (Number(pokemon.level) || 1),
      targetLevel: result.new_level ?? Number(targetLevel),
      pokemon,
    };
  }

  const upgradedPokemon = await getUserPokemonById(slackUserId, pokemonId);
  const totalCost = toGoldBigInt(result.cost);
  const goldAfter = toGoldBigInt(result.remaining_gold);
  const goldBefore = goldAfter + totalCost;

  logger.info("Upgrade em lote aplicado com sucesso", {
    slackUserId,
    pokemonId,
    speciesId: upgradedPokemon?.species_id || pokemon?.species_id || null,
    currentLevel: result.previous_level,
    targetLevel: result.new_level,
    totalCost,
    goldBefore,
    goldAfter,
    upgradeSpentGold: upgradedPokemon?.upgrade_spent_gold || null,
  });

  return {
    ok: true,
    pokemon: upgradedPokemon || pokemon,
    previousLevel: result.previous_level,
    newLevel: result.new_level,
    totalCost: formatGold(result.cost),
    remainingGold: formatGold(result.remaining_gold),
  };
}

module.exports = {
  MAX_LEVEL,
  UPGRADE_COST_BANDS,
  getUpgradeCostBand,
  calculateUpgradeCost,
  calculateTotalUpgradeCost,
  getUpgradeCost: calculateUpgradeCost,
  upgradePokemon,
  upgradePokemonBatch,
};
