const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveSkillTargets, applyDamageToTargetRef } = require("../application/battle/domain/targetingEngine");
const { createBattle, assignSelectedPokemonTeam, acceptInvite, advanceSelectionState, startBattle } = require("../application/battle/domain/battleState");

function mockPokemon(id, name) {
  return {
    id,
    species_id: id,
    level: 50,
    hp: 50,
    current_hp: 50,
    attack: 20,
    magic: 20,
    defense: 10,
    speed: 10,
    pokemon_species: { name, sprite_url: null, element_types: ["electric"] },
    magicSlots: [],
  };
}

function createBattle3v3() {
  const battle = createBattle({ channelId: "C1", challengerId: "U1", challengedId: "U2", platform: "slack" });
  acceptInvite(battle);
  assignSelectedPokemonTeam(battle, "U1", [mockPokemon(1, "A1"), mockPokemon(2, "A2"), mockPokemon(3, "A3")]);
  advanceSelectionState(battle);
  assignSelectedPokemonTeam(battle, "U2", [mockPokemon(4, "B1"), mockPokemon(5, "B2"), mockPokemon(6, "B3")]);
  advanceSelectionState(battle);
  startBattle(battle);
  return battle;
}

test("resolveSkillTargets inclui bench quando skill permite chain", () => {
  const battle = createBattle3v3();
  const targets = resolveSkillTargets({
    battle,
    actorId: "U1",
    primaryDefenderId: "U2",
    targeting: { mode: "chain", maxTargets: 3, includeBench: true, allowSecondaryOutsideActive: true },
  });

  assert.equal(targets.length, 3);
  assert.equal(targets[0].isActive, true);
  assert.equal(targets.some((entry) => entry.isActive === false), true);
});

test("applyDamageToTargetRef aplica dano em alvo de bench sem trocar ativo", () => {
  const battle = createBattle3v3();
  const bench = resolveSkillTargets({
    battle,
    actorId: "U1",
    primaryDefenderId: "U2",
    targeting: { mode: "chain", maxTargets: 3, includeBench: true, allowSecondaryOutsideActive: true },
  })[1];
  const beforeActive = battle.players.U2.battleHp.current;
  const result = applyDamageToTargetRef(battle, bench, 100);
  assert.equal(result.damageApplied, 100);
  assert.equal(battle.players.U2.battleHp.current, beforeActive);
});
