const { MAGIC_ENERGY_COST } = require("./battleEngine");
const { resolveMagicActionEntry, getElementalSkillCooldown } = require("./elementalEngine");

function canUseSkillAction(combat, actor, skill, target) {
  if (!combat || !actor) return { ok: false, reason: "INVALID_CONTEXT", consumeTurn: false, consumeEnergy: false };
  if (!skill) return { ok: false, reason: "SKILL_NOT_EQUIPPED", consumeTurn: false, consumeEnergy: false };

  if (skill.kind === "regular") {
    const blockedOwnTurnsRemaining = Math.max(0, Number(actor?.magicCooldown?.blockedOwnTurnsRemaining || 0));
    if (blockedOwnTurnsRemaining > 0) {
      return { ok: false, reason: "COOLDOWN", consumeTurn: false, consumeEnergy: false };
    }
  }

  if (skill.kind === "elemental") {
    const cooldown = getElementalSkillCooldown(actor, skill.id);
    if (cooldown > 0) {
      return { ok: false, reason: "COOLDOWN", consumeTurn: false, consumeEnergy: false };
    }
  }

  const requiredEnergy = MAGIC_ENERGY_COST + Math.max(0, Number(skill?.extraEnergyCost || 0));
  const currentEnergy = Math.max(0, Number(actor?.skillEnergy || 0));
  if (currentEnergy < requiredEnergy) {
    return { ok: false, reason: "INSUFFICIENT_ENERGY", consumeTurn: false, consumeEnergy: false };
  }

  return { ok: true, consumeTurn: true, consumeEnergy: true, requiredEnergy };
}

function validateSkillActionRequest({ battle, actorUserId, magicSlot, targetUserId = null }) {
  const actor = battle?.players?.[actorUserId];
  const skill = resolveMagicActionEntry(actor, magicSlot);
  return canUseSkillAction(battle, actor, skill, { actorUserId, targetUserId });
}

module.exports = {
  canUseSkillAction,
  validateSkillActionRequest,
};
