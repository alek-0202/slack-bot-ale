const test = require("node:test");
const assert = require("node:assert/strict");

const { canUseSkillAction } = require("../application/battle/domain/skillActionValidator");
const { getAvailableMagicActions } = require("../application/battle/domain/elementalRules");

function createActor() {
  return {
    skillEnergy: 200,
    skillEnergyMax: 200,
    elementalState: {
      statuses: [{ id: "dragon_impetus_stack", stacks: 1, remainingRounds: 2 }],
      effects: [
        { id: "dragon_ancestral_breath_recast", remainingRounds: 1 },
      ],
      skillCooldowns: { dragon_ancestral_breath: 5 },
    },
  };
}

test("Sopro Ancestral permite reativação mesmo em cooldown", () => {
  const actor = createActor();
  const result = canUseSkillAction({}, actor, { kind: "elemental", id: "dragon_ancestral_breath", extraEnergyCost: 0 }, null);
  assert.equal(result.ok, true);
});

test("Ímpeto Dracônico equipado não aparece como ação ativável", () => {
  const actor = createActor();
  actor.characteristicSlots = [
    { id: "dragon_draconic_impetus", kind: "characteristic", name: "Ímpeto Dracônico", isPassive: true, activationType: "passive", hiddenFromActionMenu: true },
    { id: "dragon_ancestral_breath", kind: "characteristic", name: "Sopro Ancestral" },
  ];

  const actions = getAvailableMagicActions(actor).filter((entry) => entry.kind === "elemental");
  assert.equal(actions.some((entry) => entry.id === "dragon_draconic_impetus"), false);
});
