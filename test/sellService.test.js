const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculatePokemonSellPrice,
  getBaseSellPriceByRarity,
} = require("../services/sellService");

test("getBaseSellPriceByRarity retorna fallback para raridade inválida", () => {
  assert.equal(getBaseSellPriceByRarity("epic"), 400);
  assert.equal(getBaseSellPriceByRarity("invalid"), 50);
});

test("calculatePokemonSellPrice considera bônus por nível e retorno de upgrade", () => {
  const level1 = calculatePokemonSellPrice({ rarity: "common", level: 1 });
  const level4 = calculatePokemonSellPrice({ rarity: "common", level: 4 });

  assert.equal(level1.finalPrice, 50);
  assert.equal(level4.levelBonus, 30);
  assert.ok(level4.totalUpgradeCost > 0);
  assert.ok(level4.upgradeReturn > 0);
  assert.ok(level4.finalPrice > level1.finalPrice);
});
