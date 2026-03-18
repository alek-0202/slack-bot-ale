const { getSupabaseClient } = require("../database/supabase");
const { getRarityTier } = require("./economyService");
const { createLogger } = require("../utils/logger");
const { formatGold } = require("../utils/gold");

const logger = createLogger("evolution-service");

const EVOLUTION_BASE_COST = 4000n;
const EVOLUTION_RARITY_STEP_COST = 1000n;

function getBaseEvolutionCostByRarity(rarity) {
  return EVOLUTION_BASE_COST + BigInt(getRarityTier(rarity)) * EVOLUTION_RARITY_STEP_COST;
}

function getEvolutionCost({ rarity, evolutionStage }) {
  const stage = Math.max(1, Number(evolutionStage) || 1);
  const base = getBaseEvolutionCostByRarity(rarity);
  return base * 2n ** BigInt(Math.max(stage - 1, 0));
}

async function evolvePokemon({ slackUserId, pokemonId }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("evolve_user_pokemon", {
    p_slack_user_id: slackUserId,
    p_pokemon_id: pokemonId,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) return { ok: false, reason: "unknown" };

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      cost: formatGold(result.cost || 0),
      currentGold: formatGold(result.remaining_gold || 0),
    };
  }

  logger.info("Evolução recalculada com base na espécie", {
    actorUserId: slackUserId,
    pokemonId,
    currentSpeciesId: result.previous_species_id,
    nextSpeciesId: result.new_species_id,
    currentSpeciesName: result.previous_species_name,
    nextSpeciesName: result.new_species_name,
    cost: formatGold(result.cost),
    goldAfter: formatGold(result.remaining_gold),
  });

  return {
    ok: true,
    pokemonId,
    previousSpeciesName: result.previous_species_name,
    newSpeciesName: result.new_species_name,
    previousSpeciesId: result.previous_species_id,
    newSpeciesId: result.new_species_id,
    cost: formatGold(result.cost),
    remainingGold: formatGold(result.remaining_gold),
  };
}

module.exports = {
  EVOLUTION_BASE_COST,
  EVOLUTION_RARITY_STEP_COST,
  getBaseEvolutionCostByRarity,
  getEvolutionCost,
  evolvePokemon,
};
