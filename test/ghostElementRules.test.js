const test = require("node:test");
const assert = require("node:assert/strict");

const { ghostRules, GHOST_EFFECT_ETHEREAL, GHOST_EFFECT_CURSE } = require("../application/battle/domain/ghostElementRules");

function createPlayer(userId) {
  return {
    userId,
    stats: { magic: 200, attack: 100, speed: 100, elementalChance: 0.2 },
    battleHp: { max: 1000, current: 1000 },
    selectedPokemon: { elementTypes: ["ghost"] },
    elementalState: { statuses: [], effects: [], skillCooldowns: {} },
  };
}

test("Forma Etérea ativa estado persistente", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  const battle = { players: { U1: actor, U2: defender }, metadata: { energyByUserId: { U1: 300, U2: 300 } } };
  const cast = ghostRules.skills[0].cast({ battle, actor, actorId: "U1" });
  assert.equal(cast.ok, true);
  const state = actor.elementalState.effects.find((entry) => entry.id === GHOST_EFFECT_ETHEREAL);
  assert.ok(state);
});

test("Maldição Sombria cria mark neutra persistente", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  const cast = ghostRules.skills[1].cast({ actor, defender, actorId: "U1", defenderId: "U2" });
  assert.equal(cast.ok, true);
  const curse = defender.elementalState.effects.find((entry) => entry.id === GHOST_EFFECT_CURSE);
  assert.ok(curse);
  assert.equal(curse.neutralNonRemovable, true);
});

test("Chamado das Sombras cria invocação secundária", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  const cast = ghostRules.skills[2].cast({ actor, defender, actorId: "U1", defenderId: "U2" });
  assert.equal(cast.ok, true);
  assert.ok((actor.elementalState.secondaryEntities || []).length >= 1);
});
