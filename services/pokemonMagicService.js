require("../application/battle/domain/elementalEngine");
const { getSupabaseClient } = require("../database/supabase");
const { createLogger } = require("../utils/logger");
const { getOwnedPokemonById } = require("./pokemonLookupService");
const { normalizePokemonTypes, normalizePokemonType } = require("./pokemonTypeService");
const { getRandomMagicName, getElementIcon, getElementLabel } = require("./magicLibraryService");
const { getSkillShortDescription } = require("../application/battle/domain/skillPresentationRegistry");
const {
  ENABLE_ELEMENTAL_SKILLS,
  ENABLE_ELEMENTAL_SKILLS_REGISTRY,
  ENABLE_ELEMENTAL_SKILLS_MRSKILL,
  getElementalRules,
  getRegisteredElementalRules,
} = require("../application/battle/domain/elementalRules");

const logger = createLogger("pokemon-magic-service");
const MAX_MAGIC_SLOTS = 5;
const CHARACTERISTIC_SKILL_MIN_LEVEL = 50;
const pendingMagicSelectionByKey = new Map();

function buildMagicEntriesFromElements(elements = []) {
  const usedNames = new Set();

  return normalizePokemonTypes(elements)
    .slice(0, MAX_MAGIC_SLOTS)
    .map((element, index) => {
      const name = getRandomMagicName(element, [...usedNames]);
      usedNames.add(name);

      return {
        slot: index + 1,
        name,
        element,
        icon: getElementIcon(element),
        elementLabel: getElementLabel(element),
      };
    });
}


function canRegisterCharacteristicSkills(pokemon) {
  return (Number(pokemon?.level) || 0) >= CHARACTERISTIC_SKILL_MIN_LEVEL;
}

function buildCharacteristicSkillEntriesFromElements(elements = [], pokemonLevel = 0) {
  if (!ENABLE_ELEMENTAL_SKILLS_REGISTRY) return [];
  if ((Number(pokemonLevel) || 0) < CHARACTERISTIC_SKILL_MIN_LEVEL) return [];

  const normalized = normalizePokemonTypes(elements);
  const entries = [];
  for (const element of normalized) {
    const rules = getElementalRules(element);
    if (!rules?.skills?.length) continue;
    for (const skill of rules.skills) {
      entries.push({
        kind: 'characteristic',
        id: skill.id,
        name: skill.name,
        description: getSkillShortDescription(skill),
        element,
        icon: skill.icon || getElementIcon(element),
        cooldownRounds: skill.cooldownRounds || null,
        extraEnergyCost: skill.extraEnergyCost || 0,
        isPassive: Boolean(skill.isPassive || skill.activationType === "passive"),
        activationType: skill.activationType || "active",
        hiddenFromActionMenu: Boolean(skill.hiddenFromActionMenu),
      });
    }
  }
  return entries;
}

async function getPokemonMagicLoadout(pokemonId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pokemon_magic_loadouts")
    .select("pokemon_id, slack_user_id, selected_elements, spells, updated_at")
    .eq("pokemon_id", pokemonId)
    .maybeSingle();

  if (error) throw error;
  const loadout = data || null;
  const characteristicSkills = await getPersistedCharacteristicSkills({ pokemonId });
  if (!loadout) {
    return characteristicSkills.length
      ? { pokemon_id: Number(pokemonId), spells: [...characteristicSkills] }
      : null;
  }

  const regularSpells = Array.isArray(loadout.spells)
    ? loadout.spells.filter((entry) => entry?.kind !== "characteristic")
    : [];
  return {
    ...loadout,
    spells: [...regularSpells, ...characteristicSkills],
  };
}

async function getPersistedCharacteristicSkillRows({ pokemonId, slackUserId = null }) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("user_pokemon_characteristic_skills")
    .select("pokemon_id, slack_user_id, skill_id, slot, is_active")
    .eq("pokemon_id", pokemonId)
    .eq("is_active", true)
    .order("slot", { ascending: true });

  if (slackUserId) query = query.eq("slack_user_id", slackUserId);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function getPersistedCharacteristicSkills({ pokemonId }) {
  const rows = await getPersistedCharacteristicSkillRows({ pokemonId });
  if (!rows.length) return [];

  const pokemon = await getOwnedPokemonById(pokemonId);
  const elementTypes = normalizePokemonTypes(pokemon?.pokemon_species?.element_types || []);
  const available = dedupeBySkillId(buildCharacteristicSkillEntriesFromElements(elementTypes, pokemon?.level || 0));
  const skillsById = new Map(available.map((entry) => [String(entry.id), entry]));

  return rows
    .map((row) => {
      const skill = skillsById.get(String(row.skill_id));
      if (!skill) return null;
      return {
        ...skill,
        kind: "characteristic",
        slot: `elemental:${row.skill_id}`,
      };
    })
    .filter(Boolean)
    .slice(0, 2);
}

async function replacePersistedCharacteristicSkills({ slackUserId, pokemonId, selectedSkillIds = [] }) {
  const uniqueSkillIds = [...new Set((selectedSkillIds || []).map((entry) => String(entry)).filter(Boolean))].slice(0, 2);
  const supabase = getSupabaseClient();

  const { error: deleteError } = await supabase
    .from("user_pokemon_characteristic_skills")
    .delete()
    .eq("pokemon_id", pokemonId)
    .eq("slack_user_id", slackUserId);
  if (deleteError) throw deleteError;

  if (!uniqueSkillIds.length) return { ok: true, count: 0 };

  const rows = uniqueSkillIds.map((skillId, index) => ({
    pokemon_id: pokemonId,
    slack_user_id: slackUserId,
    skill_id: skillId,
    slot: index + 1,
    is_active: true,
  }));
  const { error: insertError } = await supabase
    .from("user_pokemon_characteristic_skills")
    .insert(rows);
  if (insertError) throw insertError;
  return { ok: true, count: rows.length };
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

  const persistedCharacteristicSkills = await getPersistedCharacteristicSkills({ pokemonId });
  const regularSpells = buildMagicEntriesFromElements(finalElements);
  const spells = [...regularSpells, ...persistedCharacteristicSkills];
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
    .map((spell) => `• ${spell.slot}: ${spell.icon || getElementIcon(spell.element)} *${spell.name}*`)
    .join("\n");
}


async function clearCharacteristicSkillsFromLoadout({ slackUserId, pokemonId }) {
  const loadout = await getPokemonMagicLoadout(pokemonId);
  if (!loadout || (loadout.slack_user_id && loadout.slack_user_id !== slackUserId)) return { ok: true, removed: 0 };

  const rows = await getPersistedCharacteristicSkillRows({ pokemonId, slackUserId });
  if (!rows.length) return { ok: true, removed: 0 };

  await replacePersistedCharacteristicSkills({ slackUserId, pokemonId, selectedSkillIds: [] });

  return { ok: true, removed: rows.length };
}

async function clearLegacyCharacteristicSkillsFromAllLoadouts() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("cleanup_characteristic_skills_from_magic_loadouts");
  if (error) {
    logger.warn("RPC de limpeza global indisponível, usando fallback local por lotes.", { error: error.message || error });
    const pageSize = 500;
    let from = 0;
    while (true) {
      const { data, error: loadError } = await supabase
        .from("pokemon_magic_loadouts")
        .select("pokemon_id, spells")
        .range(from, from + pageSize - 1);
      if (loadError) throw loadError;
      if (!data?.length) break;
      for (const row of data) {
        const spells = Array.isArray(row.spells) ? row.spells : [];
        const nextSpells = spells.filter((entry) => entry?.kind !== "characteristic");
        if (nextSpells.length === spells.length) continue;
        const { error: updateError } = await supabase
          .from("pokemon_magic_loadouts")
          .update({ spells: nextSpells })
          .eq("pokemon_id", row.pokemon_id);
        if (updateError) throw updateError;
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  return { ok: true };
}

function dedupeBySkillId(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    const skillId = String(entry?.id || '');
    if (!skillId || seen.has(skillId)) return false;
    seen.add(skillId);
    return true;
  });
}

async function getMrSkillSetup({ slackUserId, pokemonId }) {
  if (!ENABLE_ELEMENTAL_SKILLS_MRSKILL) {
    return { ok: false, reason: "characteristic_skills_disabled" };
  }
  const pokemon = await getOwnedPokemonById(pokemonId);
  if (!pokemon) return { ok: false, reason: 'pokemon_not_found' };
  if (pokemon.slack_user_id !== slackUserId) return { ok: false, reason: 'not_owner', pokemon };
  if (!canRegisterCharacteristicSkills(pokemon)) {
    return { ok: false, reason: 'level_too_low', pokemon, minLevel: CHARACTERISTIC_SKILL_MIN_LEVEL };
  }

  const rawElements = pokemon.pokemon_species?.element_types;
  const allElements = normalizePokemonTypes(rawElements);
  if (!allElements.length) return { ok: false, reason: 'pokemon_without_elements', pokemon };

  logger.info("MRSKILL element normalization", {
    slackUserId,
    pokemonId,
    rawElements,
    normalizedElements: allElements,
    normalizedPerInput: [].concat(rawElements == null ? [] : rawElements).map((entry) => ({
      raw: entry,
      normalized: normalizePokemonType(entry),
    })),
    registryElements: getRegisteredElementalRules().map((entry) => entry.element),
  });

  const registryKeys = allElements
    .map((element) => ({
      element,
      hasRules: Boolean(getElementalRules(element)),
    }));
  logger.info("MRSKILL registry lookup", {
    slackUserId,
    pokemonId,
    registryKeys,
  });

  const availableSkills = dedupeBySkillId(buildCharacteristicSkillEntriesFromElements(allElements, pokemon.level));
  if (!availableSkills.length) {
    logger.warn("MRSKILL sem skills após resolução de elementos", {
      slackUserId,
      pokemonId,
      pokemonLevel: pokemon.level,
      rawElements,
      normalizedElements: allElements,
      registryElements: getRegisteredElementalRules().map((entry) => entry.element),
      enableElementalSkills: ENABLE_ELEMENTAL_SKILLS,
      enableElementalSkillsRegistry: ENABLE_ELEMENTAL_SKILLS_REGISTRY,
      enableElementalSkillsMrskill: ENABLE_ELEMENTAL_SKILLS_MRSKILL,
    });
    return { ok: false, reason: 'no_characteristic_skills', pokemon };
  }

  const loadout = await getPokemonMagicLoadout(pokemonId);
  const persistedRows = await getPersistedCharacteristicSkillRows({ pokemonId });
  const selectedSkillIds = persistedRows.map((entry) => String(entry.skill_id)).slice(0, 2);

  return {
    ok: true,
    pokemon,
    loadout,
    availableSkills,
    selectedSkillIds,
  };
}

async function saveMrSkillSelection({ slackUserId, pokemonId, selectedSkillIds = [] }) {
  const setup = await getMrSkillSetup({ slackUserId, pokemonId });
  if (!setup.ok) return setup;

  const allowed = new Set(setup.availableSkills.map((entry) => String(entry.id)));
  const nextSkillIds = [...new Set((selectedSkillIds || []).map((id) => String(id)).filter((id) => allowed.has(id)))].slice(0, 2);
  await replacePersistedCharacteristicSkills({
    slackUserId,
    pokemonId: setup.pokemon.id,
    selectedSkillIds: nextSkillIds,
  });

  const selectedElements = normalizePokemonTypes(
    setup.loadout?.selected_elements?.length
      ? setup.loadout.selected_elements
      : setup.pokemon.pokemon_species?.element_types || [],
  ).slice(0, MAX_MAGIC_SLOTS);
  const regularSpells = buildMagicEntriesFromElements(selectedElements);
  const characteristicSkills = setup.availableSkills
    .filter((entry) => nextSkillIds.includes(String(entry.id)))
    .map((entry) => ({ ...entry, slot: `elemental:${entry.id}` }));
  const spells = [...regularSpells, ...characteristicSkills];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('pokemon_magic_loadouts')
    .upsert({
      pokemon_id: setup.pokemon.id,
      slack_user_id: slackUserId,
      selected_elements: selectedElements,
      spells,
    }, { onConflict: 'pokemon_id' })
    .select('pokemon_id, slack_user_id, selected_elements, spells, updated_at')
    .single();
  if (error) throw error;

  return { ok: true, pokemon: setup.pokemon, loadout: data, selectedSkillIds: nextSkillIds, availableSkills: setup.availableSkills };
}

module.exports = {
  MAX_MAGIC_SLOTS,
  CHARACTERISTIC_SKILL_MIN_LEVEL,
  buildMagicEntriesFromElements,
  canRegisterCharacteristicSkills,
  buildCharacteristicSkillEntriesFromElements,
  getPokemonMagicLoadout,
  upsertPokemonMagicLoadout,
  storePendingMagicSelection,
  getPendingMagicSelection,
  clearPendingMagicSelection,
  buildMagicSummary,
  clearCharacteristicSkillsFromLoadout,
  clearLegacyCharacteristicSkillsFromAllLoadouts,
  getMrSkillSetup,
  saveMrSkillSelection,
};
