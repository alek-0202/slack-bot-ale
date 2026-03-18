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

test("calculatePokemonSellPrice considera bônus por nível e retorno de upgrade", () => {
  const level1 = calculatePokemonSellPrice({ rarity: "common", level: 1 });
  const level4 = calculatePokemonSellPrice({ rarity: "common", level: 4 });

  assert.equal(level1.finalPrice, "300");
  assert.equal(level4.levelBonus, "30");
  assert.ok(BigInt(level4.totalUpgradeCost) > 0n);
  assert.ok(BigInt(level4.upgradeReturn) > 0n);
  assert.ok(BigInt(level4.finalPrice) > BigInt(level1.finalPrice));
});
