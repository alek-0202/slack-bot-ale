const { resolveElementalRelation } = require("../../../services/pokemonElementsService");
const ELEMENTAL_COUNTER_REDUCTION_MULTIPLIER = 0.3;
const ELEMENTAL_ADVANTAGE_MULTIPLIER = 2;

function normalizeDamageElement(rawElement) {
  if (!rawElement) return null;
  const normalized = String(rawElement).trim().toLowerCase();
  if (!normalized || normalized === "physical" || normalized === "true") return null;
  return normalized;
}

function resolveElementalDamageAdjustment({ baseDamage, attackElement, defenderElements = [] }) {
  const safeBaseDamage = Math.max(0, Number(baseDamage || 0));
  const normalizedElement = normalizeDamageElement(attackElement);
  if (!normalizedElement || safeBaseDamage <= 0) {
    return {
      adjustedDamage: safeBaseDamage,
      addedDamage: 0,
      multiplier: 1,
      relation: "neutral",
      element: normalizedElement,
      hasElementalAdjustment: false,
    };
  }
  const relation = resolveElementalRelation({
    attackElement: normalizedElement,
    defenderElements,
  });
  const multiplier = relation.hasAdvantage
    ? ELEMENTAL_ADVANTAGE_MULTIPLIER
    : relation.hasDisadvantage
      ? ELEMENTAL_COUNTER_REDUCTION_MULTIPLIER
      : 1;
  const adjustedDamage = Math.max(0, Math.round(safeBaseDamage * multiplier));
  return {
    adjustedDamage,
    addedDamage: adjustedDamage - safeBaseDamage,
    multiplier,
    relation: relation?.relation || "neutral",
    element: normalizedElement,
    hasElementalAdjustment: multiplier !== 1,
  };
}

function createDamageBreakdownEntry({
  sourceKind,
  sourceName,
  baseDamage = 0,
  damageType = null,
  finalDamage = 0,
  multiplier = 1,
  relation = "neutral",
  metadata = {},
}) {
  return {
    sourceKind: sourceKind || "unknown",
    sourceName: sourceName || "Dano",
    baseDamage: Math.max(0, Number(baseDamage || 0)),
    finalDamage: Math.max(0, Number(finalDamage || 0)),
    addedDamage: Math.max(0, Number(finalDamage || 0) - Number(baseDamage || 0)),
    multiplier: Math.max(0, Number(multiplier || 1)),
    relation: relation || "neutral",
    damageType: damageType || null,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
}

function buildDamagePacket({
  sourceKind = "unknown",
  sourceName = "Dano",
  origin = null,
  damageType = null,
  attackElement = null,
  baseAmount = 0,
  modifiers = [],
  crit = null,
  defenderElements = [],
  applyElemental = true,
  metadata = {},
}) {
  const base = Math.max(0, Number(baseAmount || 0));
  const normalizedModifiers = Array.isArray(modifiers) ? modifiers : [];
  const modifierMultiplier = normalizedModifiers
    .reduce((acc, entry) => acc * Math.max(0, Number(entry?.multiplier ?? 1)), 1);
  const beforeElemental = Math.max(0, Math.round(base * modifierMultiplier));
  const elemental = applyElemental
    ? resolveElementalDamageAdjustment({ baseDamage: beforeElemental, attackElement, defenderElements })
    : {
      adjustedDamage: beforeElemental,
      multiplier: 1,
      relation: "neutral",
      element: normalizeDamageElement(attackElement),
      hasElementalAdjustment: false,
    };
  const finalAmount = Math.max(0, Number(elemental.adjustedDamage || 0));
  return {
    origin,
    sourceKind,
    sourceName,
    damageType: damageType || elemental.element || null,
    attackElement: elemental.element || null,
    baseAmount: base,
    modifiers: normalizedModifiers,
    crit: crit && typeof crit === "object" ? crit : null,
    elemental,
    finalAmount,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    breakdown: createDamageBreakdownEntry({
      sourceKind,
      sourceName,
      baseDamage: base,
      finalDamage: finalAmount,
      multiplier: Number(elemental.multiplier || 1),
      relation: elemental.relation || "neutral",
      damageType: damageType || elemental.element || null,
      metadata: {
        origin: origin || null,
        modifiers: normalizedModifiers,
        crit: crit && typeof crit === "object" ? crit : null,
        ...((metadata && typeof metadata === "object") ? metadata : {}),
      },
    }),
  };
}

function applyHpDamage({ target, amount = 0 }) {
  const damageApplied = Math.max(0, Math.round(Number(amount || 0)));
  if (!target?.battleHp) {
    return { damageApplied: 0, remainingHp: 0 };
  }
  target.battleHp.current = Math.max(0, Number(target.battleHp.current || 0) - damageApplied);
  return {
    damageApplied,
    remainingHp: Math.max(0, Number(target.battleHp.current || 0)),
  };
}

module.exports = {
  normalizeDamageElement,
  resolveElementalDamageAdjustment,
  createDamageBreakdownEntry,
  buildDamagePacket,
  applyHpDamage,
};
