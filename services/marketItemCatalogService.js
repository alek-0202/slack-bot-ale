const { getItemDefinition } = require('./inventoryService');

const MARKET_ITEM_CATALOG = {
  potion_small: {
    key: 'potion_small',
    displayName: 'Poção pequena',
    description: 'Cura 10% do HP máximo em batalha.',
    currency: 'gold',
    price: 1000,
    grant: { type: 'item', itemKey: 'potion_small', quantity: 1 },
  },
  potion_medium: {
    key: 'potion_medium',
    displayName: 'Poção média',
    description: 'Cura 30% do HP máximo em batalha.',
    currency: 'gold',
    price: 5000,
    grant: { type: 'item', itemKey: 'potion_medium', quantity: 1 },
  },
  potion_large: {
    key: 'potion_large',
    displayName: 'Poção grande',
    description: 'Cura 50% do HP máximo em batalha.',
    currency: 'gold',
    price: 10000,
    grant: { type: 'item', itemKey: 'potion_large', quantity: 1 },
  },
  reset_energy_token: {
    key: 'reset_energy_token',
    displayName: 'Reset Energy',
    description: 'Consumível usado no comando !re para resetar energia.',
    currency: 'gold',
    price: 20000,
    grant: { type: 'item', itemKey: 'reset_energy_token', quantity: 1 },
  },
  mythical_pokemon_token: {
    key: 'mythical_pokemon_token',
    displayName: 'Pokémon Mítico',
    description: 'Ticket de invocação para evolução futura do market.',
    currency: 'essence',
    price: 1000000,
    grant: { type: 'item', itemKey: 'mythical_pokemon_token', quantity: 1 },
  },
  pokeball_c: {
    key: 'pokeball_c',
    displayName: 'Pokebola',
    description: 'Permite capturar Pokémon com !c.',
    currency: 'essence',
    price: 1000,
    grant: { type: 'item', itemKey: 'pokeball_c', quantity: 1 },
  },
};

const MARKET_QUANTITIES = [1, 10, 50, 100, 1000];

function listMarketItems() {
  return Object.values(MARKET_ITEM_CATALOG);
}

function getMarketItem(itemKey) {
  const normalized = String(itemKey || '').trim().toLowerCase();
  return MARKET_ITEM_CATALOG[normalized] || null;
}

function getItemVisualDefinition(itemKey) {
  const marketItem = getMarketItem(itemKey);
  if (!marketItem) return null;
  const definition = getItemDefinition(marketItem.grant.itemKey);
  return {
    ...marketItem,
    itemName: definition.itemName || marketItem.displayName,
    itemDescription: definition.description || marketItem.description,
  };
}

module.exports = {
  MARKET_QUANTITIES,
  MARKET_ITEM_CATALOG,
  listMarketItems,
  getMarketItem,
  getItemVisualDefinition,
};
