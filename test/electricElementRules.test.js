const test = require("node:test");
const assert = require("node:assert/strict");

const { electricRules, ELECTRIC_EFFECT_OVERCHARGE } = require("../application/battle/domain/electricElementRules");

function createPlayer(userId, hp = 1000) {
  return {
    userId,
    stats: { attack: 120, magic: 200, speed: 100, elementalChance: 0.2 },
    battleHp: { max: hp, current: hp },
    selectedPokemon: { elementTypes: ["electric"] },
    elementalState: { statuses: [], effects: [], skillCooldowns: {} },
  };
}

test("Sobrecarga aplica buff com 2 cargas", () => {
  const actor = createPlayer("U1");
  const cast = electricRules.skills[0].cast({ actor, actorId: "U1" });
  assert.equal(cast.ok, true);
  const effect = actor.elementalState.effects.find((entry) => entry.id === ELECTRIC_EFFECT_OVERCHARGE);
  assert.ok(effect);
  assert.equal(effect.chargesRemaining, 2);
});

test("Corrente de Raios gera eventos de dano em cadeia", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  defender.team = [
    { id: 21, battleHp: { current: 500, max: 500 } },
    { id: 22, battleHp: { current: 500, max: 500 } },
    { id: 23, battleHp: { current: 500, max: 500 } },
  ];
  defender.activeTeamIndex = 0;
  const battle = { players: { U1: actor, U2: defender } };

  const cast = electricRules.skills[1].cast({ battle, actor, actorId: "U1", defenderId: "U2" });
  assert.equal(cast.ok, true);
  assert.ok(Array.isArray(cast.damageEvents));
  assert.ok(cast.damageEvents.length >= 1);
});
