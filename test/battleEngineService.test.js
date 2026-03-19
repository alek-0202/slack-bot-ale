const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateBattleHp,
  calculateDamage,
  resolvePotionTurn,
  decideStartingPlayer,
  createInitialInitiativeState,
  resolveNextTurnBySpeed,
} = require("../application/battle/domain/battleEngine");
const {
  createBattle,
  acceptInvite,
  assignSelectedPokemon,
  advanceSelectionState,
  startBattle,
} = require("../application/battle/domain/battleState");
const { BATTLE_ACTION } = require("../application/battle/domain/actionResolver");
const { resolveBattleTurn } = require("../application/battle/domain/turnResolver");

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

test("iniciativa por speed mantém medidor e pode conceder turno extra", () => {
  const battle = createReadyBattle({ u1Speed: 15, u2Speed: 10 });
  battle.initiative = createInitialInitiativeState({ challengerId: "U1", challengedId: "U2", starter: "U1" });

  const first = resolveNextTurnBySpeed({ battle, actorUserId: "U1" });
  assert.equal(first.nextActorUserId, "U1");
  assert.equal(first.extraTurn, true);
  assert.equal(first.gauges.U1, 105);
  assert.equal(first.gauges.U2, 70);

  const second = resolveNextTurnBySpeed({ battle, actorUserId: "U1" });
  assert.equal(second.nextActorUserId, "U2");
  assert.equal(second.extraTurn, false);
});

test("núcleo compartilhado inicia batalha após seleção dos dois jogadores", () => {
  const battle = createBattle({
    channelId: "C1",
    challengerId: "U1",
    challengedId: "U2",
    platform: "slack",
  });

  acceptInvite(battle);
  assignSelectedPokemon(battle, "U1", mockPokemon({ id: 1, speciesId: 25, name: "Pikachu" }));
  advanceSelectionState(battle);
  assignSelectedPokemon(battle, "U2", mockPokemon({ id: 2, speciesId: 4, name: "Charmander" }));
  advanceSelectionState(battle);

  const { battle: startedBattle, starter } = startBattle(battle);

  assert.equal(startedBattle.status, "active");
  assert.equal(startedBattle.round, 1);
  assert.ok(["U1", "U2"].includes(starter));
  assert.equal(startedBattle.players.U1.selectedPokemon.name, "Pikachu");
  assert.equal(startedBattle.players.U2.selectedPokemon.name, "Charmander");
  assert.ok(startedBattle.initiative);
});

test("turn resolver compartilha ataque e finaliza batalha quando HP zera", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";
  battle.players.U2.battleHp.current = 5;

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.ATTACK,
  });

  assert.equal(resolution.outcome.ok, true);
  assert.equal(resolution.outcome.type, "attack");
  assert.equal(resolution.finished, true);
  assert.equal(resolution.finalized.winnerId, "U1");
  assert.equal(battle.status, "finished");
});

test("turn resolver mantém magia como placeholder compartilhado", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.MAGIC,
  });

  assert.equal(resolution.outcome.ok, false);
  assert.equal(resolution.outcome.reason, "not_implemented");
  assert.equal(resolution.shouldPassTurn, false);
  assert.equal(battle.status, "active");
});

function mockPokemon({ id, speciesId, name, speed = 12 }) {
  return {
    id,
    species_id: speciesId,
    level: 10,
    hp: 20,
    attack: 8,
    defense: 4,
    speed,
    pokemon_species: {
      name,
      sprite_url: null,
    },
  };
}

function createReadyBattle({ u1Speed = 12, u2Speed = 12 } = {}) {
  const battle = createBattle({
    channelId: "C-ready",
    challengerId: "U1",
    challengedId: "U2",
    platform: "slack",
  });

  acceptInvite(battle);
  assignSelectedPokemon(battle, "U1", mockPokemon({ id: 1, speciesId: 25, name: "Pikachu", speed: u1Speed }));
  advanceSelectionState(battle);
  assignSelectedPokemon(battle, "U2", mockPokemon({ id: 2, speciesId: 4, name: "Charmander", speed: u2Speed }));
  advanceSelectionState(battle);
  startBattle(battle);
  return battle;
}
