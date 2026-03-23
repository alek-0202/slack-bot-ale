const { getSupabaseClient } = require('../database/supabase');
const { createUserIfMissing } = require('./userService');

const ITEM_CATALOG = {
  ancient_book: {
    itemKey: 'ancient_book',
    itemName: 'Livro Ancião',
    description: 'Tomos antigos coletados em dungeons. Úteis para futuras evoluções, crafts e sistemas especiais.',
    extraData: { kind: 'material', rarity: 'dungeon' },
  },
};

function getItemDefinition(itemKey) {
  return ITEM_CATALOG[itemKey] || {
    itemKey,
    itemName: itemKey,
    description: null,
    extraData: {},
  };
}

async function addItem(slackUserId, itemKey, quantity, overrides = {}) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const item = { ...getItemDefinition(itemKey), ...overrides };
  const { data, error } = await supabase.rpc('upsert_user_item', {
    p_slack_user_id: slackUserId,
    p_item_key: item.itemKey,
    p_item_name: item.itemName,
    p_description: item.description,
    p_quantity: Math.max(1, Number(quantity) || 1),
    p_extra_data: item.extraData || {},
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function removeItem(slackUserId, itemKey, quantity) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('consume_user_item', {
    p_slack_user_id: slackUserId,
    p_item_key: itemKey,
    p_quantity: Math.max(1, Number(quantity) || 1),
  });
  if (error) {
    if (String(error.message || '').includes('Quantidade insuficiente')) {
      return { ok: false, reason: 'insufficient_quantity' };
    }
    if (String(error.message || '').includes('Item não encontrado')) {
      return { ok: false, reason: 'item_not_found' };
    }
    throw error;
  }
  return { ok: true, item: Array.isArray(data) ? data[0] : data };
}

async function getUserItems(slackUserId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_items')
    .select('id, slack_user_id, item_key, item_name, description, quantity, extra_data, updated_at')
    .eq('slack_user_id', slackUserId)
    .gt('quantity', 0)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

module.exports = {
  ITEM_CATALOG,
  getItemDefinition,
  addItem,
  removeItem,
  getUserItems,
};
