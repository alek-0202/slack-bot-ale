const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById } = require("./pokemonService");
const { getBaseGoldByRarity, getLevelBonus } = require("./economyService");
const { createLogger } = require("../utils/logger");
const { formatGold, toGoldBigInt } = require("../utils/gold");

const logger = createLogger("sell-service");

function getBaseSellPriceByRarity(rarity) {
  return BigInt(getBaseGoldByRarity(rarity));
}

function calculatePokemonSellPrice({ rarity, level, upgradeSpentGold = 0 }) {
  const safeLevel = Math.max(1, Number(level) || 1);
  const basePrice = getBaseSellPriceByRarity(rarity);
  const levelBonus = BigInt(getLevelBonus(safeLevel));
  const investedGold = toGoldBigInt(upgradeSpentGold);
  const upgradeReturn = investedGold / 5n;
  const finalPrice = basePrice + levelBonus + upgradeReturn;

  return {
    basePrice: formatGold(basePrice),
    levelBonus: formatGold(levelBonus),
    totalUpgradeCost: formatGold(investedGold),
    upgradeReturn: formatGold(upgradeReturn),
    finalPrice: formatGold(finalPrice >= 0n ? finalPrice : 0n),
  };
}

async function buildSellPreview({ slackUserId, pokemonId }) {
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);

  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_owned" };
  }

  const priceBreakdown = calculatePokemonSellPrice({
    rarity: pokemon.pokemon_species?.rarity,
    level: pokemon.level,
    upgradeSpentGold: pokemon.upgrade_spent_gold,
  });

  logger.info("Preview de venda gerado", {
    slackUserId,
    pokemonId,
    currentLevel: pokemon.level,
    sellValue: priceBreakdown.finalPrice,
    upgradeSpentGold: formatGold(pokemon.upgrade_spent_gold || 0),
  });

  return {
    ok: true,
    pokemon,
    priceBreakdown,
  };
}

async function sellPokemon({ slackUserId, pokemonId }) {
  const supabase = getSupabaseClient();
  const preview = await buildSellPreview({ slackUserId, pokemonId });

  if (!preview.ok) {
    return preview;
  }

  const { data, error } = await supabase.rpc("sell_user_pokemon", {
    p_slack_user_id: slackUserId,
    p_pokemon_id: pokemonId,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) {
    return { ok: false, reason: "unknown" };
  }

  if (!result.ok) {
    logger.warn("Venda recusada", {
      slackUserId,
      pokemonId,
      currentLevel: preview.pokemon.level,
      sellValue: preview.priceBreakdown.finalPrice,
      reason: result.reason,
    });
    return { ok: false, reason: result.reason, pokemon: preview.pokemon };
  }

  const goldAfter = toGoldBigInt(result.remaining_gold);
  const goldReceived = toGoldBigInt(result.sale_price);
  const goldBefore = goldAfter - goldReceived;

  logger.info("Venda concluída", {
    slackUserId,
    pokemonId,
    currentLevel: preview.pokemon.level,
    sellValue: goldReceived,
    goldBefore,
    goldAfter,
    cleanupTradeItems: result.deleted_trade_items,
    cleanupMarketPurchases: result.deleted_market_purchases,
  });

  return {
    ok: true,
    pokemon: preview.pokemon,
    goldReceived: formatGold(goldReceived),
    currentGold: formatGold(goldAfter),
    priceBreakdown: preview.priceBreakdown,
  };
}

module.exports = {
  getBaseSellPriceByRarity,
  calculatePokemonSellPrice,
  buildSellPreview,
  sellPokemon,
};
