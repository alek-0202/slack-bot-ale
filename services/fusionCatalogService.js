const FUSION_ITEMS = Object.freeze({
  magic_reroll_orb: {
    itemKey: 'magic_reroll_orb',
    itemName: 'Roleta Mágica',
    description: 'Rerolla IVs do Pokémon (pode subir ou descer).',
    useCommand: '!reroll <id>',
    costs: [{ itemKey: 'common_fragment', quantity: 5 }],
  },
  prism_shiny: {
    itemKey: 'prism_shiny',
    itemName: 'Prisma',
    description: 'Transforma um Pokémon em SHINE normal.',
    useCommand: '!transform <id>',
    costs: [{ itemKey: 'prismatic_fragment', quantity: 100 }],
  },
  prism_prime: {
    itemKey: 'prism_prime',
    itemName: 'Prisma PRIME',
    description: 'Transforma um Pokémon em SHINE PRIME.',
    useCommand: '!transformprime <id>',
    costs: [{ itemKey: 'prismatic_fragment', quantity: 500 }],
  },
});

function listFusionItems() {
  return Object.values(FUSION_ITEMS);
}

function getFusionItem(itemKey) {
  return FUSION_ITEMS[String(itemKey || '').trim().toLowerCase()] || null;
}

module.exports = {
  FUSION_ITEMS,
  listFusionItems,
  getFusionItem,
};
