const { resolveAttackTurn, resolvePotionTurn } = require("./battleEngine");
const { BATTLE_ACTION } = require("./actionResolver");
const { getOpponentId, passTurn, finishBattle } = require("./battleState");

function resolveBattleTurn({ battle, actorUserId, actionType }) {
  if (actionType === BATTLE_ACTION.MAGIC) {
    return {
      battle,
      actionType,
      outcome: {
        ok: false,
        reason: "not_implemented",
      },
      finished: false,
      shouldPassTurn: false,
    };
  }

  if (actionType === BATTLE_ACTION.ATTACK) {
    const attacker = battle.players[actorUserId];
    const defenderId = getOpponentId(battle, actorUserId);
    const defender = battle.players[defenderId];
    const result = resolveAttackTurn({ attacker, defender });

    if (defender.battleHp.current <= 0) {
      const finalized = finishBattle(battle, actorUserId);
      return {
        battle,
        actionType,
        outcome: {
          ok: true,
          type: "attack",
          actorUserId,
          defenderId,
          ...result,
        },
        finished: true,
        finalized,
      };
    }

    const turnFlow = passTurn(battle, actorUserId);
    return {
      battle,
      actionType,
      outcome: {
        ok: true,
        type: "attack",
        actorUserId,
        defenderId,
        ...result,
        turnFlow,
      },
      finished: false,
      shouldPassTurn: true,
    };
  }

  const player = battle.players[actorUserId];
  const result = resolvePotionTurn(player);

  if (!result.ok) {
    return {
      battle,
      actionType,
      outcome: {
        ...result,
        type: "potion",
        actorUserId,
      },
      finished: false,
      shouldPassTurn: false,
    };
  }

  const turnFlow = passTurn(battle, actorUserId);
  return {
    battle,
    actionType,
    outcome: {
      ...result,
      ok: true,
      type: "potion",
      actorUserId,
      turnFlow,
    },
    finished: false,
    shouldPassTurn: true,
  };
}

module.exports = {
  resolveBattleTurn,
};
