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

test("calculatePokemonSellPrice usa valor base do pokémon somado a todo o investimento em upgrade", () => {
  const level1 = calculatePokemonSellPrice({ baseValue: 300, rarity: "common", upgradeSpentGold: 0 });
  const upgraded = calculatePokemonSellPrice({ baseValue: 300, rarity: "common", upgradeSpentGold: 1050 });

  assert.equal(level1.finalPrice, "300");
  assert.equal(upgraded.basePrice, "300");
  assert.equal(upgraded.totalUpgradeCost, "1050");
  assert.equal(upgraded.upgradeReturn, "1050");
  assert.equal(upgraded.finalPrice, "1350");
});
