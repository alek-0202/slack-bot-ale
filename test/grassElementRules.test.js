const test = require("node:test");
const assert = require("node:assert/strict");

const {
  grassRules,
  GRASS_STATUS_ROOT,
  GRASS_EFFECT_SUFFOCATING_ROOTS,
} = require("../application/battle/domain/grassElementRules");

function createPlayer(userId, { hp = 1000, currentHp = hp, magic = 200, attack = 100, speed = 100 } = {}) {
  return {
    userId,
    stats: { magic, attack, speed, elementalChance: 0.2 },
    battleHp: { max: hp, current: currentHp },
    elementalState: { statuses: [], effects: [], skillCooldowns: {} },
  };
}

test("Crescimento Natural cura e acumula Raiz por turno", () => {
  const actor = createPlayer("U1", { hp: 1000, currentHp: 600 });
  grassRules.skills[0].cast({ actor, actorId: "U1" });
  const hookLogs = grassRules.hooks.endOfRound({ battle: { players: { U1: actor } } });

  const rootStatus = actor.elementalState.statuses.find((entry) => entry.id === GRASS_STATUS_ROOT);
  assert.ok(rootStatus);
  assert.equal(rootStatus.stacks, 1);
  assert.equal(actor.battleHp.current, 700);
  assert.equal(hookLogs.length, 1);
});

test("Raízes Sufocantes ganha +1 rodada quando alvo já tem efeito de grama", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  defender.elementalState.effects.push({ id: "existing_grass", element: "grass", remainingRounds: 2 });

  grassRules.skills[1].cast({
    battle: { players: { U1: actor, U2: defender } },
    actor,
    defender,
    actorId: "U1",
    defenderId: "U2",
  });

  const rootEffect = defender.elementalState.effects.find((entry) => entry.id === GRASS_EFFECT_SUFFOCATING_ROOTS);
  assert.ok(rootEffect);
  assert.equal(rootEffect.remainingRounds, 4);
  assert.ok(rootEffect.dotDamagePerRound > 0);
});

test("DOT de Raízes Sufocantes aplica dano e drenagem", () => {
  const actor = createPlayer("U1", { hp: 1000, currentHp: 500 });
  const defender = createPlayer("U2", { hp: 1000, currentHp: 900 });
  defender.elementalState.effects.push({
    id: GRASS_EFFECT_SUFFOCATING_ROOTS,
    element: "grass",
    sourceUserId: "U1",
    remainingRounds: 3,
    dotDamagePerRound: 100,
    drainHealRatio: 0.5,
  });

  const logs = grassRules.hooks.endOfRound({ battle: { players: { U1: actor, U2: defender } } });
  assert.equal(defender.battleHp.current, 800);
  assert.equal(actor.battleHp.current, 550);
  assert.ok(logs.some((entry) => entry.includes("drenou 50")));
});
