const { getSupabaseClient } = require('../database/supabase');
const { createUserIfMissing, getUser } = require('./userService');
const { addItem } = require('./inventoryService');
const { listMarketItems, getMarketItem, MARKET_QUANTITIES } = require('./marketItemCatalogService');
const { addToCart, clearCart, getCart } = require('./cartService');

const ITEM_MARKET_SCOPE = 'item_market';
const ITEM_MARKET_ACTION_ADD_PREFIX = 'mi_add';
const ITEM_MARKET_ACTION_BUY = 'mi_cart_buy';
const ITEM_MARKET_ACTION_CANCEL = 'mi_cart_cancel';

function formatCurrency(value, currency) {
  const amount = Number(value || 0).toLocaleString('pt-BR');
  if (currency === 'essence') return `${amount} essência`;
  return `${amount} gold`;
}

function summarizeItemCart(cart) {
  const normalized = (cart?.items || []).map((entry) => {
    const item = getMarketItem(entry.itemKey);
    if (!item) return null;
    const quantity = Math.max(1, Number(entry.quantity || 0));
    return {
      itemKey: entry.itemKey,
      quantity,
      item,
      subtotal: Number(item.price || 0) * quantity,
    };
  }).filter(Boolean);

  const totals = normalized.reduce((acc, entry) => {
    acc[entry.item.currency] = (acc[entry.item.currency] || 0) + entry.subtotal;
    return acc;
  }, {});

  return { entries: normalized, totals };
}

function buildItemMarketMainMessage({ slackUserId, user }) {
  const rows = listMarketItems()
    .map((item) => `• *${item.displayName}* — ${formatCurrency(item.price, item.currency)}\n_${item.description}_`)
    .join('\n');

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🛍️ Market de Itens (!mi)', emoji: true } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `Treinador: <@${slackUserId}>\n`
          + `💰 Gold: *${user?.gold || '0'}*\n`
          + `🧪 Essência: *${Number(user?.pokemonEssence || 0).toLocaleString('pt-BR')}*\n\n`
          + `${rows}`,
      },
    },
    { type: 'divider' },
  ];

  for (const item of listMarketItems()) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${item.displayName}* — ${formatCurrency(item.price, item.currency)}` },
    });
    blocks.push({
      type: 'actions',
      elements: MARKET_QUANTITIES.map((qty) => ({
        type: 'button',
        action_id: `${ITEM_MARKET_ACTION_ADD_PREFIX}_${item.key}_${qty}`,
        text: { type: 'plain_text', text: `x${qty}` },
        value: JSON.stringify({ itemKey: item.key, quantity: qty, ownerSlackUserId: slackUserId }),
      })),
    });
  }

  return { text: 'Market de itens', blocks };
}

function buildItemMarketCartMessage({ cart }) {
  const summary = summarizeItemCart(cart);
  const cartLines = summary.entries.length
    ? summary.entries.map((entry) => `• ${entry.item.displayName} x${entry.quantity} — ${formatCurrency(entry.subtotal, entry.item.currency)}`).join('\n')
    : '• Carrinho vazio';

  const totalLines = Object.keys(summary.totals).length
    ? Object.entries(summary.totals).map(([currency, amount]) => `• Total ${currency === 'essence' ? 'essência' : 'gold'}: *${formatCurrency(amount, currency)}*`).join('\n')
    : '• Total: *0*';

  return {
    text: 'Carrinho do market de itens',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🛒 Carrinho (!mi)', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `${cartLines}\n\n${totalLines}` } },
      {
        type: 'actions',
        elements: [
          { type: 'button', action_id: ITEM_MARKET_ACTION_BUY, style: 'primary', text: { type: 'plain_text', text: 'Comprar' } },
          { type: 'button', action_id: ITEM_MARKET_ACTION_CANCEL, style: 'danger', text: { type: 'plain_text', text: 'Cancelar' } },
        ],
      },
    ],
  };
}

async function openItemMarket({ slackUserId }) {
  await createUserIfMissing(slackUserId);
  const user = await getUser(slackUserId);
  return buildItemMarketMainMessage({ slackUserId, user });
}

async function openItemMarketWithCart({ slackUserId, channelId }) {
  await createUserIfMissing(slackUserId);
  const [user, cart] = await Promise.all([
    getUser(slackUserId),
    Promise.resolve(getCart({ scope: ITEM_MARKET_SCOPE, userId: slackUserId, channelId })),
  ]);

  return {
    marketMessage: buildItemMarketMainMessage({ slackUserId, user }),
    cartMessage: buildItemMarketCartMessage({ cart }),
    cart,
  };
}

function getItemMarketCartMessage({ slackUserId, channelId }) {
  const cart = getCart({ scope: ITEM_MARKET_SCOPE, userId: slackUserId, channelId });
  return { cartMessage: buildItemMarketCartMessage({ cart }), cart };
}

function addItemToMarketCart({ slackUserId, channelId, itemKey, quantity }) {
  const item = getMarketItem(itemKey);
  if (!item) return { ok: false, reason: 'item_not_found' };
  const cart = addToCart({ scope: ITEM_MARKET_SCOPE, userId: slackUserId, channelId, itemKey: item.key, quantity });
  return { ok: true, cart, item };
}

async function applyPurchaseCurrency({ userId, currency, amount }) {
  const supabase = getSupabaseClient();
  if (currency === 'gold') {
    const { data, error } = await supabase.rpc('apply_gold_transaction', {
      p_slack_user_id: userId,
      p_amount: -Math.max(0, Number(amount || 0)),
      p_transaction_type: 'market_item_purchase',
    });
    if (error) {
      if (String(error.message || '').includes('Saldo de gold')) return { ok: false, reason: 'insufficient_gold' };
      throw error;
    }
    return { ok: true, data };
  }

  const { data: row, error: fetchError } = await supabase
    .from('users')
    .select('pokemon_essence')
    .eq('slack_user_id', userId)
    .single();
  if (fetchError) throw fetchError;
  const current = Math.max(0, Number(row?.pokemon_essence || 0));
  if (current < amount) return { ok: false, reason: 'insufficient_essence' };
  const { error: updateError } = await supabase
    .from('users')
    .update({ pokemon_essence: current - amount })
    .eq('slack_user_id', userId);
  if (updateError) throw updateError;
  return { ok: true };
}

async function checkoutItemMarketCart({ slackUserId, channelId }) {
  const cart = getCart({ scope: ITEM_MARKET_SCOPE, userId: slackUserId, channelId });
  if (!cart.items.length) return { ok: false, reason: 'empty_cart' };

  const normalized = cart.items.map((entry) => {
    const item = getMarketItem(entry.itemKey);
    return item ? { item, quantity: Math.max(1, Number(entry.quantity || 0)) } : null;
  }).filter(Boolean);

  const totalByCurrency = normalized.reduce((acc, entry) => {
    const subtotal = Number(entry.item.price) * entry.quantity;
    acc[entry.item.currency] = (acc[entry.item.currency] || 0) + subtotal;
    return acc;
  }, {});

  for (const [currency, amount] of Object.entries(totalByCurrency)) {
    const paid = await applyPurchaseCurrency({ userId: slackUserId, currency, amount });
    if (!paid.ok) return { ok: false, reason: paid.reason, currency, amount };
  }

  for (const entry of normalized) {
    await addItem(slackUserId, entry.item.grant.itemKey, entry.item.grant.quantity * entry.quantity);
  }

  clearCart({ scope: ITEM_MARKET_SCOPE, userId: slackUserId, channelId });
  return { ok: true, normalized, totalByCurrency };
}

function cancelItemMarketCart({ slackUserId, channelId }) {
  clearCart({ scope: ITEM_MARKET_SCOPE, userId: slackUserId, channelId });
  return { ok: true };
}

module.exports = {
  ITEM_MARKET_SCOPE,
  ITEM_MARKET_ACTION_ADD_PREFIX,
  ITEM_MARKET_ACTION_BUY,
  ITEM_MARKET_ACTION_CANCEL,
  buildItemMarketMainMessage,
  buildItemMarketCartMessage,
  openItemMarket,
  openItemMarketWithCart,
  getItemMarketCartMessage,
  addItemToMarketCart,
  checkoutItemMarketCart,
  cancelItemMarketCart,
};
