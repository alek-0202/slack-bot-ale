const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById } = require("./pokemonService");

const MAX_LEVEL = 50;
const BASE_UPGRADE_COST = 100;

function getUpgradeMultiplier(currentLevel) {
  if (currentLevel < 1) return 1.05;
  if (currentLevel >= 10) return 1.5;
  return 1 + Math.min(currentLevel * 0.05, 0.5);
}

function getUpgradeCost(currentLevel) {
  const multiplier = getUpgradeMultiplier(currentLevel);
  return Math.ceil(BASE_UPGRADE_COST * Math.pow(multiplier, Math.max(currentLevel - 1, 0)));
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
      cost: result.cost || 0,
      currentGold: result.remaining_gold || 0,
    };
  }

  return {
    ok: true,
    pokemon,
    previousLevel: result.previous_level,
    newLevel: result.new_level,
    cost: result.cost,
    remainingGold: result.remaining_gold,
  };
}

module.exports = {
  MAX_LEVEL,
  BASE_UPGRADE_COST,
  getUpgradeMultiplier,
  getUpgradeCost,
  upgradePokemon,
};
