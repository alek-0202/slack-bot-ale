const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BASE_UPGRADE_COST,
  getUpgradeBandFlatBonus,
  applyUpgradeGrowth,
  getUpgradeCost,
  calculateTotalUpgradeCost,
} = require("../services/upgradeService");

test("faixas do upgrade aplicam bônus fixo progressivo correto", () => {
  assert.equal(BASE_UPGRADE_COST, 100n);
  assert.equal(getUpgradeBandFlatBonus(1), 0n);
  assert.equal(getUpgradeBandFlatBonus(10), 200n);
  assert.equal(getUpgradeBandFlatBonus(20), 300n);
});

test("getUpgradeCost cresce suavemente sem explosão entre faixas", () => {
  assert.equal(getUpgradeCost(1), 100n);
  assert.equal(getUpgradeCost(2), 115n);
  assert.equal(getUpgradeCost(10), 345n);
  assert.equal(getUpgradeCost(11), 596n);
  assert.equal(getUpgradeCost(20), 5444n);
  assert.equal(getUpgradeCost(21), 6560n);
  assert.equal(getUpgradeCost(50), 490715n);
});

test("applyUpgradeGrowth nunca reduz custo", () => {
  const level10 = getUpgradeCost(10);
  const next = applyUpgradeGrowth(level10, 10);
  assert.ok(next > level10);
});

test("calculateTotalUpgradeCost soma níveis intermediários para !up", () => {
  assert.equal(calculateTotalUpgradeCost(1, 2), 100n);
  assert.equal(calculateTotalUpgradeCost(1, 5), 498n);
  assert.equal(calculateTotalUpgradeCost(10, 12), 941n);
  assert.equal(calculateTotalUpgradeCost(20, 21), 5444n);
});
