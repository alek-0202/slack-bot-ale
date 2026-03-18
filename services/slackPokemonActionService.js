const { createLogger } = require("../utils/logger");
const { getUserPokemonById } = require("./pokemonService");
const { getUser } = require("./userService");
const { getSpeciesById } = require("./pokemonLookupService");
const { getEvolutionCost, evolvePokemon } = require("./evolutionService");
const { MAX_LEVEL, getUpgradeCost, calculateTotalUpgradeCost, upgradePokemon } = require("./upgradeService");
const { buildSellPreview, sellPokemon } = require("./sellService");
const { formatGold, isGoldGte, toGoldBigInt } = require("../utils/gold");

const logger = createLogger("slack-pokemon-actions");

const EVOLVE_CONFIRM_ACTION_ID = "pokemon_evolve_confirm";
const EVOLVE_CANCEL_ACTION_ID = "pokemon_evolve_cancel";
const UP_CONFIRM_ACTION_ID = "pokemon_up_confirm";
const UP_CANCEL_ACTION_ID = "pokemon_up_cancel";
const SELL_CONFIRM_ACTION_ID = "pokemon_sell_confirm";
const SELL_CANCEL_ACTION_ID = "pokemon_sell_cancel";

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

  const totalCost = calculateTotalUpgradeCost(currentLevel, desiredLevel);
  logger.info("Preview de upgrade em lote gerado", {
    slackUserId,
    pokemonId,
    currentLevel,
    targetLevel: desiredLevel,
    totalCost,
  });

  return {
    ok: true,
    pokemon,
    currentLevel,
    targetLevel: desiredLevel,
    levelsToGain: desiredLevel - currentLevel,
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

  let lastResult = null;
  for (let level = preview.currentLevel; level < preview.targetLevel; level += 1) {
    lastResult = await upgradePokemon({ slackUserId, pokemonId });
    if (!lastResult.ok) {
      logger.warn("Upgrade em lote interrompido", {
        slackUserId,
        pokemonId,
        attemptedTargetLevel: preview.targetLevel,
        failedAtLevel: level,
        reason: lastResult.reason,
      });
      return {
        ok: false,
        reason: lastResult.reason,
        cost: lastResult.cost || preview.totalCost,
        currentGold: lastResult.currentGold,
        pokemon: lastResult.pokemon || preview.pokemon,
        currentLevel: lastResult.previousLevel || level,
        targetLevel: preview.targetLevel,
      };
    }
  }

  logger.info("Upgrade em lote concluído", {
    slackUserId,
    pokemonId,
    fromLevel: preview.currentLevel,
    targetLevel: preview.targetLevel,
    totalCost: preview.totalCost,
  });

  return {
    ok: true,
    pokemon: lastResult?.pokemon || preview.pokemon,
    previousLevel: preview.currentLevel,
    newLevel: preview.targetLevel,
    totalCost: preview.totalCost,
    remainingGold: lastResult?.remainingGold ? formatGold(lastResult.remainingGold) : undefined,
    levelsGained: preview.levelsToGain,
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
            value: buildActionValue({ type: "evolve", slackUserId, pokemonId: preview.pokemon.id }),
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
            value: buildActionValue({ type: "up", slackUserId, pokemonId: preview.pokemon.id, targetLevel: preview.targetLevel }),
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


async function buildSellPreviewCard({ slackUserId, pokemonId }) {
  return buildSellPreview({ slackUserId, pokemonId });
}

function buildSellPreviewMessage({ slackUserId, preview }) {
  const pokemonName = preview.pokemon?.pokemon_species?.name || "Pokémon";
  const price = preview.priceBreakdown?.finalPrice || "0";

  return {
    text: `Confirmação de venda para ${pokemonName}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Confirmar venda", emoji: true } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Pokémon:* ${pokemonName} (#${preview.pokemon.id})\n` +
            `*Nível:* ${preview.pokemon.level}\n` +
            `*Valor da venda:* ${price} gold\n` +
            `*Retorno dos upgrades:* ${preview.priceBreakdown?.upgradeReturn || "0"} gold`,
        },
        accessory: buildAccessoryImage(preview.pokemon?.pokemon_species),
      },
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
            value: buildActionValue({ type: "sell", slackUserId, pokemonId: preview.pokemon.id }),
          },
          {
            type: "button",
            action_id: SELL_CANCEL_ACTION_ID,
            text: { type: "plain_text", text: "Cancelar", emoji: true },
            value: buildActionValue({ type: "sell_cancel", slackUserId, pokemonId: preview.pokemon.id }),
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
  parsePokemonActionValue,
  buildEvolvePreview,
  buildEvolvePreviewMessage,
  buildEvolveUnavailableMessage,
  buildUpgradeBatchPreview,
  buildUpgradeBatchPreviewMessage,
  buildSellPreviewCard,
  buildSellPreviewMessage,
  buildUnauthorizedActionMessage,
  calculateTotalUpgradeCost,
  upgradePokemonToLevel,
  sellPokemon,
  evolvePokemon,
};
