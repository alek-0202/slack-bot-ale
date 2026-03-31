const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateBattleHp,
  calculateDamage,
  calculateMagicDamage,
  resolvePotionTurn,
  decideStartingPlayer,
  createInitialInitiativeState,
  resolveNextTurnBySpeed,
  MAGIC_ENERGY_COST,
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
  const originalRandom = Math.random;
  Math.random = () => 0.1;
  try {
    const result = calculateDamage({
      attackerAttack: 10,
      defenderDefense: 5,
      attackerCritChance: 1,
      varianceRoll: 1,
    });

    assert.equal(result.isCritical, true);
    assert.equal(result.normalDamage, 8);
    assert.equal(result.finalDamage, 13);
    assert.equal(result.dodged, false);
  } finally {
    Math.random = originalRandom;
  }
});

test("calculateMagicDamage aplica vantagem elemental com crítico garantido", () => {
  const result = calculateMagicDamage({
    attackerAttack: 10,
    attackerMagic: 14,
    magicElement: "electric",
    defenderElements: ["water"],
    d12Roll: 7,
    d6Roll: 2,
  });

  assert.equal(result.isCritical, true);
  assert.equal(result.baseStatUsed, "magic");
  assert.equal(result.multiplier, 2.0);
  assert.equal(result.finalDamage, 50);
});

test("calculateMagicDamage aplica fallback para attack e desvantagem elemental", () => {
  const result = calculateMagicDamage({
    attackerAttack: 10,
    magicElement: "fire",
    defenderElements: ["water"],
    d12Roll: 6,
    d6Roll: 4,
  });

  assert.equal(result.isCritical, false);
  assert.equal(result.baseStatUsed, "attack");
  assert.equal(result.multiplier, 0.3);
  assert.equal(result.finalDamage, 7);
});

test("calculateDamage respeita esquiva e zera o dano quando ativada", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.01;
  try {
    const result = calculateDamage({
      attackerAttack: 100,
      defenderDefense: 1,
      defenderDodgeChance: 0.18,
      varianceRoll: 1,
    });

    assert.equal(result.finalDamage, 0);
    assert.equal(result.dodged, true);
  } finally {
    Math.random = originalRandom;
  }
});

test("ataque básico usa chance crítica direta do pokémon (40 => 40%)", () => {
  const battle = createBattle({
    battleId: "B1",
    channelId: "C1",
    challengerId: "U1",
    challengedId: "U2",
  });
  acceptInvite(battle);
  assignSelectedPokemon(battle, "U1", {
    id: 1,
    species_id: 1,
    level: 20,
    attack: 60,
    magic: 30,
    defense: 20,
    hp: 100,
    speed: 30,
    crit_level: 0,
    crit_chance: 40,
    dodge_level: 0,
    elemental_level: 0,
    pokemon_species: { id: 1, name: "Pikachu", element_types: ["electric"] },
  });
  assignSelectedPokemon(battle, "U2", {
    id: 2,
    species_id: 2,
    level: 20,
    attack: 40,
    magic: 20,
    defense: 20,
    hp: 100,
    speed: 20,
    crit_level: 0,
    dodge_level: 0,
    elemental_level: 0,
    pokemon_species: { id: 2, name: "Bulbasaur", element_types: ["grass"] },
  });
  advanceSelectionState(battle);
  advanceSelectionState(battle);
  startBattle(battle);
  battle.currentTurnUserId = "U1";
  assert.equal(battle.players.U1.stats.critChance, 0.4);

  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => {
    calls += 1;
    if (calls === 1) return 0.8; // variância
    if (calls === 2) return 0.9; // esquiva não ativa
    if (calls === 3) return 0.2; // crítico (0.2 < 0.4)
    return 0.5;
  };
  try {
    const result = resolveBattleTurn({ battle, actorUserId: "U1", actionType: BATTLE_ACTION.ATTACK });
    assert.equal(result.outcome.isCritical, true);
    assert.equal(result.outcome.resolvedAction.isCrit, true);
    assert.ok(result.outcome.finalDamage > result.outcome.normalDamage);
  } finally {
    Math.random = originalRandom;
  }
});

test("ataque básico aplica vantagem elemental no dano final", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";
  battle.players.U1.selectedPokemon.elementTypes = ["electric"];
  battle.players.U2.selectedPokemon.elementTypes = ["water"];

  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => {
    calls += 1;
    if (calls === 1) return 0.5; // variância
    if (calls === 2) return 0.9; // esquiva falha
    if (calls === 3) return 0.9; // sem crítico
    return 0.5;
  };
  try {
    const result = resolveBattleTurn({ battle, actorUserId: "U1", actionType: BATTLE_ACTION.ATTACK });
    assert.equal(result.outcome.ok, true);
    assert.equal(result.outcome.elemental.elemental.relation, "advantage");
    assert.equal(result.outcome.resolvedAction.elementalRelation, "advantage");
    assert.ok(result.outcome.finalDamage > result.outcome.normalDamage);
  } finally {
    Math.random = originalRandom;
  }
});

test("ataque básico aplica desvantagem elemental no dano final", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";
  battle.players.U1.selectedPokemon.elementTypes = ["fire"];
  battle.players.U2.selectedPokemon.elementTypes = ["water"];

  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => {
    calls += 1;
    if (calls === 1) return 0.5; // variância
    if (calls === 2) return 0.9; // esquiva falha
    if (calls === 3) return 0.9; // sem crítico
    return 0.5;
  };
  try {
    const result = resolveBattleTurn({ battle, actorUserId: "U1", actionType: BATTLE_ACTION.ATTACK });
    assert.equal(result.outcome.ok, true);
    assert.equal(result.outcome.elemental.elemental.relation, "disadvantage");
    assert.equal(result.outcome.resolvedAction.elementalRelation, "disadvantage");
    assert.ok(result.outcome.finalDamage < result.outcome.normalDamage);
  } finally {
    Math.random = originalRandom;
  }
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

test("energia da magia reduz iniciativa adicionalmente", () => {
  const battle = createReadyBattle({ u1Speed: 15, u2Speed: 10 });
  battle.initiative = createInitialInitiativeState({ challengerId: "U1", challengedId: "U2", starter: "U1" });

  const comparisonBattle = createReadyBattle({ u1Speed: 15, u2Speed: 10 });
  comparisonBattle.initiative = createInitialInitiativeState({ challengerId: "U1", challengedId: "U2", starter: "U1" });
  const withoutPenalty = resolveNextTurnBySpeed({
    battle: comparisonBattle,
    actorUserId: "U1",
  });
  const flow = resolveNextTurnBySpeed({ battle, actorUserId: "U1", energyPenalty: MAGIC_ENERGY_COST });
  assert.equal(flow.energyPenalty, MAGIC_ENERGY_COST);
  assert.ok(flow.ticks >= withoutPenalty.ticks);
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

test("turn resolver executa magia com slot registrado", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot: 1 },
  });

  assert.equal(resolution.outcome.ok, true);
  assert.equal(resolution.outcome.type, "magic");
  assert.equal(resolution.outcome.magicEntry.name, "Magia de Electric");
  assert.equal(resolution.outcome.energyConsumed, MAGIC_ENERGY_COST);
  assert.equal(battle.players.U1.magicCooldown.blockedOwnTurnsRemaining, 2);
  assert.equal(resolution.shouldPassTurn, true);
});

test("cooldown de magia bloqueia as próximas duas ações do próprio jogador", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";

  const firstMagic = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot: 1 },
  });
  assert.equal(firstMagic.outcome.ok, true);

  const blockedNow = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot: 1 },
  });
  assert.equal(blockedNow.outcome.reason, "magic_on_cooldown");
  assert.equal(blockedNow.outcome.blockedOwnTurnsRemaining, 2);

  resolveBattleTurn({ battle, actorUserId: battle.currentTurnUserId, actionType: BATTLE_ACTION.ATTACK });
  battle.currentTurnUserId = "U1";
  resolveBattleTurn({ battle, actorUserId: "U1", actionType: BATTLE_ACTION.ATTACK });

  const blockedSecondOwnTurn = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot: 1 },
  });
  assert.equal(blockedSecondOwnTurn.outcome.reason, "magic_on_cooldown");
  assert.equal(blockedSecondOwnTurn.outcome.blockedOwnTurnsRemaining, 1);

  resolveBattleTurn({ battle, actorUserId: "U1", actionType: BATTLE_ACTION.ATTACK });
  battle.currentTurnUserId = "U1";

  const availableAgain = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot: 1 },
  });
  assert.equal(availableAgain.outcome.ok, true);
});

test("turn resolver troca Pokémon e consome o turno", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";
  battle.players.U1.team.push({
    ...battle.players.U1.team[0],
    id: 99,
    name: "Raichu",
    battleHp: { ...battle.players.U1.team[0].battleHp, current: 10 },
  });

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.SWITCH,
    actionPayload: { pokemonId: 99 },
  });

  assert.equal(resolution.outcome.ok, true);
  assert.equal(resolution.outcome.type, "switch");
  assert.equal(battle.players.U1.selectedPokemon.id, 99);
  assert.equal(resolution.shouldPassTurn, true);
  assert.equal(battle.status, "active");
});

function mockPokemon({ id, speciesId, name, speed = 12, elementTypes = ["electric"] }) {
  return {
    id,
    species_id: speciesId,
    level: 10,
    hp: 20,
    attack: 8,
    magic: 11,
    defense: 4,
    speed,
    magicSlots: [{ slot: 1, name: `Magia de ${elementTypes[0][0].toUpperCase()}${elementTypes[0].slice(1)}`, element: elementTypes[0], icon: "✦" }],
    pokemon_species: {
      name,
      sprite_url: null,
      element_types: elementTypes,
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
  assignSelectedPokemon(battle, "U1", mockPokemon({ id: 1, speciesId: 25, name: "Pikachu", speed: u1Speed, elementTypes: ["electric"] }));
  advanceSelectionState(battle);
  assignSelectedPokemon(battle, "U2", mockPokemon({ id: 2, speciesId: 4, name: "Charmander", speed: u2Speed, elementTypes: ["water"] }));
  advanceSelectionState(battle);
  startBattle(battle);
  return battle;
}





test("skill elemental fica indisponível quando feature flag está desligada", () => {
  const battle = createReadyBattle();
  battle.currentTurnUserId = "U1";
  battle.players.U1.selectedPokemon.elementTypes = ["fire"];
  battle.players.U1.selectedPokemon.level = 50;
  battle.players.U1.characteristicSlots = [{
    kind: "characteristic",
    id: "fire_burning_claws",
    name: "Garras Ardentes",
    element: "fire",
    icon: "🔥",
    extraEnergyCost: 0,
  }];

  const resolution = resolveBattleTurn({
    battle,
    actorUserId: "U1",
    actionType: BATTLE_ACTION.MAGIC,
    actionPayload: { magicSlot: "elemental:fire_burning_claws" },
  });

  assert.equal(resolution.outcome.ok, false);
  assert.equal(resolution.outcome.reason, "magic_not_found");
  assert.equal(battle.currentTurnUserId, "U1");
});
