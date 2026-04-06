const test = require("node:test");
const assert = require("node:assert/strict");

const { dragonRules, gainImpetusStack, getImpetusStacks, clearImpetusByControl, DRAGON_SKILLS, DRAGON_IMPETUS_EFFECT_ID } = require("../application/battle/domain/dragonElementRules");
const { regenerateSkillEnergy } = require("../application/battle/domain/skillEnergy");

function createPlayer(userId, { elementTypes = ["dragon"] } = {}) {
  return {
    userId,
    stats: { magic: 200, attack: 120, speed: 100, elementalChance: 0.2 },
    battleHp: { max: 1000, current: 1000 },
    selectedPokemon: { elementTypes },
    elementalState: { statuses: [], effects: [], skillCooldowns: {} },
    skillEnergy: 0,
    skillEnergyMax: 200,
  };
}

test("Ímpeto Dracônico acumula até 3 stacks e aplica bônus", () => {
  const actor = createPlayer("U1");
  const logs = [];
  gainImpetusStack({ actor, actorId: "U1", logs });
  gainImpetusStack({ actor, actorId: "U1", logs });
  gainImpetusStack({ actor, actorId: "U1", logs });
  gainImpetusStack({ actor, actorId: "U1", logs });

  assert.equal(getImpetusStacks(actor), 3);
  const impetusState = actor.elementalState.effects.find((entry) => entry.id === DRAGON_IMPETUS_EFFECT_ID);
  assert.ok(impetusState);
  assert.equal(impetusState.outgoingAttackDamageMultiplier, 1.15);
  assert.ok(Math.abs(impetusState.outgoingMagicDamageMultiplier - 1.36) < 0.0001);
  assert.equal(impetusState.elementalEfficiencyBonusPct, 24);
  assert.equal(impetusState.energyRegenMultiplier, 1.2);
  assert.ok(logs.some((entry) => entry.includes("Ímpeto no máximo")));
});

test("Controle remove stacks de Ímpeto", () => {
  const actor = createPlayer("U1");
  actor.skillEnergy = 100;
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });

  const logs = [];
  clearImpetusByControl({ actor, actorId: "U1", logs });

  assert.equal(getImpetusStacks(actor), 0);
  assert.ok(logs.some((entry) => entry.includes("removido por controle")));
});

test("Sopro Ancestral aplica Exaustão e Ruptura com 3 stacks", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2", { elementTypes: ["water"] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });

  const cast = dragonRules.skills.find((entry) => entry.id === DRAGON_SKILLS.ANCESTRAL_BREATH)
    .cast({ actor, defender, actorId: "U1", defenderId: "U2" });

  assert.equal(cast.ok, true);
  assert.ok(cast.damageDealt > 0);
  assert.ok(defender.elementalState.effects.some((entry) => entry.id === "exhaustion"));
  assert.ok(defender.elementalState.effects.some((entry) => entry.id === "dragonic_rupture"));
});

test("Reativação do Sopro causa dano verdadeiro e consome Ímpeto", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2");
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });

  const skill = dragonRules.skills.find((entry) => entry.id === DRAGON_SKILLS.ANCESTRAL_BREATH);
  skill.cast({ actor, defender, actorId: "U1", defenderId: "U2" });
  const beforeHp = defender.battleHp.current;
  const recast = skill.cast({ actor, defender, actorId: "U1", defenderId: "U2" });

  assert.equal(recast.damageType, "true");
  assert.ok(recast.damageDealt > 0);
  assert.equal(getImpetusStacks(actor), 0);
  assert.equal(defender.battleHp.current, beforeHp - recast.damageDealt);
});

test("Exaustão e bônus de Ímpeto afetam geração de energia", () => {
  const actor = createPlayer("U1");
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });

  const defender = createPlayer("U2");
  defender.skillEnergy = 100;
  defender.elementalState.effects.push({ id: "exhaustion", remainingRounds: 2, energyRegenMultiplier: 0.65 });

  const actorRegen = regenerateSkillEnergy(actor, null);
  const defenderRegen = regenerateSkillEnergy(defender, null);
  assert.equal(actorRegen, 30);
  assert.equal(defenderRegen, 16);
});


test("Presença Ancestral aplica aura inimiga, burn de fogo e redução extra", () => {
  const actor = createPlayer("U1");
  const defender = createPlayer("U2", { elementTypes: ["grass"] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  gainImpetusStack({ actor, actorId: "U1", logs: [] });
  actor.elementalState.skillCooldowns = { dragon_ancestral_breath: 4 };

  const presenceSkill = dragonRules.skills.find((entry) => entry.id === DRAGON_SKILLS.ANCESTRAL_PRESENCE);
  const cast = presenceSkill.cast({ actor, actorId: "U1" });
  assert.equal(cast.ok, true);

  const logs = dragonRules.hooks.endOfRound({ battle: { players: { U1: actor, U2: defender } } });
  assert.ok(defender.elementalState.effects.some((entry) => String(entry.id).startsWith("ancestral_presence_enemy_aura")));
  assert.ok(logs.some((entry) => entry.includes("Burn ancestral")));
  assert.equal(actor.elementalState.skillCooldowns.dragon_ancestral_breath, 3);
});
