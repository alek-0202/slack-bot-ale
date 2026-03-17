const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythical"];
const BASE_COMMON_GOLD = 50;
const LEVEL_BONUS_PER_LEVEL = 10;

function getRarityTier(rarity) {
  const tier = RARITY_ORDER.indexOf(rarity);
  return tier >= 0 ? tier : 0;
}

function getBaseGoldByRarity(rarity) {
  return BASE_COMMON_GOLD * 2 ** getRarityTier(rarity);
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
  BASE_COMMON_GOLD,
  LEVEL_BONUS_PER_LEVEL,
  getRarityTier,
  getBaseGoldByRarity,
  getLevelBonus,
  getGoldValueByRarityAndLevel,
};
