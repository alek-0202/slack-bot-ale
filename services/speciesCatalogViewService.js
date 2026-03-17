const { getSupabaseClient } = require("../database/supabase");

const SPECIES_NAV_PREV_ACTION_ID = "species_navigate_prev";
const SPECIES_NAV_NEXT_ACTION_ID = "species_navigate_next";

function normalizeText(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
    .select(
      "id, name, generation, sprite_url, rarity, evolution_stage, evolves_from, evolves_to, base_value",
    )
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

function buildEvolutionChain(targetSpeciesId, allSpecies) {
  const byId = new Map((allSpecies || []).map((species) => [species.id, species]));
  let current = byId.get(targetSpeciesId);

  if (!current) return [];

  const visited = new Set();
  while (current?.evolves_from && !visited.has(current.evolves_from)) {
    visited.add(current.id);
    const previous = byId.get(current.evolves_from);
    if (!previous) break;
    current = previous;
  }

  const chain = [];
  const chainVisited = new Set();
  while (current && !chainVisited.has(current.id)) {
    chain.push(current);
    chainVisited.add(current.id);
    if (!current.evolves_to) break;
    current = byId.get(current.evolves_to);
  }

  return chain;
}

async function findSpeciesByName(rawName) {
  const searchTerm = normalizeText(rawName || "");
  if (!searchTerm) return null;

  const speciesList = await getAllSpeciesCatalog();

  const ranked = speciesList
    .map((species) => {
      const normalizedName = normalizeText(species.name || "");

      let score = 0;
      if (normalizedName === searchTerm) score = 3;
      else if (normalizedName.startsWith(searchTerm)) score = 2;
      else if (normalizedName.includes(searchTerm)) score = 1;

      return {
        species,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.species.id - b.species.id);

  if (!ranked.length) return null;

  const selected = ranked[0].species;
  const chain = buildEvolutionChain(selected.id, speciesList);
  const speciesIds = chain.length > 1 ? chain.map((species) => species.id) : [selected.id];
  const index = speciesIds.indexOf(selected.id);

  return {
    species: selected,
    speciesIds,
    index: index >= 0 ? index : 0,
    chainSize: chain.length,
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
  getSpeciesView,
  findSpeciesByName,
  buildSpeciesMessage,
};
