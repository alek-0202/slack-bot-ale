const test = require("node:test");
const assert = require("node:assert/strict");

const { canUseSkillAction } = require("../application/battle/domain/skillActionValidator");

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
