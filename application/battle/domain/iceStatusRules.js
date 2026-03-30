const { addOrRefreshEffect, getStatus, upsertStatus, ensureElementalState } = require("./elementalRules");

const ICE_STATUS_GELID = "ice_gelid";
const ICE_EFFECT_FROZEN = "ice_frozen";
const ICE_EFFECT_BREAK = "ice_break";
const ICE_EFFECT_GELID_SLOW = "ice_gelid_slow";

function applyGelidStacks(target, stacks = 1, sourceUserId = null) {
  const amount = Math.max(1, Number(stacks || 1));
  const current = getStatus(target, ICE_STATUS_GELID);
  const nextStacks = Math.min(3, Math.max(0, Number(current?.stacks || 0) + amount));

  if (nextStacks >= 3) {
    upsertStatus(target, {
      id: ICE_STATUS_GELID,
      name: "Gélido",
      element: "ice",
      stacks: 0,
      maxStacks: 3,
      sourceUserId,
      remainingRounds: 0,
    });
    addOrRefreshEffect(target, {
      id: ICE_EFFECT_FROZEN,
      name: "Congelado",
      element: "ice",
      remainingRounds: 1,
      forcedSkipAction: true,
      consumeOnActionStart: true,
    });
    addOrRefreshEffect(target, {
      id: ICE_EFFECT_GELID_SLOW,
      name: "Gélido (Lentidão)",
      element: "ice",
      remainingRounds: 0,
      speedMultiplier: 1,
    });
    return { promotedToFrozen: true, stacks: 0 };
  }

  upsertStatus(target, {
    id: ICE_STATUS_GELID,
    name: "Gélido",
    element: "ice",
    stacks: nextStacks,
    maxStacks: 3,
    sourceUserId,
    remainingRounds: 3,
  });
  addOrRefreshEffect(target, {
    id: ICE_EFFECT_GELID_SLOW,
    name: "Gélido (Lentidão)",
    element: "ice",
    remainingRounds: 3,
    speedMultiplier: Math.max(0.4, 1 - (nextStacks * 0.2)),
  });
  return { promotedToFrozen: false, stacks: nextStacks };
}

function hasGelid(target) {
  const status = getStatus(target, ICE_STATUS_GELID);
  return Number(status?.stacks || 0) > 0;
}

function getGelidStacks(target) {
  return Math.max(0, Number(getStatus(target, ICE_STATUS_GELID)?.stacks || 0));
}

function hasFrozen(target) {
  return (ensureElementalState(target).effects || []).some((entry) => entry.id === ICE_EFFECT_FROZEN && Number(entry.remainingRounds ?? 1) > 0);
}

function consumeFrozen(target) {
  const effects = ensureElementalState(target).effects || [];
  const frozen = effects.find((entry) => entry.id === ICE_EFFECT_FROZEN);
  if (!frozen) return false;
  frozen.remainingRounds = 0;
  return true;
}

function applyBreak(target, sourceUserId) {
  return addOrRefreshEffect(target, {
    id: ICE_EFFECT_BREAK,
    name: "Quebra",
    element: "ice",
    sourceUserId,
    remainingRounds: 2,
    incomingDamageTakenMultiplier: 1.25,
  });
}

module.exports = {
  ICE_STATUS_GELID,
  ICE_EFFECT_FROZEN,
  ICE_EFFECT_BREAK,
  applyGelidStacks,
  hasGelid,
  getGelidStacks,
  hasFrozen,
  consumeFrozen,
  applyBreak,
};
