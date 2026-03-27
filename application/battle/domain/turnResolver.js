const { resolveAttackTurn, resolvePotionTurn, resolveMagicTurn } = require("./battleEngine");
const { BATTLE_ACTION } = require("./actionResolver");
const { getOpponentId, passTurn, finishBattle, autoSwitchToNextAlivePokemon, hasAnyAlivePokemon } = require("./battleState");

function resolveBattleTurn({ battle, actorUserId, actionType, actionPayload = {} }) {
  if (actionType === BATTLE_ACTION.MAGIC) {
    const attacker = battle.players[actorUserId];
    const defenderId = getOpponentId(battle, actorUserId);
    const defender = battle.players[defenderId];
    const blockedOwnTurnsRemaining = Math.max(0, Number(attacker?.magicCooldown?.blockedOwnTurnsRemaining) || 0);
    const magicEntry = (attacker.magicSlots || []).find((entry) => Number(entry.slot) === Number(actionPayload.magicSlot));

    if (blockedOwnTurnsRemaining > 0) {
      return {
        battle,
        actionType,
        outcome: {
          ok: false,
          reason: "magic_on_cooldown",
          type: "magic",
          blockedOwnTurnsRemaining,
          magicName: attacker?.magicCooldown?.lastMagicName || null,
        },
        finished: false,
        shouldPassTurn: false,
      };
    }

    if (!magicEntry) {
      return {
        battle,
        actionType,
        outcome: {
          ok: false,
          reason: "magic_not_found",
          type: "magic",
        },
        finished: false,
        shouldPassTurn: false,
      };
    }

    const result = resolveMagicTurn({ attacker, defender, magicEntry });
    attacker.magicCooldown = {
      blockedOwnTurnsRemaining: 2,
      lastAppliedAtRound: battle.round,
      lastMagicName: magicEntry.name || null,
    };

    if (defender.battleHp.current <= 0) {
      const switched = autoSwitchToNextAlivePokemon(defender);
      if (!switched || !hasAnyAlivePokemon(defender)) {
        const finalized = finishBattle(battle, actorUserId);
        return {
          battle,
          actionType,
          outcome: {
            ...result,
            type: "magic",
            actorUserId,
            defenderId,
          },
          finished: true,
          finalized,
        };
      }
    }

    const turnFlow = passTurn(battle, actorUserId, { energyPenalty: result.energyConsumed });
    return {
      battle,
      actionType,
      outcome: {
        ...result,
        type: "magic",
        actorUserId,
        defenderId,
        turnFlow,
      },
      finished: false,
      shouldPassTurn: true,
    };
  }

  if (actionType === BATTLE_ACTION.ATTACK) {
    const attacker = battle.players[actorUserId];
    const defenderId = getOpponentId(battle, actorUserId);
    const defender = battle.players[defenderId];
    const result = resolveAttackTurn({ attacker, defender });

    if (defender.battleHp.current <= 0) {
      const switched = autoSwitchToNextAlivePokemon(defender);
      if (!switched || !hasAnyAlivePokemon(defender)) {
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
