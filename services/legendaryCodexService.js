const crypto = require('crypto');
const { getSupabaseClient } = require('../database/supabase');
const { getUser } = require('./userService');
const { getOwnedPokemonById } = require('./pokemonLookupService');
const { rollLegendaryPassive, PASSIVE_DEFINITIONS, renderLegendaryPassiveDescription, getPassiveByCode } = require('./legendaryPassiveRegistry');

const APPLY_GOLD_COST = 50000;
const APPLY_ESSENCE_COST = 20000;

function buildCodexCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function normalizeCodexRow(row) {
  const def = PASSIVE_DEFINITIONS[row?.passive_id] || null;
  const values = row?.rolled_values || {};
  return {
    ...row,
    passiveName: def?.name || row?.passive_id,
    passiveCode: row?.passive_code,
    description: renderLegendaryPassiveDescription(row?.passive_id, values),
    values,
  };
}

async function grantLegendaryPassive({ slackUserId }) {
  const supabase = getSupabaseClient();
  const rolled = rollLegendaryPassive({});
  const { data: existing, error: existingError } = await supabase
    .from('user_legendary_codex')
    .select('id, efficiency')
    .eq('slack_user_id', slackUserId)
    .eq('passive_id', rolled.passiveId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing && Number(existing.efficiency || 0) >= Number(rolled.efficiency || 0)) {
    return { ok: true, action: 'kept_existing', codexEntry: null, rolled };
  }

  const payload = {
    slack_user_id: slackUserId,
    passive_id: rolled.passiveId,
    passive_code: buildCodexCode(),
    efficiency: rolled.efficiency,
    rolled_values: rolled.values,
    updated_at: new Date().toISOString(),
  };

  let upsertQuery = supabase.from('user_legendary_codex').upsert(payload, { onConflict: 'slack_user_id,passive_id' }).select('*').single();
  const { data: saved, error } = await upsertQuery;
  if (error) throw error;

  return {
    ok: true,
    action: existing ? 'upgraded_existing' : 'created',
    codexEntry: normalizeCodexRow(saved),
    rolled,
  };
}

async function listUserCodex(slackUserId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_legendary_codex')
    .select('*')
    .eq('slack_user_id', slackUserId)
    .order('efficiency', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeCodexRow);
}

async function applyCodexToPokemon({ slackUserId, pokemonId, passiveCode }) {
  const pokemon = await getOwnedPokemonById(pokemonId);
  if (!pokemon || pokemon.slack_user_id !== slackUserId) return { ok: false, reason: 'pokemon_not_found' };
  if (String(pokemon?.pokemon_species?.rarity || '').toLowerCase() !== 'legendary') return { ok: false, reason: 'pokemon_not_legendary' };

  const supabase = getSupabaseClient();
  const { data: codex, error: codexError } = await supabase
    .from('user_legendary_codex')
    .select('*')
    .eq('slack_user_id', slackUserId)
    .eq('passive_code', String(passiveCode || '').trim().toUpperCase())
    .maybeSingle();
  if (codexError) throw codexError;
  if (!codex) return { ok: false, reason: 'codex_not_found' };

  const user = await getUser(slackUserId);
  const currentGold = Number(String(user?.gold || '0').replace(/\./g, '').replace(',', '.')) || 0;
  const currentEssence = Number(user?.pokemonEssence || 0);
  if (currentGold < APPLY_GOLD_COST) return { ok: false, reason: 'insufficient_gold', requiredGold: APPLY_GOLD_COST, currentGold };
  if (currentEssence < APPLY_ESSENCE_COST) return { ok: false, reason: 'insufficient_essence', requiredEssence: APPLY_ESSENCE_COST, currentEssence };

  const { data: result, error } = await supabase.rpc('apply_legendary_codex_to_pokemon', {
    p_slack_user_id: slackUserId,
    p_pokemon_id: Number(pokemonId),
    p_passive_id: codex.passive_id,
    p_passive_code: codex.passive_code,
    p_rolled_values: codex.rolled_values || {},
    p_efficiency: Number(codex.efficiency || 0),
    p_gold_cost: APPLY_GOLD_COST,
    p_essence_cost: APPLY_ESSENCE_COST,
  });
  if (error) throw error;
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.ok) return { ok: false, reason: row?.reason || 'apply_failed' };

  return { ok: true, pokemon, codex: normalizeCodexRow(codex), costs: { gold: APPLY_GOLD_COST, essence: APPLY_ESSENCE_COST } };
}

function buildCodexSlackMessage(entries = []) {
  if (!entries.length) return '📖 Seu códex lendário está vazio. Abra um *Tomo Lendário* para obter passivas.';
  const lines = ['📖 *Códex Lendário*'];
  for (const entry of entries) {
    lines.push(`\n*${entry.passiveName}* [${entry.passiveCode}]`);
    lines.push(`Eficiência: ${Math.round(Number(entry.efficiency || 0) * 100)}%`);
    lines.push(entry.description);
  }
  return lines.join('\n');
}

function buildPassiveFromPokemonRow(row = null) {
  if (!row?.legendary_passive_id) return null;
  return {
    passiveId: row.legendary_passive_id,
    passiveCode: row.legendary_passive_code,
    efficiency: Number(row.legendary_passive_efficiency || 0),
    values: row.legendary_passive_values || {},
  };
}

module.exports = {
  APPLY_GOLD_COST,
  APPLY_ESSENCE_COST,
  grantLegendaryPassive,
  listUserCodex,
  applyCodexToPokemon,
  buildCodexSlackMessage,
  buildPassiveFromPokemonRow,
  getPassiveByCode,
};
