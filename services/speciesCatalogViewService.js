const { getSupabaseClient } = require("../database/supabase");
const { buildPokemonTypesLabel } = require("./pokemonTypeService");

const SPECIES_NAV_PREV_ACTION_ID = "species_navigate_prev";
const SPECIES_NAV_NEXT_ACTION_ID = "species_navigate_next";

function createSpeciesNavValue({ ownerSlackUserId, index, speciesIds = null }) {
  return JSON.stringify({ ownerSlackUserId, index, speciesIds });
}

function parseSpeciesNavValue(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      ownerSlackUserId: parsed.ownerSlackUserId,
      index: Number.isInteger(parsed.index) ? parsed.index : Number(parsed.index) || 0,
      speciesIds: Array.isArray(parsed.speciesIds)
        ? parsed.speciesIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : null,
    };
  } catch {
    return {
      ownerSlackUserId: null,
      index: 0,
      speciesIds: null,
    };
  }
}

function normalizeIndex(index, total) {
  if (!total || total <= 0) return 0;
  const parsed = Number.isInteger(index) ? index : Number(index);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  if (parsed >= total) return total - 1;
  return parsed;
}

async function getAllSpeciesCatalog() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_species")
    .select("id, name, generation, sprite_url, rarity, evolution_stage, evolves_from, evolves_to, base_value, element_types")
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

function orderSpeciesSubset(speciesList, speciesIds) {
  if (!speciesIds || !speciesIds.length) return speciesList;

  const byId = new Map((speciesList || []).map((species) => [species.id, species]));
  return speciesIds.map((id) => byId.get(id)).filter(Boolean);
}

async function getSpeciesView(rawIndex, speciesIds = null) {
  const speciesList = await getAllSpeciesCatalog();
  const entries = orderSpeciesSubset(speciesList, speciesIds);

  if (!entries.length) {
    return {
      total: 0,
      index: 0,
      entry: null,
      speciesIds: speciesIds && speciesIds.length ? speciesIds : null,
    };
  }

  const index = normalizeIndex(rawIndex, entries.length);

  return {
    total: entries.length,
    index,
    entry: entries[index],
    speciesIds: speciesIds && speciesIds.length ? speciesIds : null,
  };
}


function buildSpeciesMessage({ slackUserId, entry, index, total, speciesIds = null }) {
  if (!entry || !total) {
    return {
      text: `📚 <@${slackUserId}>, não encontrei espécies cadastradas no catálogo global.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📚 <@${slackUserId}>, não encontrei espécies cadastradas no catálogo global.`,
          },
        },
      ],
    };
  }

  const positionText = `${index + 1}/${total}`;
  const hasEvolutionChain = total > 1;
  const fromText = entry.evolves_from ? `#${entry.evolves_from}` : "-";
  const toText = entry.evolves_to ? `#${entry.evolves_to}` : "-";

  const detailsText =
    `*${entry.name || "Pokémon desconhecido"}* (#${entry.id || "?"})\n` +
    `⭐ Raridade: *${entry.rarity || "desconhecida"}*\n` +
    `🧬 Estágio evolutivo: *${entry.evolution_stage || 1}*\n` +
    `🔁 Evolui de: *${fromText}* | Para: *${toText}*\n` +
    `${buildPokemonTypesLabel(entry.element_types) ? `🧪 ${buildPokemonTypesLabel(entry.element_types)}\n` : ""}` +
    `💰 Valor base: *${entry.base_value || 0}* gold\n` +
    `🗺️ Geração: *${entry.generation || "-"}*\n` +
    `📚 Fonte: *catálogo global*`;

  const section = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: detailsText,
    },
  };

  if (entry.sprite_url) {
    section.accessory = {
      type: "image",
      image_url: entry.sprite_url,
      alt_text: entry.name || "Pokémon",
    };
  }

  return {
    text: `📚 Catálogo ${positionText}: ${entry.name || "Pokémon"}`,
    blocks: [
      section,
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: hasEvolutionChain
              ? `📍 Posição na cadeia: *${positionText}*`
              : `📍 Posição no catálogo: *${positionText}*`,
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
            action_id: SPECIES_NAV_PREV_ACTION_ID,
            value: createSpeciesNavValue({
              ownerSlackUserId: slackUserId,
              index: index - 1,
              speciesIds,
            }),
            style: "primary",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Próximo",
              emoji: true,
            },
            action_id: SPECIES_NAV_NEXT_ACTION_ID,
            value: createSpeciesNavValue({
              ownerSlackUserId: slackUserId,
              index: index + 1,
              speciesIds,
            }),
            style: "primary",
          },
        ],
      },
    ],
  };
}

module.exports = {
  SPECIES_NAV_PREV_ACTION_ID,
  SPECIES_NAV_NEXT_ACTION_ID,
  parseSpeciesNavValue,
  getAllSpeciesCatalog,
  getSpeciesView,
  buildSpeciesMessage,
};
