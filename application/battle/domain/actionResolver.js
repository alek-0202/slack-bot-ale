const { BATTLE_STATUS, getExpectedPickerId } = require("./battleState");

const BATTLE_ACTION = {
  ATTACK: "attack",
  DEFENSE: "defense",
  POTION: "potion",
  MAGIC: "magic",
};

function validateInviteDecision({ battle, actorUserId }) {
  if (!battle || battle.status !== BATTLE_STATUS.PENDING) {
    return { ok: false, reason: "battle_not_pending" };
  }

  if (actorUserId !== battle.challengedId) {
    return { ok: false, reason: "only_challenged_can_decide" };
  }

  return { ok: true };
}

function validateSelection({ battle, actorUserId }) {
  if (!battle) {
    return { ok: false, reason: "battle_not_found" };
  }

  if (battle.status !== BATTLE_STATUS.SELECTING) {
    return { ok: false, reason: "selection_not_active" };
  }

  if (![battle.challengerId, battle.challengedId].includes(actorUserId)) {
    return { ok: false, reason: "actor_not_in_battle" };
  }

  const expectedUserId = getExpectedPickerId(battle);
  if (actorUserId !== expectedUserId) {
    return { ok: false, reason: "not_selection_turn", expectedUserId };
  }

  return { ok: true };
}

function validateTurnAction({ battle, actorUserId, actionType }) {
  if (!battle) {
    return { ok: false, reason: "battle_not_found" };
  }

  if (battle.status !== BATTLE_STATUS.ACTIVE) {
    return { ok: false, reason: "battle_not_active" };
  }

  if (![battle.challengerId, battle.challengedId].includes(actorUserId)) {
    return { ok: false, reason: "actor_not_in_battle" };
  }

  if (actorUserId !== battle.currentTurnUserId) {
    return { ok: false, reason: "not_actor_turn", currentTurnUserId: battle.currentTurnUserId };
  }

  if (!Object.values(BATTLE_ACTION).includes(actionType)) {
    return { ok: false, reason: "unsupported_action" };
  }

  return { ok: true };
}

module.exports = {
  BATTLE_ACTION,
  validateInviteDecision,
  validateSelection,
  validateTurnAction,
};
