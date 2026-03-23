const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById, getUserPokemonsByIds } = require("./pokemonService");
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

function sumGold(values) {
  return formatGold((values || []).reduce((total, value) => total + toGoldBigInt(value), 0n));
}

async function buildSellPreviewBatch({ slackUserId, pokemonIds }) {
  const requestedIds = [...new Set((pokemonIds || []).map((id) => Number.parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!requestedIds.length) {
    return { ok: false, reason: "invalid_pokemon_ids" };
  }

  const pokemons = requestedIds.length === 1
    ? [await getUserPokemonById(slackUserId, requestedIds[0])].filter(Boolean)
    : await getUserPokemonsByIds(slackUserId, requestedIds);

  const pokemonById = new Map((pokemons || []).map((pokemon) => [Number(pokemon.id), pokemon]));
  const missingIds = requestedIds.filter((id) => !pokemonById.has(id));

  if (missingIds.length) {
    return { ok: false, reason: "pokemon_not_owned", missingIds };
  }

  const items = requestedIds.map((pokemonId) => {
    const pokemon = pokemonById.get(pokemonId);
    const priceBreakdown = calculatePokemonSellPrice({
      rarity: pokemon.pokemon_species?.rarity,
      level: pokemon.level,
      upgradeSpentGold: pokemon.upgrade_spent_gold,
    });

    return {
      pokemon,
      priceBreakdown,
    };
  });

  const totalSellPrice = sumGold(items.map((item) => item.priceBreakdown.finalPrice));
  const totalUpgradeReturn = sumGold(items.map((item) => item.priceBreakdown.upgradeReturn));

  logger.info("Preview de venda em lote gerado", {
    slackUserId,
    pokemonIds: requestedIds,
    totalSellPrice,
    totalUpgradeReturn,
  });

  return {
    ok: true,
    pokemon: items[0]?.pokemon,
    pokemons: items.map((item) => item.pokemon),
    items,
    pokemonIds: requestedIds,
    totalCount: items.length,
    totalSellPrice,
    totalUpgradeReturn,
    priceBreakdown: items[0]?.priceBreakdown || null,
  };
}

async function buildSellPreview({ slackUserId, pokemonId }) {
  const result = await buildSellPreviewBatch({ slackUserId, pokemonIds: [pokemonId] });
  if (!result.ok) return result;

  return {
    ok: true,
    pokemon: result.pokemon,
    priceBreakdown: result.priceBreakdown,
  };
}

async function sellPokemonBatch({ slackUserId, pokemonIds }) {
  const supabase = getSupabaseClient();
  const preview = await buildSellPreviewBatch({ slackUserId, pokemonIds });

  if (!preview.ok) {
    return preview;
  }

  const { data, error } = await supabase.rpc("sell_user_pokemons_batch", {
    p_slack_user_id: slackUserId,
    p_pokemon_ids: preview.pokemonIds,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) {
    return { ok: false, reason: "unknown" };
  }

  if (!result.ok) {
    logger.warn("Venda em lote recusada", {
      slackUserId,
      pokemonIds: preview.pokemonIds,
      sellValue: preview.totalSellPrice,
      reason: result.reason,
    });
    return { ok: false, reason: result.reason, pokemons: preview.pokemons, pokemonIds: preview.pokemonIds };
  }

  const goldAfter = toGoldBigInt(result.remaining_gold);
  const goldReceived = toGoldBigInt(result.sale_price);
  const goldBefore = goldAfter - goldReceived;

  logger.info("Venda em lote concluída", {
    slackUserId,
    pokemonIds: preview.pokemonIds,
    sellValue: goldReceived,
    goldBefore,
    goldAfter,
    cleanupTradeItems: result.deleted_trade_items,
    cleanupMarketPurchases: result.deleted_market_purchases,
  });

  return {
    ok: true,
    pokemon: preview.pokemon,
    pokemons: preview.pokemons,
    items: preview.items,
    pokemonIds: preview.pokemonIds,
    goldReceived: formatGold(goldReceived),
    currentGold: formatGold(goldAfter),
    totalSellPrice: preview.totalSellPrice,
    totalUpgradeReturn: preview.totalUpgradeReturn,
    priceBreakdown: preview.priceBreakdown,
  };
}

async function sellPokemon({ slackUserId, pokemonId }) {
  const result = await sellPokemonBatch({ slackUserId, pokemonIds: [pokemonId] });
  if (!result.ok) return result;

  return {
    ok: true,
    pokemon: result.pokemon,
    goldReceived: result.goldReceived,
    currentGold: result.currentGold,
    priceBreakdown: result.priceBreakdown,
  };
}

module.exports = {
  getBaseSellPriceByRarity,
  calculatePokemonSellPrice,
  buildSellPreview,
  buildSellPreviewBatch,
  sellPokemon,
  sellPokemonBatch,
};
