const { getSupabaseClient } = require('../database/supabase');
const { getOwnedPokemonById } = require('./pokemonLookupService');
const {
  normalizeEpicAffix,
  rollDistinctEpicAffixOptions,
  formatEpicAffix,
} = require('./epicAffixRegistry');

function getPokemonEpicAffix(pokemon) {
  return normalizeEpicAffix({
    type: pokemon?.epic_affix_type,
    value: pokemon?.epic_affix_value,
    label: pokemon?.epic_affix_label,
    valueType: pokemon?.epic_affix_value_type,
    metadata: pokemon?.epic_affix_metadata || {},
  });
}

function buildEpicAffixDisplayLine(pokemon) {
  const affix = getPokemonEpicAffix(pokemon);
  return `Afixo Épico: ${formatEpicAffix(affix)}`;
}

function createEpicTomeRoll({ pokemon }) {
  const currentAffix = getPokemonEpicAffix(pokemon);
  const options = rollDistinctEpicAffixOptions(2);
  return {
    currentAffix,
    options,
  };
}

async function setPokemonEpicAffix({ slackUserId, pokemonId, affix }) {
  const normalized = normalizeEpicAffix(affix);
  const supabase = getSupabaseClient();
  const payload = normalized
    ? {
      epic_affix_type: normalized.type,
      epic_affix_value: normalized.value,
      epic_affix_label: normalized.label,
      epic_affix_value_type: normalized.valueType,
      epic_affix_metadata: normalized.metadata || {},
      epic_affix_updated_at: new Date().toISOString(),
    }
    : {
      epic_affix_type: null,
      epic_affix_value: null,
      epic_affix_label: null,
      epic_affix_value_type: null,
      epic_affix_metadata: {},
      epic_affix_updated_at: new Date().toISOString(),
    };

  const { data, error } = await supabase
    .from('user_pokemons')
    .update(payload)
    .eq('id', pokemonId)
    .eq('slack_user_id', slackUserId)
    .select('id, slack_user_id, epic_affix_type, epic_affix_value, epic_affix_label, epic_affix_value_type, epic_affix_metadata, epic_affix_updated_at')
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: 'pokemon_not_found' };

  return {
    ok: true,
    pokemon: data,
    affix: getPokemonEpicAffix(data),
  };
}

async function validateOwnedPokemon({ slackUserId, pokemonId }) {
  const pokemon = await getOwnedPokemonById(pokemonId);
  if (!pokemon || pokemon.slack_user_id !== slackUserId) return { ok: false, reason: 'pokemon_not_found' };
  return { ok: true, pokemon };
}

module.exports = {
  getPokemonEpicAffix,
  buildEpicAffixDisplayLine,
  createEpicTomeRoll,
  setPokemonEpicAffix,
  validateOwnedPokemon,
};
