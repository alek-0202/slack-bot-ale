const { createLogger } = require("../utils/logger");
const { getUserPokemonById } = require("./pokemonService");
const { getUser } = require("./userService");
const { getSpeciesById } = require("./pokemonLookupService");
const { getEvolutionCost, evolvePokemon } = require("./evolutionService");
const { MAX_LEVEL, calculateTotalUpgradeCost, upgradePokemonBatch } = require("./upgradeService");
const { buildSellPreview, buildSellPreviewBatch, sellPokemon, sellPokemonBatch } = require("./sellService");
const { formatGold, isGoldGte } = require("../utils/gold");
const { getPokemonProgressionSnapshot } = require("./pokemonStatsService");
const { assertPokemonAvailableForAction } = require("./healingStationService");
const {
  ANCIENT_BOOK_COST,
  ANCIENT_BOOK_STAT_LIMIT,
  BOOK_STAT_CONFIG,
  getPokemonBookBonuses,
  applyAncientBookBonus,
} = require("./ancientBookService");

const logger = createLogger("slack-pokemon-actions");

const EVOLVE_CONFIRM_ACTION_ID = "pokemon_evolve_confirm";
const EVOLVE_CANCEL_ACTION_ID = "pokemon_evolve_cancel";
const UP_CONFIRM_ACTION_ID = "pokemon_up_confirm";
const UP_CANCEL_ACTION_ID = "pokemon_up_cancel";
const SELL_CONFIRM_ACTION_ID = "pokemon_sell_confirm";
const SELL_CANCEL_ACTION_ID = "pokemon_sell_cancel";
const APPLY_ITEM_ACTION_ID = "pokemon_applyitem_confirm";
function buildApplyItemActionId(statKey) {
  return `${APPLY_ITEM_ACTION_ID}_${statKey}`;
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function buildActionValue(payload) {
  return JSON.stringify(payload);
}

function parsePokemonActionValue(value) {
  return safeJsonParse(value);
}

function buildAccessoryImage(species) {
  if (!species?.sprite_url) return undefined;
  return {
    type: "image",
    image_url: species.sprite_url,
    alt_text: species.name || "Pokémon",
  };
}

async function buildEvolvePreview({ slackUserId, pokemonId }) {
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);

  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_owned" };
  }
  const availability = await assertPokemonAvailableForAction({ slackUserId, pokemonId, action: "evolve_preview" });
  if (!availability.ok) return { ok: false, reason: availability.reason };

  const nextSpeciesId = pokemon.pokemon_species?.evolves_to;
  if (!nextSpeciesId) {
    return {
      ok: false,
      reason: "no_evolution_available",
      pokemon,
    };
  }

  const currentSpecies = pokemon.pokemon_species || {};
  const user = await getUser(slackUserId);
  if (!user) {
    return { ok: false, reason: "user_not_started" };
  }

  const evolutionSpecies = await getSpeciesById(nextSpeciesId);

  if (!evolutionSpecies?.id || !evolutionSpecies?.name || !currentSpecies?.rarity) {
    return {
      ok: false,
      reason: "species_stats_missing",
      pokemon,
    };
  }

  const cost = getEvolutionCost({
    rarity: currentSpecies.rarity,
    evolutionStage: currentSpecies.evolution_stage,
  });
  const currentProgression = getPokemonProgressionSnapshot({ species: currentSpecies, level: pokemon.level });
  const evolvedProgression = getPokemonProgressionSnapshot({
    species: evolutionSpecies,
    level: pokemon.level,
    log: true,
    context: { flow: "evolve_preview", pokemonId, slackUserId, previousSpeciesId: currentSpecies.id },
  });

  logger.info("Preview de evolução gerado", {
    slackUserId,
    pokemonId,
    currentSpeciesId: currentSpecies.id,
    nextSpeciesId: evolutionSpecies.id,
    cost: formatGold(cost),
  });

  return {
    ok: true,
    pokemon,
    currentSpecies,
    nextSpecies: evolutionSpecies,
    currentProgression,
    evolvedProgression,
    cost: formatGold(cost),
    currentGold: formatGold(user.gold),
    canAfford: isGoldGte(user.gold, cost),
  };
}

async function buildUpgradeBatchPreview({ slackUserId, pokemonId, targetLevel }) {
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);
  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_owned" };
  }
  const availability = await assertPokemonAvailableForAction({ slackUserId, pokemonId, action: "upgrade_preview" });
  if (!availability.ok) return { ok: false, reason: availability.reason };

  const user = await getUser(slackUserId);
  if (!user) {
    return { ok: false, reason: "user_not_started" };
  }

  const currentLevel = Number(pokemon.level) || 1;
  const desiredLevel = Number(targetLevel);

  if (!Number.isInteger(desiredLevel) || desiredLevel <= 0) {
    return { ok: false, reason: "invalid_target_level", pokemon, currentLevel };
  }

  if (desiredLevel > MAX_LEVEL) {
    return { ok: false, reason: "target_above_max_level", pokemon, currentLevel, maxLevel: MAX_LEVEL };
  }

  if (desiredLevel <= currentLevel) {
    return { ok: false, reason: "target_must_be_higher", pokemon, currentLevel };
  }

  const currentProgression = getPokemonProgressionSnapshot({ species: pokemon.pokemon_species || {}, level: currentLevel });
  const targetProgression = getPokemonProgressionSnapshot({
    species: pokemon.pokemon_species || {},
    level: desiredLevel,
    log: true,
    context: { flow: "upgrade_batch_preview", pokemonId, slackUserId, currentLevel, targetLevel: desiredLevel },
  });
  const totalCost = calculateTotalUpgradeCost(currentLevel, desiredLevel);
  logger.info("Preview de upgrade em lote gerado", {
    slackUserId,
    pokemonId,
    currentLevel,
    targetLevel: desiredLevel,
    totalCost: formatGold(totalCost),
    currentGold: formatGold(user.gold),
  });

  return {
    ok: true,
    pokemon,
    currentLevel,
    targetLevel: desiredLevel,
    levelsToGain: desiredLevel - currentLevel,
    currentProgression,
    targetProgression,
    totalCost: formatGold(totalCost),
    currentGold: formatGold(user.gold),
    canAfford: isGoldGte(user.gold, totalCost),
    maxLevel: MAX_LEVEL,
  };
}

async function upgradePokemonToLevel({ slackUserId, pokemonId, targetLevel }) {
  const preview = await buildUpgradeBatchPreview({ slackUserId, pokemonId, targetLevel });
  if (!preview.ok) return preview;

  if (!preview.canAfford) {
    return {
      ok: false,
      reason: "insufficient_gold",
      cost: preview.totalCost,
      currentGold: preview.currentGold,
      pokemon: preview.pokemon,
      currentLevel: preview.currentLevel,
      targetLevel: preview.targetLevel,
    };
  }

  const result = await upgradePokemonBatch({
    slackUserId,
    pokemonId,
    targetLevel: preview.targetLevel,
  });

  if (!result.ok) {
    logger.warn("Upgrade em lote rejeitado na confirmação", {
      slackUserId,
      pokemonId,
      currentLevel: result.previousLevel ?? preview.currentLevel,
      targetLevel: result.targetLevel ?? preview.targetLevel,
      totalCost: result.cost || preview.totalCost,
      reason: result.reason,
    });

    return {
      ok: false,
      reason: result.reason,
      cost: result.cost || preview.totalCost,
      currentGold: result.currentGold,
      pokemon: result.pokemon || preview.pokemon,
      currentLevel: result.previousLevel ?? preview.currentLevel,
      targetLevel: result.targetLevel ?? preview.targetLevel,
    };
  }

  logger.info("Upgrade em lote concluído", {
    slackUserId,
    pokemonId,
    currentLevel: result.previousLevel,
    targetLevel: result.newLevel,
    totalCost: result.totalCost,
    remainingGold: result.remainingGold,
  });

  return {
    ok: true,
    pokemon: result.pokemon || preview.pokemon,
    previousLevel: result.previousLevel,
    newLevel: result.newLevel,
    totalCost: result.totalCost,
    remainingGold: result.remainingGold,
    levelsGained: result.newLevel - result.previousLevel,
  };
}

function buildEvolvePreviewMessage({ slackUserId, preview }) {
  const currentName = preview.pokemon?.pokemon_species?.name || "Pokémon";
  const nextName = preview.nextSpecies?.name || "?";
  const affordability = preview.canAfford
    ? `💰 Gold atual: *${preview.currentGold}*`
    : `⚠️ Gold atual: *${preview.currentGold}* (insuficiente)`;

  return {
    text: `Confirmação de evolução para ${currentName}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Confirmar evolução", emoji: true } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Pokémon atual:* ${currentName} (#${preview.pokemon.id})\n` +
            `*Próxima evolução:* ${nextName}\n` +
            `*Custo:* ${preview.cost} gold\n` +
            affordability,
        },
        accessory: buildAccessoryImage(preview.nextSpecies || preview.pokemon?.pokemon_species),
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Somente <@${slackUserId}> pode confirmar esta evolução.` }],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: EVOLVE_CONFIRM_ACTION_ID,
            text: { type: "plain_text", text: "Confirmar evolução", emoji: true },
            style: "primary",
            value: buildActionValue({
              type: "evolve",
              slackUserId,
              pokemonId: preview.pokemon.id,
              currentSpeciesName: currentName,
              nextSpeciesName: nextName,
              cost: preview.cost,
            }),
          },
          {
            type: "button",
            action_id: EVOLVE_CANCEL_ACTION_ID,
            text: { type: "plain_text", text: "Cancelar", emoji: true },
            value: buildActionValue({ type: "evolve_cancel", slackUserId, pokemonId: preview.pokemon.id }),
          },
        ],
      },
    ],
  };
}

function buildEvolveUnavailableMessage({ slackUserId, preview }) {
  const pokemonName = preview?.pokemon?.pokemon_species?.name || "Pokémon";
  return {
    text: `Não há evolução disponível para ${pokemonName}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Evolução indisponível", emoji: true } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Pokémon:* ${pokemonName} (#${preview?.pokemon?.id || "?"})\nEsse Pokémon não possui próxima evolução disponível no momento.`,
        },
      },
    ],
  };
}

function buildUpgradeBatchPreviewMessage({ slackUserId, preview }) {
  const pokemonName = preview.pokemon?.pokemon_species?.name || "Pokémon";
  const affordability = preview.canAfford
    ? `💰 Gold atual: *${preview.currentGold}*`
    : `⚠️ Gold atual: *${preview.currentGold}* (insuficiente)`;

  return {
    text: `Confirmação de upgrade para ${pokemonName}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Confirmar upgrade em lote", emoji: true } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Pokémon:* ${pokemonName} (#${preview.pokemon.id})\n` +
            `*Nível atual:* ${preview.currentLevel}\n` +
            `*Nível alvo:* ${preview.targetLevel}\n` +
            `*Níveis a subir:* ${preview.levelsToGain}\n` +
            `*Custo total:* ${preview.totalCost} gold\n` +
            affordability,
        },
        accessory: buildAccessoryImage(preview.pokemon?.pokemon_species),
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Somente <@${slackUserId}> pode confirmar este upgrade.` }],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: UP_CONFIRM_ACTION_ID,
            text: { type: "plain_text", text: "Confirmar upgrade", emoji: true },
            style: "primary",
            value: buildActionValue({
              type: "up",
              slackUserId,
              pokemonId: preview.pokemon.id,
              currentLevel: preview.currentLevel,
              targetLevel: preview.targetLevel,
              totalCost: preview.totalCost,
            }),
          },
          {
            type: "button",
            action_id: UP_CANCEL_ACTION_ID,
            text: { type: "plain_text", text: "Cancelar", emoji: true },
            value: buildActionValue({ type: "up_cancel", slackUserId, pokemonId: preview.pokemon.id, targetLevel: preview.targetLevel }),
          },
        ],
      },
    ],
  };
}



function buildApplyItemViewMessage({ slackUserId, preview, feedbackText = null }) {
  const pokemon = preview?.pokemon || {};
  const species = pokemon?.pokemon_species || {};
  const pokemonName = species?.name || "Pokémon";
  const booksQty = Math.max(0, Number(preview?.booksQty) || 0);
  const bonuses = getPokemonBookBonuses(pokemon);

  const bonusLines = Object.keys(BOOK_STAT_CONFIG).map((key) => {
    const config = BOOK_STAT_CONFIG[key];
    const bonusValue = Math.max(0, Number(bonuses[key]) || 0);
    return `${config.emoji} *${config.label}:* +${bonusValue}/${ANCIENT_BOOK_STAT_LIMIT}`;
  });

  const actionButtons = Object.keys(BOOK_STAT_CONFIG).map((key) => {
    const config = BOOK_STAT_CONFIG[key];
    const currentBonus = Math.max(0, Number(bonuses[key]) || 0);
    const isMaxed = currentBonus >= ANCIENT_BOOK_STAT_LIMIT;

    return {
      type: "button",
      action_id: buildApplyItemActionId(key),
      text: { type: "plain_text", text: `${config.emoji} +1 ${config.label}`, emoji: true },
      style: isMaxed ? undefined : "primary",
      value: buildActionValue({ type: "apply_item", slackUserId, pokemonId: pokemon.id, statKey: key }),
      ...(isMaxed ? { confirm: {
        title: { type: "plain_text", text: "Limite atingido" },
        text: { type: "mrkdwn", text: `*${config.label}* já está no limite +${ANCIENT_BOOK_STAT_LIMIT}.` },
        confirm: { type: "plain_text", text: "OK" },
        deny: { type: "plain_text", text: "Fechar" },
      } } : {}),
    };
  });

  return {
    text: `Aplicar Livro do Ancião em ${pokemonName}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📘 Livro do Ancião", emoji: true } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Pokémon:* ${pokemonName} (#${pokemon.id})\n` +
            `🎚️ *Nível:* ${pokemon.level}\n` +
            `🎒 *Livros disponíveis:* *${booksQty}*\n` +
            `💸 *Custo fixo:* *${ANCIENT_BOOK_COST} livros* por +1 atributo\n` +
            `📏 *Limite por atributo:* +${ANCIENT_BOOK_STAT_LIMIT}` +
            (feedbackText ? `\n\n${feedbackText}` : ""),
        },
        accessory: buildAccessoryImage(species),
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Bônus permanentes por Livro:*\n${bonusLines.join("\n")}`,
        },
      },
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: "⚠️ Sem reembolso. Livros gastos não voltam. Ao vender o Pokémon, todos os bônus de Livro do Ancião são perdidos.",
        }],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Somente <@${slackUserId}> pode aplicar itens neste Pokémon.` }],
      },
      {
        type: "actions",
        elements: actionButtons,
      },
    ],
  };
}

async function applyBookItemToPokemon({ slackUserId, pokemonId, statKey }) {
  return applyAncientBookBonus({ slackUserId, pokemonId, statKey });
}

async function buildSellPreviewCard({ slackUserId, pokemonId, pokemonIds }) {
  if (Array.isArray(pokemonIds)) {
    return buildSellPreviewBatch({ slackUserId, pokemonIds });
  }
  return buildSellPreview({ slackUserId, pokemonId });
}

function buildSellPreviewMessage({ slackUserId, preview }) {
  const isBatch = Array.isArray(preview.items) && preview.items.length > 1;
  const pokemonName = preview.pokemon?.pokemon_species?.name || "Pokémon";
  const price = preview.priceBreakdown?.finalPrice || "0";
  const previewLines = isBatch
    ? preview.items.map((item) => `• *${item.pokemon?.pokemon_species?.name || "Pokémon"}* (#${item.pokemon.id}) — ${item.priceBreakdown?.finalPrice || "0"} gold`)
    : [
        `*Pokémon:* ${pokemonName} (#${preview.pokemon.id})`,
        `*Nível:* ${preview.pokemon.level}`,
        `*Valor da venda:* ${price} gold`,
        `*Investimento em upgrades:* ${preview.priceBreakdown?.totalUpgradeCost || "0"} gold`,
      ];

  return {
    text: isBatch ? `Confirmação de venda para ${preview.totalCount} Pokémons` : `Confirmação de venda para ${pokemonName}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Confirmar venda", emoji: true } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: isBatch
            ? [`*Pokémons selecionados (${preview.totalCount}):*`, ...previewLines, "", `*Valor total da venda:* ${preview.totalSellPrice || "0"} gold`].join("\n")
            : previewLines.join("\n"),
        },
        accessory: isBatch ? undefined : buildAccessoryImage(preview.pokemon?.pokemon_species),
      },
      ...(isBatch
        ? []
        : [{
            type: "context",
            elements: [{ type: "mrkdwn", text: `Investimento em upgrades: *${preview.priceBreakdown?.totalUpgradeCost || "0"}* gold.` }],
          }]),
      ...(isBatch
        ? [{
            type: "context",
            elements: [{ type: "mrkdwn", text: `Investimento total em upgrades: *${preview.totalUpgradeReturn || "0"}* gold.` }],
          }]
        : []),
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Somente <@${slackUserId}> pode confirmar esta venda.` }],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: SELL_CONFIRM_ACTION_ID,
            text: { type: "plain_text", text: "Confirmar venda", emoji: true },
            style: "danger",
            value: buildActionValue({ type: "sell", slackUserId, pokemonIds: preview.pokemonIds || [preview.pokemon.id] }),
          },
          {
            type: "button",
            action_id: SELL_CANCEL_ACTION_ID,
            text: { type: "plain_text", text: "Cancelar", emoji: true },
            value: buildActionValue({ type: "sell_cancel", slackUserId, pokemonIds: preview.pokemonIds || [preview.pokemon.id] }),
          },
        ],
      },
    ],
  };
}

function buildUnauthorizedActionMessage(ownerSlackUserId) {
  return {
    response_type: "ephemeral",
    text: `Somente <@${ownerSlackUserId}> pode confirmar esta ação.`,
  };
}

module.exports = {
  EVOLVE_CONFIRM_ACTION_ID,
  EVOLVE_CANCEL_ACTION_ID,
  UP_CONFIRM_ACTION_ID,
  UP_CANCEL_ACTION_ID,
  SELL_CONFIRM_ACTION_ID,
  SELL_CANCEL_ACTION_ID,
  APPLY_ITEM_ACTION_ID,
  buildApplyItemActionId,
  parsePokemonActionValue,
  buildEvolvePreview,
  buildEvolvePreviewMessage,
  buildEvolveUnavailableMessage,
  buildUpgradeBatchPreview,
  buildUpgradeBatchPreviewMessage,
  buildApplyItemViewMessage,
  applyBookItemToPokemon,
  buildSellPreviewCard,
  buildSellPreviewMessage,
  buildUnauthorizedActionMessage,
  calculateTotalUpgradeCost,
  upgradePokemonToLevel,
  sellPokemon,
  sellPokemonBatch,
  evolvePokemon,
};
