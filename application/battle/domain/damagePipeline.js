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

module.exports = {
  normalizeDamageElement,
  resolveElementalDamageAdjustment,
  createDamageBreakdownEntry,
};
