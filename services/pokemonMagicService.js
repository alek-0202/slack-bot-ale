const { getSupabaseClient } = require("../database/supabase");
const { createLogger } = require("../utils/logger");
const { getOwnedPokemonById } = require("./pokemonLookupService");
const { normalizePokemonTypes } = require("./pokemonTypeService");
const { buildDefaultMagicName, getElementIcon, getElementLabel } = require("./magicLibraryService");

const logger = createLogger("pokemon-magic-service");
const MAX_MAGIC_SLOTS = 3;
const pendingMagicSelectionByKey = new Map();

function buildMagicEntriesFromElements(elements = []) {
  return normalizePokemonTypes(elements)
    .slice(0, MAX_MAGIC_SLOTS)
    .map((element, index) => ({
      slot: index + 1,
      name: buildDefaultMagicName(element, index),
      element,
      icon: getElementIcon(element),
      elementLabel: getElementLabel(element),
    }));
}

async function getPokemonMagicLoadout(pokemonId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_magic_loadouts")
    .select("pokemon_id, slack_user_id, selected_elements, spells, updated_at")
    .eq("pokemon_id", pokemonId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function upsertPokemonMagicLoadout({ slackUserId, pokemonId, selectedElements }) {
  const pokemon = await getOwnedPokemonById(pokemonId);
  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_found" };
  }

  if (pokemon.slack_user_id !== slackUserId) {
    return { ok: false, reason: "not_owner" };
  }

  const allElements = normalizePokemonTypes(pokemon.pokemon_species?.element_types || []);
  if (!allElements.length) {
    return { ok: false, reason: "pokemon_without_elements", pokemon };
  }

  let finalElements = normalizePokemonTypes(selectedElements?.length ? selectedElements : allElements);

  if (allElements.length > MAX_MAGIC_SLOTS && !selectedElements?.length) {
    storePendingMagicSelection({ slackUserId, pokemonId, allElements });
    return {
      ok: false,
      reason: "requires_element_selection",
      pokemon,
      allElements,
      maxSlots: MAX_MAGIC_SLOTS,
    };
  }

  finalElements = finalElements.filter((element) => allElements.includes(element)).slice(0, MAX_MAGIC_SLOTS);
  if (!finalElements.length) {
    return { ok: false, reason: "invalid_selected_elements", pokemon, allElements };
  }

  const spells = buildMagicEntriesFromElements(finalElements);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_magic_loadouts")
    .upsert({
      pokemon_id: pokemon.id,
      slack_user_id: slackUserId,
      selected_elements: finalElements,
      spells,
    }, { onConflict: "pokemon_id" })
    .select("pokemon_id, slack_user_id, selected_elements, spells, updated_at")
    .single();

  if (error) throw error;

  clearPendingMagicSelection({ slackUserId, pokemonId });
  logger.info("Magias registradas para Pokémon", {
    slackUserId,
    pokemonId,
    selectedElements: finalElements,
    slots: spells.length,
  });

  return {
    ok: true,
    pokemon,
    loadout: data,
    spells,
  };
}

function storePendingMagicSelection({ slackUserId, pokemonId, allElements }) {
  const key = buildPendingKey({ slackUserId, pokemonId });
  pendingMagicSelectionByKey.set(key, {
    slackUserId,
    pokemonId,
    allElements: normalizePokemonTypes(allElements),
    createdAt: Date.now(),
  });
}

function getPendingMagicSelection({ slackUserId, pokemonId }) {
  return pendingMagicSelectionByKey.get(buildPendingKey({ slackUserId, pokemonId })) || null;
}

function clearPendingMagicSelection({ slackUserId, pokemonId }) {
  pendingMagicSelectionByKey.delete(buildPendingKey({ slackUserId, pokemonId }));
}

function buildPendingKey({ slackUserId, pokemonId }) {
  return `${slackUserId}:${pokemonId}`;
}

function buildMagicSummary(spells = []) {
  if (!spells.length) return "Nenhuma magia registrada.";

  return spells
    .map((spell) => `• ${spell.slot}: *${spell.name}* ${spell.icon} (${spell.elementLabel || getElementLabel(spell.element)})`)
    .join("\n");
}

module.exports = {
  MAX_MAGIC_SLOTS,
  buildMagicEntriesFromElements,
  getPokemonMagicLoadout,
  upsertPokemonMagicLoadout,
  storePendingMagicSelection,
  getPendingMagicSelection,
  clearPendingMagicSelection,
  buildMagicSummary,
};
