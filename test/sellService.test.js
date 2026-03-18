const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculatePokemonSellPrice,
  getBaseSellPriceByRarity,
} = require("../services/sellService");

test("getBaseSellPriceByRarity retorna fallback para raridade inválida", () => {
  assert.equal(getBaseSellPriceByRarity("epic"), 10000n);
  assert.equal(getBaseSellPriceByRarity("invalid"), 300n);
});

test("calculatePokemonSellPrice considera nível e investimento acumulado em upgrade", () => {
  const level1 = calculatePokemonSellPrice({ rarity: "common", level: 1, upgradeSpentGold: 0 });
  const upgraded = calculatePokemonSellPrice({ rarity: "common", level: 4, upgradeSpentGold: 1050 });

  assert.equal(level1.finalPrice, "300");
  assert.equal(upgraded.levelBonus, "30");
  assert.equal(upgraded.totalUpgradeCost, "1050");
  assert.equal(upgraded.upgradeReturn, "210");
  assert.equal(upgraded.finalPrice, "540");
});
