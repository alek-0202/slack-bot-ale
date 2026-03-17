const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BASE_UPGRADE_COST,
  getUpgradeMultiplier,
  getUpgradeCost,
} = require("../services/upgradeService");

test("getUpgradeMultiplier respeita faixas de progressão", () => {
  assert.equal(getUpgradeMultiplier(0), 1.05);
  assert.equal(getUpgradeMultiplier(1), 1.05);
  assert.equal(getUpgradeMultiplier(5), 1.25);
  assert.equal(getUpgradeMultiplier(10), 1.5);
  assert.equal(getUpgradeMultiplier(20), 1.5);
});

test("getUpgradeCost cresce conforme nível", () => {
  assert.equal(getUpgradeCost(1), BASE_UPGRADE_COST);
  assert.ok(getUpgradeCost(2) > getUpgradeCost(1));
  assert.ok(getUpgradeCost(8) > getUpgradeCost(3));
});
