const sessionsByKey = new Map();

function buildSessionKey({ scope, userId, channelId }) {
  return `${String(scope || 'default')}::${String(channelId || 'global')}::${String(userId || 'unknown')}`;
}

function upsertMarketSession({ scope, context, userId, channelId, marketMessageTs = null, cartMessageTs = null, cart = null }) {
  const key = buildSessionKey({ scope, userId, channelId });
  const existing = sessionsByKey.get(key) || { key, scope, context, userId, channelId, marketMessageTs: null, cartMessageTs: null, cart: null };
  const next = {
    ...existing,
    context: context || existing.context,
    marketMessageTs: marketMessageTs || existing.marketMessageTs,
    cartMessageTs: cartMessageTs || existing.cartMessageTs,
    cart: cart || existing.cart,
  };
  sessionsByKey.set(key, next);
  return next;
}

function getMarketSession({ scope, userId, channelId }) {
  const key = buildSessionKey({ scope, userId, channelId });
  return sessionsByKey.get(key) || null;
}

function setMarketSessionCart({ scope, userId, channelId, cart }) {
  return upsertMarketSession({ scope, userId, channelId, cart });
}

function clearMarketSession({ scope, userId, channelId }) {
  const key = buildSessionKey({ scope, userId, channelId });
  sessionsByKey.delete(key);
}

module.exports = {
  upsertMarketSession,
  getMarketSession,
  setMarketSessionCart,
  clearMarketSession,
};
