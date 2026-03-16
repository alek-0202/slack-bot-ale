const RARITY_STAT_BONUS = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function generatePokemonStats(species = {}) {
  const rarityBonus = RARITY_STAT_BONUS[species.rarity] || 0;
  const baseFloor = 8 + rarityBonus;
  const baseCeil = 15 + rarityBonus;

  return {
    attack: randomBetween(baseFloor, baseCeil),
    defense: randomBetween(baseFloor, baseCeil),
    hp: randomBetween(baseFloor + 2, baseCeil + 4),
    speed: randomBetween(baseFloor, baseCeil),
  };
}

module.exports = {
  generatePokemonStats,
};
