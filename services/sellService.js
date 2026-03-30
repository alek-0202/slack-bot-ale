const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById, getUserPokemonsByIds, getUserPokemons } = require("./pokemonService");
const { getBaseGoldByRarity } = require("./economyService");
const { createLogger } = require("../utils/logger");
const { formatGold, toGoldBigInt } = require("../utils/gold");

const logger = createLogger("sell-service");
const PREVIEW_FETCH_CHUNK_SIZE = 300;
const TRADE_LOCK_QUERY_CHUNK_SIZE = 400;
const SELL_RPC_CHUNK_SIZE = 120;
const ESSENCE_BY_RARITY = {
  common: 100,
  uncommon: 300,
  rare: 700,
  epic: 4000,
  legendary: 50000,
  mythical: 100000,
};

function getBaseSellPriceByRarity(rarity) {
  return BigInt(getBaseGoldByRarity(rarity));
}

function resolveBaseSellPrice({ baseValue, rarity }) {
  const explicitBaseValue = Number(baseValue);
  if (Number.isFinite(explicitBaseValue) && explicitBaseValue >= 0) {
    return BigInt(Math.trunc(explicitBaseValue));
  }

  return getBaseSellPriceByRarity(rarity);
}

function calculatePokemonSellPrice({ baseValue, rarity, upgradeSpentGold = 0 }) {
  const basePrice = resolveBaseSellPrice({ baseValue, rarity });
  const investedGold = toGoldBigInt(upgradeSpentGold);
  const finalPrice = basePrice + investedGold;

  return {
    basePrice: formatGold(basePrice),
    totalUpgradeCost: formatGold(investedGold),
    upgradeReturn: formatGold(investedGold),
    finalPrice: formatGold(finalPrice >= 0n ? finalPrice : 0n),
  };
}

function sumGold(values) {
  return formatGold((values || []).reduce((total, value) => total + toGoldBigInt(value), 0n));
}

function calculatePokemonSellEssence({ rarity }) {
  return String(ESSENCE_BY_RARITY[String(rarity || "").toLowerCase()] || 0);
}

function sumEssence(values) {
  return String((values || []).reduce((total, value) => total + Number.parseInt(value || 0, 10), 0));
}

function chunkArray(values, chunkSize) {
  const safeSize = Math.max(1, Number(chunkSize) || 1);
  const chunks = [];
  for (let index = 0; index < (values || []).length; index += safeSize) {
    chunks.push(values.slice(index, index + safeSize));
  }
  return chunks;
}

function normalizePokemonIds(pokemonIds) {
  return [...new Set((pokemonIds || []).map((id) => Number.parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))];
}

async function getOwnedPokemonsByIdsInChunks({ slackUserId, pokemonIds }) {
  if (pokemonIds.length === 1) {
    return [await getUserPokemonById(slackUserId, pokemonIds[0])].filter(Boolean);
  }

  const pokemonChunks = await Promise.all(
    chunkArray(pokemonIds, PREVIEW_FETCH_CHUNK_SIZE).map((chunkIds) => getUserPokemonsByIds(slackUserId, chunkIds)),
  );
  return pokemonChunks.flat();
}

async function buildSellPreviewBatch({ slackUserId, pokemonIds }) {
  const requestedIds = normalizePokemonIds(pokemonIds);
  if (!requestedIds.length) {
    return { ok: false, reason: "invalid_pokemon_ids" };
  }

  const pokemons = await getOwnedPokemonsByIdsInChunks({ slackUserId, pokemonIds: requestedIds });

  const pokemonById = new Map((pokemons || []).map((pokemon) => [Number(pokemon.id), pokemon]));
  const missingIds = requestedIds.filter((id) => !pokemonById.has(id));

  if (missingIds.length) {
    return { ok: false, reason: "pokemon_not_owned", missingIds };
  }
  const favoriteIds = requestedIds.filter((id) => Boolean(pokemonById.get(id)?.is_favorite));
  if (favoriteIds.length) {
    return { ok: false, reason: "favorite_pokemon_blocked", favoriteIds };
  }

  const items = requestedIds.map((pokemonId) => {
    const pokemon = pokemonById.get(pokemonId);
    const priceBreakdown = calculatePokemonSellPrice({
      baseValue: pokemon.pokemon_species?.base_value,
      rarity: pokemon.pokemon_species?.rarity,
      upgradeSpentGold: pokemon.upgrade_spent_gold,
    });
    const essenceBreakdown = calculatePokemonSellEssence({
      rarity: pokemon.pokemon_species?.rarity,
    });

    return {
      pokemon,
      priceBreakdown,
      essenceBreakdown,
    };
  });

  const totalSellPrice = sumGold(items.map((item) => item.priceBreakdown.finalPrice));
  const totalUpgradeReturn = sumGold(items.map((item) => item.priceBreakdown.upgradeReturn));
  const totalEssenceReceived = sumEssence(items.map((item) => item.essenceBreakdown));

  logger.info("Preview de venda em lote gerado", {
    slackUserId,
    pokemonIds: requestedIds,
    totalSellPrice,
    totalUpgradeReturn,
    totalEssenceReceived,
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
    totalEssenceReceived,
    priceBreakdown: items[0]?.priceBreakdown || null,
  };
}

async function getTradeLockedPokemonIds({ supabase, pokemonIds }) {
  const safeIds = normalizePokemonIds(pokemonIds);
  if (!safeIds.length) return [];

  const lockedIdSet = new Set();
  for (const idChunk of chunkArray(safeIds, TRADE_LOCK_QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("trade_items")
      .select("user_pokemon_id, trades!inner(status)")
      .in("user_pokemon_id", idChunk)
      .eq("trades.status", "pending");

    if (error) throw error;
    for (const row of data || []) {
      const id = Number(row.user_pokemon_id);
      if (Number.isInteger(id) && id > 0) lockedIdSet.add(id);
    }
  }

  return [...lockedIdSet];
}

async function buildSellAllPreview({ slackUserId }) {
  const supabase = getSupabaseClient();
  const allPokemons = await getUserPokemons(slackUserId);
  const allIds = allPokemons.map((pokemon) => Number(pokemon.id)).filter((id) => Number.isInteger(id) && id > 0);
  const favoriteIds = allPokemons
    .filter((pokemon) => Boolean(pokemon.is_favorite))
    .map((pokemon) => Number(pokemon.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const favoriteIdSet = new Set(favoriteIds);
  const nonFavoriteIds = allIds.filter((id) => !favoriteIdSet.has(id));
  const lockedIds = await getTradeLockedPokemonIds({ supabase, pokemonIds: nonFavoriteIds });
  const lockedIdSet = new Set(lockedIds);
  const eligibleIds = nonFavoriteIds.filter((id) => !lockedIdSet.has(id));

  if (!eligibleIds.length) {
    return {
      ok: false,
      reason: "no_sellable_pokemon",
      totalOwnedCount: allIds.length,
      favoriteIgnoredCount: favoriteIds.length,
      blockedCount: lockedIds.length,
      ignoredCount: favoriteIds.length + lockedIds.length,
      favoriteIds,
      blockedIds: lockedIds,
    };
  }

  const preview = await buildSellPreviewBatch({ slackUserId, pokemonIds: eligibleIds });
  if (!preview.ok) return preview;

  return {
    ...preview,
    sellAll: true,
    totalOwnedCount: allIds.length,
    favoriteIgnoredCount: favoriteIds.length,
    blockedCount: lockedIds.length,
    ignoredCount: favoriteIds.length + lockedIds.length,
    favoriteIds,
    blockedIds: lockedIds,
  };
}

async function buildSellPreview({ slackUserId, pokemonId }) {
  const result = await buildSellPreviewBatch({ slackUserId, pokemonIds: [pokemonId] });
  if (!result.ok) return result;

  return {
    ok: true,
    pokemon: result.pokemon,
    priceBreakdown: result.priceBreakdown,
    essenceReceived: result.essenceReceived,
    currentEssence: result.currentEssence,
  };
}

function isMissingBatchSellRpcError(error) {
  const message = error?.message || "";
  return message.includes("sell_user_pokemons_batch") && message.includes("schema cache");
}

async function sellPokemonBatchLegacy({ supabase, slackUserId, preview }) {
  let currentGold = null;
  let goldReceived = 0n;

  for (const pokemonId of preview.pokemonIds) {
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
      logger.warn("Venda em lote via fallback recusada", {
        slackUserId,
        pokemonId,
        reason: result.reason,
      });
      return { ok: false, reason: result.reason, pokemons: preview.pokemons, pokemonIds: preview.pokemonIds };
    }

    currentGold = result.remaining_gold;
    goldReceived += toGoldBigInt(result.sale_price);
  }

  logger.warn("Venda em lote concluída via fallback legado", {
    slackUserId,
    pokemonIds: preview.pokemonIds,
    goldReceived,
  });

  return {
    ok: true,
    pokemon: preview.pokemon,
    pokemons: preview.pokemons,
    items: preview.items,
    pokemonIds: preview.pokemonIds,
    goldReceived: formatGold(goldReceived),
    currentGold: formatGold(currentGold ?? 0),
    totalSellPrice: preview.totalSellPrice,
    totalUpgradeReturn: preview.totalUpgradeReturn,
    totalEssenceReceived: preview.totalEssenceReceived,
    priceBreakdown: preview.priceBreakdown,
    usedLegacyFallback: true,
    essenceReceived: "0",
    currentEssence: "0",
  };
}

async function runSellBatchRpc({ supabase, slackUserId, preview }) {
  const { data, error } = await supabase.rpc("sell_user_pokemons_batch", {
    p_slack_user_id: slackUserId,
    p_pokemon_ids: preview.pokemonIds,
    p_expected_sale_price: Number.parseInt(preview.totalSellPrice, 10),
  });

  if (error) {
    if (preview.pokemonIds.length > 1 && isMissingBatchSellRpcError(error)) {
      logger.warn("RPC de venda em lote indisponível; usando fallback legado", {
        slackUserId,
        pokemonIds: preview.pokemonIds,
        error,
      });
      return sellPokemonBatchLegacy({ supabase, slackUserId, preview });
    }
    throw error;
  }

  const result = data?.[0];
  if (!result) {
    return { ok: false, reason: "unknown" };
  }

  if (!result.ok) {
    logger.warn("Venda em lote recusada", {
      slackUserId,
      pokemonIds: preview.pokemonIds,
      sellValue: preview.totalSellPrice,
      actualSellValue: result.sale_price ?? null,
      reason: result.reason,
    });
    return { ok: false, reason: result.reason, pokemons: preview.pokemons, pokemonIds: preview.pokemonIds };
  }

  const goldAfter = toGoldBigInt(result.remaining_gold);
  const goldReceived = toGoldBigInt(result.sale_price);
  const essenceReceived = BigInt(result.essence_gained || 0);
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
    totalEssenceReceived: preview.totalEssenceReceived,
    priceBreakdown: preview.priceBreakdown,
    essenceReceived: formatGold(essenceReceived),
    currentEssence: String(Math.max(0, Number(result.remaining_essence || 0))),
  };
}

async function sellPokemonBatch({ slackUserId, pokemonIds }) {
  const supabase = getSupabaseClient();
  const preview = await buildSellPreviewBatch({ slackUserId, pokemonIds });

  if (!preview.ok) {
    return preview;
  }

  if (preview.pokemons?.some((pokemon) => Boolean(pokemon?.is_favorite))) {
    return {
      ok: false,
      reason: "favorite_pokemon_blocked",
      favoriteIds: preview.pokemons.filter((pokemon) => pokemon?.is_favorite).map((pokemon) => pokemon.id),
      pokemons: preview.pokemons,
      pokemonIds: preview.pokemonIds,
    };
  }
  return runSellBatchRpc({ supabase, slackUserId, preview });
}

async function sellAllPokemonBatch({ slackUserId }) {
  const preview = await buildSellAllPreview({ slackUserId });
  if (!preview.ok) return preview;

  const pokemonIdChunks = chunkArray(preview.pokemonIds || [], SELL_RPC_CHUNK_SIZE);
  const soldPokemonIds = [];
  let totalGoldReceived = 0n;
  let totalEssenceReceived = 0n;
  let currentGold = null;
  let currentEssence = null;

  for (const chunkIds of pokemonIdChunks) {
    const chunkResult = await sellPokemonBatch({ slackUserId, pokemonIds: chunkIds });
    if (!chunkResult.ok) {
      return {
        ok: false,
        reason: chunkResult.reason,
        soldCount: soldPokemonIds.length,
        attemptedCount: preview.pokemonIds.length,
      };
    }

    soldPokemonIds.push(...chunkResult.pokemonIds);
    totalGoldReceived += toGoldBigInt(chunkResult.goldReceived);
    totalEssenceReceived += toGoldBigInt(chunkResult.essenceReceived || 0);
    currentGold = chunkResult.currentGold;
    currentEssence = chunkResult.currentEssence;
  }

  return {
    ok: true,
    sellAll: true,
    soldCount: soldPokemonIds.length,
    totalCount: soldPokemonIds.length,
    ignoredCount: preview.ignoredCount || 0,
    favoriteIgnoredCount: preview.favoriteIgnoredCount || 0,
    blockedCount: preview.blockedCount || 0,
    goldReceived: formatGold(totalGoldReceived),
    essenceReceived: formatGold(totalEssenceReceived),
    currentGold: currentGold || "0",
    currentEssence: currentEssence || "0",
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
    essenceReceived: result.essenceReceived,
    currentEssence: result.currentEssence,
  };
}

module.exports = {
  getBaseSellPriceByRarity,
  calculatePokemonSellPrice,
  buildSellPreview,
  buildSellPreviewBatch,
  buildSellAllPreview,
  sellPokemon,
  sellPokemonBatch,
  sellAllPokemonBatch,
};
