const { calculatePokemonSellPrice } = require("./sellService");
const { getUserPokemons, buildPokedexDisplayEntries, filterUserPokemons, normalizePokemonFilter } = require("./pokemonService");
const { buildPokemonTypesLabel } = require("./pokemonTypeService");
const {
  buildPokemonVisualBlocks,
  buildPokemonVisualSummary,
  summarizeImageReference,
} = require("../adapters/slack/renderers/pokemonVisualBlocks");
const { createLogger } = require("../utils/logger");

const POKEDEX_NAV_PREV_ACTION_ID = "pokedex_navigate_prev";
const POKEDEX_NAV_NEXT_ACTION_ID = "pokedex_navigate_next";
const PA_NAV_PREV_ACTION_ID = "pa_navigate_prev";
const PA_NAV_NEXT_ACTION_ID = "pa_navigate_next";
const logger = createLogger("service:pokedex-view");

function createNavValue({ ownerSlackUserId, index, mode = "pokedex", filter = {} }) {
  return JSON.stringify({ ownerSlackUserId, index, mode, filter: normalizePokemonFilter(filter) });
}

function parseNavValue(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      ownerSlackUserId: parsed.ownerSlackUserId,
      mode: parsed.mode || "pokedex",
      index: Number.isInteger(parsed.index) ? parsed.index : Number(parsed.index) || 0,
      filter: normalizePokemonFilter(parsed.filter || {}),
    };
  } catch {
    return {
      ownerSlackUserId: null,
      mode: "pokedex",
      index: 0,
      filter: normalizePokemonFilter({}),
    };
  }
}

function normalizeIndex(index, total) {
  if (!total || total <= 0) return 0;
  const normalized = Number.isInteger(index) ? index : Number(index);

  if (Number.isNaN(normalized) || normalized < 0) return 0;
  if (normalized >= total) return total - 1;
  return normalized;
}

async function getPokedexView(slackUserId, rawIndex, filter = {}) {
  const pokemons = await getUserPokemons(slackUserId);
  const filtered = filterUserPokemons(pokemons, filter);
  const entries = buildPokedexDisplayEntries(filtered);

  if (!entries.length) {
    return {
      total: 0,
      index: 0,
      filter: normalizePokemonFilter({}),
      entry: null,
    };
  }

  const index = normalizeIndex(rawIndex, entries.length);
  return {
    total: entries.length,
    index,
    entry: entries[index],
  };
}

async function buildPokedexMessage({
  slackUserId,
  entry,
  index,
  total,
  mode = "pokedex",
  slackClient = null,
  channelId = null,
  commandName = null,
  filter = {},
}) {
  const isAttributesMode = mode === "pa";
  const prevActionId = isAttributesMode ? PA_NAV_PREV_ACTION_ID : POKEDEX_NAV_PREV_ACTION_ID;
  const nextActionId = isAttributesMode ? PA_NAV_NEXT_ACTION_ID : POKEDEX_NAV_NEXT_ACTION_ID;

  if (!entry || !total) {
    return {
      text: `📘 <@${slackUserId}>, sua Pokédex está vazia. Use *!capture* para começar!`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📘 <@${slackUserId}>, sua Pokédex está vazia.\nUse *!capture* para começar!`,
          },
        },
      ],
    };
  }

  const species = entry.pokemon_species || {};
  const visual = buildPokemonVisualSummary({ species, level: entry.level });
  const sellPrice = calculatePokemonSellPrice({ baseValue: species.base_value, rarity: species.rarity, upgradeSpentGold: entry.upgrade_spent_gold }).finalPrice;
  const positionText = `${index + 1}/${total}`;
  const shinyTag = entry.shiny ? "\n✨ *Shiny*" : "";
  const favoriteTag = entry.is_favorite ? "\n⭐ *Favorito*" : "";
  const quantitySuffix = entry.quantity > 1 ? ` (x${entry.quantity})` : "";
  const idsText = entry.quantity > 1 ? entry.pokemonIds.join(", ") : `${entry.id}`;

  const attributesText = isAttributesMode
    ? `\n\n*📊 Atributos*\n` +
      `⚔️ ATK: *${entry.attack || 0}* | ✨ MAG: *${entry.magic ?? entry.attack ?? 0}*\n` +
      `🛡️ DEF: *${entry.defense || 0}*\n` +
      `❤️ HP: *${entry.hp || 0}* | 💨 SPD: *${entry.speed || 0}*\n` +
      `💸 Venda atual: *${sellPrice}* gold`
    : `\n💸 Venda atual: *${sellPrice}* gold`;

  const detailsText =
    `*${species.name || "Pokémon desconhecido"}${quantitySuffix}* (#${species.id || "?"})\n` +
    `🆔 ID${entry.quantity > 1 ? "s" : ""}: *${idsText}*\n` +
    `🎚️ Level: *${entry.level || 1}*\n` +
    `⭐ Estrelas: *${visual.starsLabel}*\n` +
    `${visual.finalEvolution ? "👑 *Última evolução*\n" : ""}` +
    `🏅 Raridade: *${species.rarity || "desconhecida"}*\n` +
    `${buildPokemonTypesLabel(species.element_types) ? `🧪 ${buildPokemonTypesLabel(species.element_types)}\n` : ""}` +
    `🏷️ Origem: *${entry.source || "capture"}*\n` +
    `${entry.grouped ? "📦 Grupo: *instâncias equivalentes (Lv 1)*\n" : ""}` +
    `🎯 Captura #${entry.id}${shinyTag}${favoriteTag}${attributesText}`;

  const visualBlocks = await buildPokemonVisualBlocks({
    species,
    level: entry.level,
    shiny: entry.shiny,
    shinyType: entry.shiny_type,
    slackClient,
    channelId,
    commandName: commandName || mode,
  });
  logger.info("Mensagem de Pokédex montada com bloco visual", {
    commandMode: mode,
    commandName: commandName || mode,
    channelId,
    builder: "buildPokedexMessage",
    speciesName: species.name,
    speciesId: species.id,
    pokemonId: entry.id,
    level: entry.level,
    shiny: Boolean(entry.shiny),
    hasAccessory: Boolean(visualBlocks.accessory),
    accessoryType: visualBlocks.accessory?.image_url ? "image_url" : "none",
    accessoryImage: summarizeImageReference(visualBlocks.accessory?.image_url),
    accessoryImageUrlLength: visualBlocks.accessory?.image_url?.length || 0,
    visualBlocksCount: visualBlocks.blocks.length,
  });

  const section = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: detailsText,
    },
    ...(visualBlocks.accessory ? { accessory: visualBlocks.accessory } : {}),
  };

  return {
    text: `📘 Pokédex ${positionText}: ${species.name || "Pokémon"}${quantitySuffix}`,
    blocks: [
      section,
      ...visualBlocks.blocks,
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `📍 Posição: *${positionText}*`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Anterior",
              emoji: true,
            },
            action_id: prevActionId,
            value: createNavValue({ ownerSlackUserId: slackUserId, index: index - 1, mode, filter }),
            style: "primary",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Próximo",
              emoji: true,
            },
            action_id: nextActionId,
            value: createNavValue({ ownerSlackUserId: slackUserId, index: index + 1, mode, filter }),
            style: "primary",
          },
        ],
      },
    ],
  };
}

module.exports = {
  POKEDEX_NAV_PREV_ACTION_ID,
  POKEDEX_NAV_NEXT_ACTION_ID,
  PA_NAV_PREV_ACTION_ID,
  PA_NAV_NEXT_ACTION_ID,
  parseNavValue,
  getPokedexView,
  buildPokedexMessage,
};
