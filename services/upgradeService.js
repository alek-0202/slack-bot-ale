const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById } = require("./pokemonService");
const { createLogger } = require("../utils/logger");
const { formatGold, toGoldBigInt } = require("../utils/gold");

const logger = createLogger("upgrade-service");

const MAX_LEVEL = 50;
const BASE_UPGRADE_COST = 100n;
const UPGRADE_GROWTH_PERCENTAGE = 15n;
const UPGRADE_GROWTH_DIVISOR = 100n;

function getUpgradeBandFlatBonus(currentLevel) {
  if (currentLevel >= 20) return 300n;
  if (currentLevel >= 10) return 200n;
  return 0n;
}

function applyUpgradeGrowth(cost, currentLevel) {
  const normalizedCost = toGoldBigInt(cost, BASE_UPGRADE_COST);
  const percentageIncrease = (normalizedCost * UPGRADE_GROWTH_PERCENTAGE) / UPGRADE_GROWTH_DIVISOR;
  const guaranteedProgress = percentageIncrease > 0n ? percentageIncrease : 1n;
  return normalizedCost + getUpgradeBandFlatBonus(currentLevel) + guaranteedProgress;
}

function calculateUpgradeCost(currentLevel) {
  const safeLevel = Math.max(1, Number(currentLevel) || 1);
  let currentCost = BASE_UPGRADE_COST;

  for (let level = 1; level < safeLevel; level += 1) {
    currentCost = applyUpgradeGrowth(currentCost, level);
  }

  return currentCost;
}

function calculateTotalUpgradeCost(currentLevel, targetLevel) {
  const safeCurrentLevel = Math.max(1, Number(currentLevel) || 1);
  const safeTargetLevel = Math.max(safeCurrentLevel, Number(targetLevel) || safeCurrentLevel);
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
    return {
      ok: false,
      reason: result.reason,
      cost: formatGold(result.cost || 0),
      currentGold: formatGold(result.remaining_gold || 0),
    };
  }

  const upgradedPokemon = await getUserPokemonById(slackUserId, pokemonId);

  logger.info("Upgrade recalculado com base na espécie", {
    slackUserId,
    pokemonId,
    speciesId: upgradedPokemon?.species_id || pokemon?.species_id || null,
    previousLevel: result.previous_level,
    newLevel: result.new_level,
    cost: formatGold(result.cost),
    goldBefore: formatGold(toGoldBigInt(result.remaining_gold) + toGoldBigInt(result.cost)),
    goldAfter: formatGold(result.remaining_gold),
    stats: upgradedPokemon
      ? {
          attack: upgradedPokemon.attack,
          defense: upgradedPokemon.defense,
          hp: upgradedPokemon.hp,
          speed: upgradedPokemon.speed,
        }
      : null,
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

module.exports = {
  MAX_LEVEL,
  BASE_UPGRADE_COST,
  getUpgradeBandFlatBonus,
  applyUpgradeGrowth,
  calculateUpgradeCost,
  calculateTotalUpgradeCost,
  getUpgradeCost: calculateUpgradeCost,
  upgradePokemon,
};
