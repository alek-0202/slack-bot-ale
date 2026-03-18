const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateTotalUpgradeCost,
  buildUnauthorizedActionMessage,
} = require("../services/slackPokemonActionService");
const { getUpgradeCost } = require("../services/upgradeService");

test("calculateTotalUpgradeCost soma os custos de cada nível intermediário", () => {
  const expected = getUpgradeCost(3) + getUpgradeCost(4) + getUpgradeCost(5);
  assert.equal(calculateTotalUpgradeCost(3, 6), expected);
});

test("buildUnauthorizedActionMessage restringe confirmação ao dono", () => {
  assert.deepEqual(buildUnauthorizedActionMessage("U123"), {
    response_type: "ephemeral",
    text: "Somente <@U123> pode confirmar esta ação.",
  });
});
