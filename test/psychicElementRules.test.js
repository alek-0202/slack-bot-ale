const test = require("node:test");
const assert = require("node:assert/strict");

const {
  psychicRules,
  PSYCHIC_EFFECT_READ_STATE,
  PSYCHIC_EFFECT_BARRIER,
} = require("../application/battle/domain/psychicElementRules");

function createPlayer(userId) {
  return {
    userId,
    stats: { magic: 200, attack: 100, speed: 100, elementalChance: 0.2 },
    battleHp: { max: 1000, current: 1000 },
    selectedPokemon: { elementTypes: ["psychic"] },
    elementalState: { statuses: [], effects: [], skillCooldowns: {} },
  };
}

test("Leitura Mental mantém estado de cargas", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  const first = psychicRules.skills[0].cast({ actor, defender, actorId: "U1", defenderId: "U2" });
  assert.equal(first.ok, true);
  const state = actor.elementalState.effects.find((entry) => entry.id === PSYCHIC_EFFECT_READ_STATE);
  assert.ok(state);
  assert.equal(state.chargesRemaining, 1);
});

test("Barreira Psíquica cria shield persistente", () => {
  const actor = createPlayer("U1");
  const cast = psychicRules.skills[2].cast({ actor, actorId: "U1" });
  assert.equal(cast.ok, true);
  const barrier = actor.elementalState.effects.find((entry) => entry.id === PSYCHIC_EFFECT_BARRIER);
  assert.ok(barrier);
  assert.ok(barrier.shieldCurrentHp > 0);
});
