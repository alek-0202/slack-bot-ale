const cartsByScope = new Map();

function buildScopeKey({ scope, userId, channelId }) {
  return `${String(scope || 'default')}::${String(channelId || 'global')}::${String(userId || 'unknown')}`;
}

function getOrCreateCart({ scope, userId, channelId }) {
  const key = buildScopeKey({ scope, userId, channelId });
  if (!cartsByScope.has(key)) cartsByScope.set(key, { key, scope, userId, channelId, items: [] });
  return cartsByScope.get(key);
}

function addToCart({ scope, userId, channelId, itemKey, quantity, metadata = {} }) {
  const cart = getOrCreateCart({ scope, userId, channelId });
  const safeQty = Math.max(1, Number(quantity) || 1);
  const found = cart.items.find((entry) => entry.itemKey === itemKey);
  if (found) {
    found.quantity += safeQty;
    if (metadata && Object.keys(metadata).length) found.metadata = { ...(found.metadata || {}), ...metadata };
  } else {
    cart.items.push({ itemKey, quantity: safeQty, metadata: { ...metadata } });
  }
  return cart;
}

function clearCart({ scope, userId, channelId }) {
  const key = buildScopeKey({ scope, userId, channelId });
  cartsByScope.delete(key);
}

function getCart({ scope, userId, channelId }) {
  return getOrCreateCart({ scope, userId, channelId });
}

module.exports = {
  addToCart,
  clearCart,
  getCart,
};
