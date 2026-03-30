const test = require("node:test");
const assert = require("node:assert/strict");

const { applyGelidStacks, hasFrozen, getGelidStacks } = require("../application/battle/domain/iceStatusRules");
const { iceRules } = require("../application/battle/domain/iceElementRules");

function createPlayer(userId) {
  return {
    userId,
    stats: { magic: 200, attack: 100, speed: 100, elementalChance: 0.2 },
    battleHp: { max: 1000, current: 1000 },
    selectedPokemon: { elementTypes: ["ice"] },
    elementalState: { statuses: [], effects: [], skillCooldowns: {} },
  };
}

test("Gélido evolui para Congelado ao atingir 3 stacks e reseta stacks", () => {
  const target = createPlayer("U2");
  applyGelidStacks(target, 1, "U1");
  applyGelidStacks(target, 1, "U1");
  const final = applyGelidStacks(target, 1, "U1");
  assert.equal(final.promotedToFrozen, true);
  assert.equal(getGelidStacks(target), 0);
  assert.equal(hasFrozen(target), true);
});

test("Estilhaço Glacial consome congelado e aplica Quebra", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  applyGelidStacks(defender, 3, "U1");
  const cast = iceRules.skills[1].cast({ battle: { players: { U1: actor, U2: defender } }, actor, defender, actorId: "U1", defenderId: "U2" });
  assert.equal(cast.ok, true);
  assert.equal(hasFrozen(defender), false);
  const hasBreak = defender.elementalState.effects.some((entry) => entry.id === "ice_break");
  assert.equal(hasBreak, true);
});
