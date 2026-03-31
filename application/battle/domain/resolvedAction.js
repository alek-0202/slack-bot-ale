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
    appliedEffects: Array.isArray(action.appliedEffects) ? action.appliedEffects.filter(Boolean) : [],
    activeBuffs: Array.isArray(action.activeBuffs) ? action.activeBuffs.filter(Boolean) : [],
    activeDebuffs: Array.isArray(action.activeDebuffs) ? action.activeDebuffs.filter(Boolean) : [],
    actorCurrentHp: Math.max(0, Number(action.actorCurrentHp) || 0),
    actorMaxHp: Math.max(0, Number(action.actorMaxHp) || 0),
    blockedReason: action.blockedReason || null,
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
    appliedEffects: normalized.appliedEffects,
    activeBuffs: normalized.activeBuffs,
    activeDebuffs: normalized.activeDebuffs,
    actorCurrentHp: normalized.actorCurrentHp,
    actorMaxHp: normalized.actorMaxHp,
    blockedReason: normalized.blockedReason,
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
