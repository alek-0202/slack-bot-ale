const { getSupabaseClient } = require('../database/supabase');
const { createUserIfMissing } = require('./userService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('service:inventory');

const ITEM_CATALOG = {
  ancient_book: {
    itemKey: 'ancient_book',
    itemName: 'Livro Ancião',
    description: 'Tomos antigos coletados em dungeons. Úteis para futuras evoluções, crafts e sistemas especiais.',
    extraData: { kind: 'material', rarity: 'dungeon' },
  },
  pokeball_c: {
    itemKey: 'pokeball_c',
    itemName: 'Pokebola (!c)',
    description: 'Permite capturar um Pokémon sem cooldown',
    extraData: { kind: 'consumable', category: 'capture' },
  },
};

function getItemDefinition(itemKey) {
  const normalizedItemKey = String(itemKey || '').trim().toLowerCase();
  return ITEM_CATALOG[normalizedItemKey] || {
    itemKey: normalizedItemKey,
    itemName: normalizedItemKey,
    description: null,
    extraData: {},
  };
}

function normalizeItemRpcRow(row) {
  if (!row) return row;
  if (row.slack_user_id || !row.item_slack_user_id) return row;
  return {
    ...row,
    slack_user_id: row.item_slack_user_id,
  };
}

async function addItem(slackUserId, itemKey, quantity, overrides = {}) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const item = { ...getItemDefinition(itemKey), ...overrides };
  logger.info('Chamando RPC de inventário', {
    file: 'services/inventoryService.js',
    method: 'addItem',
    rpcName: 'upsert_user_item',
    slackUserId,
    itemKey: item.itemKey,
    quantity,
  });
  const { data, error } = await supabase.rpc('upsert_user_item', {
    p_slack_user_id: slackUserId,
    p_item_key: String(item.itemKey || '').trim().toLowerCase(),
    p_item_name: item.itemName,
    p_description: item.description,
    p_quantity: Math.max(1, Number(quantity) || 1),
    p_extra_data: item.extraData || {},
  });
  if (error) {
    logger.error('Erro na RPC upsert_user_item', {
      file: 'services/inventoryService.js',
      method: 'addItem',
      rpcName: 'upsert_user_item',
      slackUserId,
      itemKey: item.itemKey,
      quantity,
      error,
    });
    throw error;
  }
  logger.info('RPC upsert_user_item concluída', {
    file: 'services/inventoryService.js',
    method: 'addItem',
    rpcName: 'upsert_user_item',
    slackUserId,
    itemKey: item.itemKey,
    rowCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
  });
  return normalizeItemRpcRow(Array.isArray(data) ? data[0] : data);
}

async function removeItem(slackUserId, itemKey, quantity) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('consume_user_item', {
    p_slack_user_id: slackUserId,
    p_item_key: String(itemKey || '').trim().toLowerCase(),
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
  return { ok: true, item: normalizeItemRpcRow(Array.isArray(data) ? data[0] : data) };
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

async function getUserItemQuantity(slackUserId, itemKey) {
  const supabase = getSupabaseClient();
  const normalizedItemKey = String(itemKey || '').trim().toLowerCase();
  const { data, error } = await supabase
    .from('user_items')
    .select('quantity')
    .eq('slack_user_id', slackUserId)
    .eq('item_key', normalizedItemKey)
    .maybeSingle();
  if (error) throw error;
  return Math.max(0, Number(data?.quantity) || 0);
}

module.exports = {
  ITEM_CATALOG,
  getItemDefinition,
  addItem,
  removeItem,
  getUserItems,
  getUserItemQuantity,
};
