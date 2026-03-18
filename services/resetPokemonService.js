const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById } = require("./pokemonService");
const { createLogger } = require("../utils/logger");
const { formatGold, toGoldBigInt } = require("../utils/gold");

const logger = createLogger("reset-pokemon-service");

async function resetPokemonUpgrades({ slackUserId, pokemonId }) {
  const supabase = getSupabaseClient();
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);

  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_owned" };
  }

  if ((Number(pokemon.level) || 1) <= 1) {
    return { ok: false, reason: "already_level_one", pokemon };
  }

  const { data, error } = await supabase.rpc("reset_user_pokemon_upgrades", {
    p_slack_user_id: slackUserId,
    p_pokemon_id: pokemonId,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) {
    return { ok: false, reason: "unknown" };
  }

  if (!result.ok) {
    logger.warn("Reset de Pokémon recusado", {
      slackUserId,
      pokemonId,
      currentLevel: pokemon.level,
      reason: result.reason,
    });
    return { ok: false, reason: result.reason, pokemon };
  }

  const goldAfter = toGoldBigInt(result.remaining_gold);
  const refundedGold = toGoldBigInt(result.refunded_gold);
  const goldBefore = goldAfter - refundedGold;
  const updatedPokemon = await getUserPokemonById(slackUserId, pokemonId);

  logger.info("Reset de Pokémon concluído", {
    slackUserId,
    pokemonId,
    currentLevel: result.previous_level,
    targetLevel: result.new_level,
    totalCost: refundedGold,
    goldBefore,
    goldAfter,
  });

  return {
    ok: true,
    pokemon: updatedPokemon || pokemon,
    previousLevel: result.previous_level,
    newLevel: result.new_level,
    refundedGold: formatGold(refundedGold),
    remainingGold: formatGold(goldAfter),
  };
}

module.exports = {
  resetPokemonUpgrades,
};
