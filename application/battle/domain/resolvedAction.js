const ACTION_ICONS = {
  attack: "⚔️",
  magic: "✨",
  potion: "🧪",
  switch: "🔁",
};

function sanitizeResolvedAction(action = {}) {
  if (!action || typeof action !== "object") return null;
  return {
    actorId: action.actorId || null,
    actorName: action.actorName || null,
    targetId: action.targetId || null,
    targetName: action.targetName || null,
    actionType: action.actionType || "unknown",
    actionName: action.actionName || "Ação",
    didHit: Boolean(action.didHit),
    isCrit: Boolean(action.isCrit),
    critBonusDamage: Math.max(0, Number(action.critBonusDamage) || 0),
    baseDamage: Math.max(0, Number(action.baseDamage) || 0),
    finalDamage: Math.max(0, Number(action.finalDamage) || 0),
    statusDamage: Math.max(0, Number(action.statusDamage) || 0),
    healingDone: Math.max(0, Number(action.healingDone) || 0),
    shieldAbsorbedDamage: Math.max(0, Number(action.shieldAbsorbedDamage) || 0),
    elementalMultiplier: Math.max(0, Number(action.elementalMultiplier) || 0),
    elementalRelation: action.elementalRelation || "neutral",
    dodged: Boolean(action.dodged),
    appliedEffects: Array.isArray(action.appliedEffects) ? action.appliedEffects.filter(Boolean) : [],
    activeBuffs: Array.isArray(action.activeBuffs) ? action.activeBuffs.filter(Boolean) : [],
    activeDebuffs: Array.isArray(action.activeDebuffs) ? action.activeDebuffs.filter(Boolean) : [],
    activeBuffDetails: Array.isArray(action.activeBuffDetails) ? action.activeBuffDetails.filter(Boolean) : [],
    activeDebuffDetails: Array.isArray(action.activeDebuffDetails) ? action.activeDebuffDetails.filter(Boolean) : [],
    actorCurrentHp: Math.max(0, Number(action.actorCurrentHp) || 0),
    actorMaxHp: Math.max(0, Number(action.actorMaxHp) || 0),
    actorCurrentShield: Math.max(0, Number(action.actorCurrentShield) || 0),
    targetCurrentShield: Math.max(0, Number(action.targetCurrentShield) || 0),
    blockedReason: action.blockedReason || null,
    damageBreakdown: Array.isArray(action.damageBreakdown) ? action.damageBreakdown : [],
    extraNotes: Array.isArray(action.extraNotes) ? action.extraNotes.filter(Boolean) : [],
  };
}

function buildActionSummaryFromResolvedAction(resolvedAction, fallback = {}) {
  const normalized = sanitizeResolvedAction(resolvedAction);
  if (!normalized) return null;
  const actionType = normalized.actionType || fallback.actionType || "unknown";

  return {
    kind: "action_summary",
    actorUserId: normalized.actorId || fallback.actorUserId || null,
    actorId: normalized.actorId || fallback.actorUserId || null,
    actorName: normalized.actorName || fallback.actorName || null,
    targetId: normalized.targetId || fallback.targetId || null,
    targetName: normalized.targetName || fallback.targetName || null,
    actionType,
    actionName: normalized.actionName || fallback.skillName || "Ação",
    skillName: normalized.actionName || fallback.skillName || "Ação",
    skillIcon: fallback.skillIcon || ACTION_ICONS[actionType] || "✨",
    didHit: normalized.didHit,
    isCrit: normalized.isCrit,
    critical: normalized.isCrit,
    critBonusDamage: normalized.critBonusDamage,
    baseDamage: normalized.baseDamage,
    finalDamage: normalized.finalDamage,
    statusDamage: normalized.statusDamage,
    healingDone: normalized.healingDone,
    shieldAbsorbedDamage: normalized.shieldAbsorbedDamage,
    elementalMultiplier: normalized.elementalMultiplier,
    elementalRelation: normalized.elementalRelation,
    dodged: normalized.dodged,
    appliedEffects: normalized.appliedEffects,
    activeBuffs: normalized.activeBuffs,
    activeDebuffs: normalized.activeDebuffs,
    activeBuffDetails: normalized.activeBuffDetails,
    activeDebuffDetails: normalized.activeDebuffDetails,
    actorCurrentHp: normalized.actorCurrentHp,
    actorMaxHp: normalized.actorMaxHp,
    actorCurrentShield: normalized.actorCurrentShield,
    targetCurrentShield: normalized.targetCurrentShield,
    blockedReason: normalized.blockedReason,
    damageBreakdown: normalized.damageBreakdown,
    extraNotes: normalized.extraNotes,
    modifiers: Array.isArray(fallback.modifiers) ? fallback.modifiers.filter(Boolean) : [],
    extraDamage: fallback.extraDamage,
  };
}

module.exports = {
  ACTION_ICONS,
  sanitizeResolvedAction,
  buildActionSummaryFromResolvedAction,
};
