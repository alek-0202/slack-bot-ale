const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculatePokemonSellPrice,
  getBaseSellPriceByRarity,
} = require("../services/sellService");

test("getBaseSellPriceByRarity retorna fallback para raridade inválida", () => {
  assert.equal(getBaseSellPriceByRarity("epic"), 10000);
  assert.equal(getBaseSellPriceByRarity("invalid"), 300);
});

test("calculatePokemonSellPrice considera bônus por nível e retorno de upgrade", () => {
  const level1 = calculatePokemonSellPrice({ rarity: "common", level: 1 });
  const level4 = calculatePokemonSellPrice({ rarity: "common", level: 4 });

  assert.equal(level1.finalPrice, 300);
  assert.equal(level4.levelBonus, 30);
  assert.ok(level4.totalUpgradeCost > 0);
  assert.ok(level4.upgradeReturn > 0);
  assert.ok(level4.finalPrice > level1.finalPrice);
});
