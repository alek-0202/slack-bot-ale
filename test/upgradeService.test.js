const test = require("node:test");
const assert = require("node:assert/strict");

const {
  UPGRADE_COST_BANDS,
  getUpgradeCostBand,
  getUpgradeCost,
  calculateTotalUpgradeCost,
} = require("../services/upgradeService");

test("faixas do upgrade expõem uma curva moderada e estável", () => {
  assert.equal(UPGRADE_COST_BANDS[0].baseCost, 200n);
  assert.equal(UPGRADE_COST_BANDS.at(-1).baseCost, 5000n);
  assert.equal(getUpgradeCostBand(1).minLevel, 1);
  assert.equal(getUpgradeCostBand(35).baseCost, 5000n);
});

test("getUpgradeCost cresce sem reduzir e estabiliza em 5000 a partir do nível 35", () => {
  assert.equal(getUpgradeCost(1), 200n);
  assert.equal(getUpgradeCost(5), 800n);
  assert.equal(getUpgradeCost(10), 1850n);
  assert.equal(getUpgradeCost(20), 4300n);
  assert.equal(getUpgradeCost(34), 4980n);
  assert.equal(getUpgradeCost(35), 5000n);
  assert.equal(getUpgradeCost(50), 5000n);
});

test("calculateTotalUpgradeCost soma níveis intermediários para !up", () => {
  assert.equal(calculateTotalUpgradeCost(1, 2), 200n);
  assert.equal(calculateTotalUpgradeCost(1, 5), 1700n);
  assert.equal(calculateTotalUpgradeCost(10, 12), 3950n);
  assert.equal(calculateTotalUpgradeCost(34, 36), 9980n);
});
