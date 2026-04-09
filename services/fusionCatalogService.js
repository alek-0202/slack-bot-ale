const FUSION_ITEMS = Object.freeze({
  magic_reroll_orb: {
    itemKey: 'magic_reroll_orb',
    itemName: 'Roleta Mágica',
    description: 'Rerolla IVs do Pokémon (pode subir ou descer).',
    useCommand: '!reroll <id>',
    costs: [{ itemKey: 'common_fragment', quantity: 5 }],
  },
  legendary_tome: {
    itemKey: 'legendary_tome',
    itemName: 'Tomo Lendário',
    description: 'Gera uma passiva lendária aleatória com roll de eficiência única (use !usetomo).',
    useCommand: '!usetomo',
    costs: [{ itemKey: 'legendary_fragment', quantity: 3 }],
  },
  epic_tome: {
    itemKey: 'epic_tome',
    itemName: 'Tomo Épico',
    description: 'Permite rolar e escolher 1 afixo épico fixo para um Pokémon (use !epictome <id>).',
    useCommand: '!epictome <id>',
    costs: [{ itemKey: 'epic_fragment', quantity: 3 }],
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
