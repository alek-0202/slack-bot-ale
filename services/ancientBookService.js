const { getSupabaseClient } = require("../database/supabase");
const { createLogger } = require("../utils/logger");
const { getUserPokemonById } = require("./pokemonService");
const { getUserItemQuantity } = require("./inventoryService");
const { assertPokemonAvailableForAction } = require("./healingStationService");

const logger = createLogger("ancient-book-service");

const ANCIENT_BOOK_ITEM_KEY = "ancient_book";
const ANCIENT_BOOK_COST = 5;
const ANCIENT_BOOK_STAT_LIMIT = 30;

const BOOK_STAT_CONFIG = {
  attack: { key: "attack", label: "ATK", emoji: "⚔️", bonusField: "book_bonus_attack" },
  magic: { key: "magic", label: "MAG", emoji: "✨", bonusField: "book_bonus_magic" },
  defense: { key: "defense", label: "DEF", emoji: "🛡️", bonusField: "book_bonus_defense" },
  hp: { key: "hp", label: "HP", emoji: "❤️", bonusField: "book_bonus_hp" },
  speed: { key: "speed", label: "SPD", emoji: "💨", bonusField: "book_bonus_speed" },
};

function normalizeBookStatKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return BOOK_STAT_CONFIG[key] ? key : null;
}

function getPokemonBookBonuses(pokemon = {}) {
  return Object.fromEntries(
    Object.entries(BOOK_STAT_CONFIG).map(([key, config]) => [key, Number(pokemon?.[config.bonusField]) || 0]),
  );
}

async function buildApplyItemPreview({ slackUserId, pokemonId }) {
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);
  logger.info("Preview !applyitem solicitado", { slackUserId, pokemonId, found: Boolean(pokemon) });

  if (!pokemon) return { ok: false, reason: "pokemon_not_owned" };

  const availability = await assertPokemonAvailableForAction({
    slackUserId,
    pokemonId,
    action: "apply_ancient_book_preview",
  });
  if (!availability.ok) return { ok: false, reason: availability.reason, pokemon };

  const booksQty = await getUserItemQuantity(slackUserId, ANCIENT_BOOK_ITEM_KEY);

  logger.info("Preview !applyitem carregado", {
    slackUserId,
    pokemonId,
    booksQty,
    bonuses: getPokemonBookBonuses(pokemon),
  });

  return {
    ok: true,
    pokemon,
    booksQty,
    statLimit: ANCIENT_BOOK_STAT_LIMIT,
    itemCost: ANCIENT_BOOK_COST,
    itemKey: ANCIENT_BOOK_ITEM_KEY,
  };
}

async function applyAncientBookBonus({ slackUserId, pokemonId, statKey }) {
  const normalizedStatKey = normalizeBookStatKey(statKey);

  logger.info("Tentativa de aplicar Livro do Ancião", {
    slackUserId,
    pokemonId,
    statKey,
    normalizedStatKey,
  });

  if (!normalizedStatKey) {
    return { ok: false, reason: "invalid_stat" };
  }

  const pokemon = await getUserPokemonById(slackUserId, pokemonId);
  if (!pokemon) {
    logger.warn("Aplicação bloqueada: pokémon não pertence ao usuário", { slackUserId, pokemonId, statKey: normalizedStatKey });
    return { ok: false, reason: "pokemon_not_owned" };
  }

  const availability = await assertPokemonAvailableForAction({
    slackUserId,
    pokemonId,
    action: "apply_ancient_book_confirm",
  });
  if (!availability.ok) {
    logger.warn("Aplicação bloqueada por estado inválido", { slackUserId, pokemonId, statKey: normalizedStatKey, reason: availability.reason });
    return { ok: false, reason: availability.reason, pokemon };
  }

  const booksQty = await getUserItemQuantity(slackUserId, ANCIENT_BOOK_ITEM_KEY);
  logger.info("Quantidade de livros lida antes da aplicação", { slackUserId, pokemonId, booksQty });

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("apply_ancient_book_bonus", {
    p_slack_user_id: slackUserId,
    p_pokemon_id: pokemonId,
    p_stat_key: normalizedStatKey,
    p_item_key: ANCIENT_BOOK_ITEM_KEY,
    p_item_cost: ANCIENT_BOOK_COST,
  });

  if (error) {
    logger.error("Falha na RPC apply_ancient_book_bonus", {
      slackUserId,
      pokemonId,
      statKey: normalizedStatKey,
      error,
    });
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ok) {
    logger.warn("Aplicação de Livro recusada", {
      slackUserId,
      pokemonId,
      statKey: normalizedStatKey,
      reason: result?.reason || "unknown",
      statBonus: result?.stat_bonus ?? null,
    });

    return {
      ok: false,
      reason: result?.reason || "unknown",
      statKey: normalizedStatKey,
      statBonus: result?.stat_bonus ?? null,
      booksQty,
    };
  }

  const updatedPokemon = await getUserPokemonById(slackUserId, pokemonId);

  logger.info("Livro do Ancião aplicado com sucesso", {
    slackUserId,
    pokemonId,
    statKey: normalizedStatKey,
    consumedBooks: ANCIENT_BOOK_COST,
    remainingBooks: result.item_remaining,
    newStatBonus: result.stat_bonus,
  });

  return {
    ok: true,
    pokemon: updatedPokemon || pokemon,
    statKey: normalizedStatKey,
    statBonus: Number(result.stat_bonus) || 0,
    remainingBooks: Math.max(0, Number(result.item_remaining) || 0),
    consumedBooks: ANCIENT_BOOK_COST,
    statLimit: ANCIENT_BOOK_STAT_LIMIT,
  };
}

module.exports = {
  ANCIENT_BOOK_ITEM_KEY,
  ANCIENT_BOOK_COST,
  ANCIENT_BOOK_STAT_LIMIT,
  BOOK_STAT_CONFIG,
  normalizeBookStatKey,
  getPokemonBookBonuses,
  buildApplyItemPreview,
  applyAncientBookBonus,
};
