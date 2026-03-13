const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

function pickByRarity(speciesList = []) {
  if (!speciesList.length) return null;

  const totalWeight = speciesList.reduce((sum, species) => {
    return sum + (RARITY_WEIGHTS[species.rarity] || 1);
  }, 0);

  let roll = Math.random() * totalWeight;

  for (const species of speciesList) {
    roll -= RARITY_WEIGHTS[species.rarity] || 1;
    if (roll <= 0) return species;
  }

  return speciesList[speciesList.length - 1];
}

module.exports = {
  RARITY_WEIGHTS,
  pickByRarity,
};
