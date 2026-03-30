const test = require("node:test");
const assert = require("node:assert/strict");

const {
  fightingRules,
  FIGHTING_EFFECT_RHYTHM,
  FIGHTING_EFFECT_FINISHER,
  FIGHTING_EFFECT_UNYIELDING,
} = require("../application/battle/domain/fightingElementRules");

function createPlayer(userId) {
  return {
    userId,
    stats: { attack: 120, magic: 200, speed: 100, elementalChance: 0.2 },
    battleHp: { max: 1000, current: 1000 },
    selectedPokemon: { elementTypes: ["fighting"] },
    elementalState: { statuses: [], effects: [], skillCooldowns: {} },
  };
}

test("Ritmo de Combate acumula stacks e cria finisher em 3 stacks", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  fightingRules.skills[0].cast({ actor, actorId: "U1" });
  const onHit = fightingRules.skills[0].onHit;
  onHit({ attacker: actor, defender, attackerId: "U1", defenderId: "U2", currentDamage: 100 });
  onHit({ attacker: actor, defender, attackerId: "U1", defenderId: "U2", currentDamage: 100 });
  onHit({ attacker: actor, defender, attackerId: "U1", defenderId: "U2", currentDamage: 100 });
  const rhythm = actor.elementalState.effects.find((entry) => entry.id === FIGHTING_EFFECT_RHYTHM);
  const finisher = actor.elementalState.effects.find((entry) => entry.id === FIGHTING_EFFECT_FINISHER);
  assert.equal(rhythm.stacks, 3);
  assert.ok(finisher);
});

test("Golpe Demolidor consome stacks de Ritmo", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  fightingRules.skills[0].cast({ actor, actorId: "U1" });
  const rhythm = actor.elementalState.effects.find((entry) => entry.id === FIGHTING_EFFECT_RHYTHM);
  rhythm.stacks = 3;
  rhythm.targetUserId = "U2";
  const cast = fightingRules.skills[1].cast({ actor, defender, defenderId: "U2" });
  assert.equal(cast.ok, true);
  assert.equal(rhythm.stacks, 0);
});

test("Postura Inabalável ativa buff defensivo persistente", () => {
  const actor = createPlayer("U1");
  const cast = fightingRules.skills[2].cast({ actor, actorId: "U1" });
  assert.equal(cast.ok, true);
  const stance = actor.elementalState.effects.find((entry) => entry.id === FIGHTING_EFFECT_UNYIELDING);
  assert.ok(stance);
  assert.equal(stance.incomingDamageTakenMultiplier, 0.7);
});
