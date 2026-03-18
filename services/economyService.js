const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythical"];
const BASE_GOLD_BY_RARITY = {
  common: 300,
  uncommon: 800,
  rare: 2500,
  epic: 10000,
  legendary: 35000,
  mythical: 50000,
};
const LEVEL_BONUS_PER_LEVEL = 10;

function getRarityTier(rarity) {
  const tier = RARITY_ORDER.indexOf(rarity);
  return tier >= 0 ? tier : 0;
}

function getBaseGoldByRarity(rarity) {
  return BASE_GOLD_BY_RARITY[rarity] || BASE_GOLD_BY_RARITY.common;
}

function getLevelBonus(level) {
  const safeLevel = Math.max(1, Number(level) || 1);
  return (safeLevel - 1) * LEVEL_BONUS_PER_LEVEL;
}

function getGoldValueByRarityAndLevel({ rarity, level }) {
  return getBaseGoldByRarity(rarity) + getLevelBonus(level);
}

module.exports = {
  RARITY_ORDER,
  BASE_GOLD_BY_RARITY,
  LEVEL_BONUS_PER_LEVEL,
  getRarityTier,
  getBaseGoldByRarity,
  getLevelBonus,
  getGoldValueByRarityAndLevel,
};
