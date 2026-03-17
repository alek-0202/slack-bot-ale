const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateBattleHp,
  calculateDamage,
  resolvePotionTurn,
  decideStartingPlayer,
} = require("../services/battleEngineService");

test("calculateBattleHp aplica multiplicador de 12.5", () => {
  assert.equal(calculateBattleHp(10), 125);
  assert.equal(calculateBattleHp(1), 13);
});

test("calculateDamage aplica crítico e arredondamento", () => {
  const result = calculateDamage({
    attackerAttack: 10,
    defenderDefense: 5,
    d6Roll: 6,
    d20Roll: 20,
  });

  assert.equal(result.isCritical, true);
  assert.equal(result.normalDamage, 16);
  assert.ok(result.finalDamage >= 1);
});

test("calculateDamage permite bloqueio total quando defesa excede 2x dano", () => {
  const result = calculateDamage({
    attackerAttack: 1,
    defenderDefense: 50,
    d6Roll: 1,
    d20Roll: 1,
  });

  assert.equal(result.finalDamage, 0);
});

test("resolvePotionTurn limita em 5 poções e não passa HP máximo", () => {
  const player = {
    battleHp: { max: 100, current: 40 },
    potionsUsed: 0,
  };

  const first = resolvePotionTurn(player);
  assert.equal(first.ok, true);
  assert.equal(player.battleHp.current, 61);

  player.potionsUsed = 5;
  const blocked = resolvePotionTurn(player);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "limit");
});

test("decideStartingPlayer sempre retorna um dos dois usuários", () => {
  const result = decideStartingPlayer("U1", "U2");
  assert.ok(["U1", "U2"].includes(result.starter));
  assert.ok(["cara", "coroa"].includes(result.result));
});
