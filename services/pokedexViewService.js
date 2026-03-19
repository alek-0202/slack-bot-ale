const { calculatePokemonSellPrice } = require("./sellService");
const { getUserPokemons, buildPokedexDisplayEntries } = require("./pokemonService");
const { buildPokemonTypesLabel } = require("./pokemonTypeService");
const { buildPokemonVisualBlocks, buildPokemonVisualSummary } = require("../adapters/slack/renderers/pokemonVisualBlocks");

const POKEDEX_NAV_PREV_ACTION_ID = "pokedex_navigate_prev";
const POKEDEX_NAV_NEXT_ACTION_ID = "pokedex_navigate_next";
const PA_NAV_PREV_ACTION_ID = "pa_navigate_prev";
const PA_NAV_NEXT_ACTION_ID = "pa_navigate_next";

function createNavValue({ ownerSlackUserId, index, mode = "pokedex" }) {
  return JSON.stringify({ ownerSlackUserId, index, mode });
}

function parseNavValue(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      ownerSlackUserId: parsed.ownerSlackUserId,
      mode: parsed.mode || "pokedex",
      index: Number.isInteger(parsed.index) ? parsed.index : Number(parsed.index) || 0,
    };
  } catch {
    return {
      ownerSlackUserId: null,
      mode: "pokedex",
      index: 0,
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

async function getPokedexView(slackUserId, rawIndex) {
  const pokemons = await getUserPokemons(slackUserId);
  const entries = buildPokedexDisplayEntries(pokemons);

  if (!entries.length) {
    return {
      total: 0,
      index: 0,
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

function buildPokedexMessage({ slackUserId, entry, index, total, mode = "pokedex" }) {
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
  const sellPrice = calculatePokemonSellPrice({ rarity: species.rarity, level: entry.level, upgradeSpentGold: entry.upgrade_spent_gold }).finalPrice;
  const positionText = `${index + 1}/${total}`;
  const shinyTag = entry.shiny ? "\n✨ *Shiny*" : "";
  const quantitySuffix = entry.quantity > 1 ? ` (x${entry.quantity})` : "";
  const idsText = entry.quantity > 1 ? entry.pokemonIds.join(", ") : `${entry.id}`;

  const attributesText = isAttributesMode
    ? `\n\n*📊 Atributos*\n` +
      `⚔️ ATK: *${entry.attack || 0}* | 🛡️ DEF: *${entry.defense || 0}*\n` +
      `❤️ HP: *${entry.hp || 0}* | 💨 SPD: *${entry.speed || 0}*\n` +
      `💸 Venda atual: *${sellPrice}* gold`
    : "\n💸 Venda atual: *" + sellPrice + "* gold";

  const detailsText =
    `*${species.name || "Pokémon desconhecido"}${quantitySuffix}* (#${species.id || "?"})\n` +
    `🆔 ID${entry.quantity > 1 ? "s" : ""}: *${idsText}*\n` +
    `🎚️ Level: *${entry.level || 1}*\n` +
    `⭐ Estrelas: *${visual.starsLabel}*\n` +
    `🖼️ Moldura: *${visual.border.label}*\n` +
    `${visual.finalEvolution ? "👑 *Última evolução*\n" : "🧬 *Ainda possui evolução*\n"}` +
    `⭐ Raridade: *${species.rarity || "desconhecida"}*\n` +
    `${buildPokemonTypesLabel(species.element_types) ? `🧪 ${buildPokemonTypesLabel(species.element_types)}\n` : ""}` +
    `🏷️ Origem: *${entry.source || "capture"}*\n` +
    `${entry.grouped ? "📦 Grupo: *instâncias equivalentes (Lv 1)*\n" : ""}` +
    `🎯 Captura #${entry.id}${shinyTag}${attributesText}`;

  const section = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: detailsText,
    },
  };

  return {
    text: `📘 Pokédex ${positionText}: ${species.name || "Pokémon"}${quantitySuffix}`,
    blocks: [
      ...buildPokemonVisualBlocks({ species, level: entry.level }).blocks,
      section,
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
            value: createNavValue({ ownerSlackUserId: slackUserId, index: index - 1, mode }),
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
            value: createNavValue({ ownerSlackUserId: slackUserId, index: index + 1, mode }),
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
