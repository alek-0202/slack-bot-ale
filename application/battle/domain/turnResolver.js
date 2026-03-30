const { resolveAttackTurn, resolvePotionTurn, resolveMagicTurn, MAGIC_ENERGY_COST } = require("./battleEngine");
const { BATTLE_ACTION } = require("./actionResolver");
const {
  getOpponentId,
  passTurn,
  finishBattle,
  autoSwitchToNextAlivePokemon,
  hasAnyAlivePokemon,
  switchActivePokemonById,
} = require("./battleState");
const {
  resolveMagicActionEntry,
  applyBeforeDamageHooks,
  applyOnHitHooks,
  runEndOfRound,
  runElementalSkillCast,
  getElementalSkillCooldown,
  resolveElementalDamageRule,
} = require("./elementalEngine");


function getBattleEnergyPool(battle) {
  battle.metadata = battle.metadata || {};
  battle.metadata.energyByUserId = battle.metadata.energyByUserId || {};
  return battle.metadata.energyByUserId;
}

function consumeBattleEnergy({ battle, userId, amount }) {
  const cost = Math.max(0, Number(amount) || 0);
  const energyByUserId = getBattleEnergyPool(battle);
  if (energyByUserId[userId] == null) return { ok: true, currentEnergy: Infinity, consumed: 0 };

  const current = Math.max(0, Number(energyByUserId[userId] || 0));
  if (current < cost) return { ok: false, currentEnergy: current, requiredEnergy: cost };
  energyByUserId[userId] = current - cost;
  return { ok: true, currentEnergy: energyByUserId[userId], consumed: cost };
}

function restoreBattleEnergy({ battle, userId, amount }) {
  const gain = Math.max(0, Number(amount) || 0);
  const energyByUserId = getBattleEnergyPool(battle);
  if (energyByUserId[userId] == null) return;
  energyByUserId[userId] = Math.max(0, Number(energyByUserId[userId] || 0) + gain);
}

function reduceAllElementalCooldowns(playerState, rounds = 0) {
  const value = Math.max(0, Number(rounds) || 0);
  if (!value || !playerState?.elementalState?.skillCooldowns) return;
  for (const key of Object.keys(playerState.elementalState.skillCooldowns)) {
    playerState.elementalState.skillCooldowns[key] = Math.max(0, Number(playerState.elementalState.skillCooldowns[key] || 0) - value);
  }
}

function mergeRoundLogs(battle, ...logs) {
  battle.metadata = battle.metadata || {};
  const current = Array.isArray(battle.metadata.turnLog) ? battle.metadata.turnLog : [];
  const merged = [...current, ...logs.flat().filter(Boolean)].slice(-12);
  battle.metadata.turnLog = merged;
}

function applyFinalDamageWithHooks({ battle, attackerId, defenderId, initialDamage }) {
  const before = applyBeforeDamageHooks({ battle, attackerId, defenderId, damage: initialDamage });
  const onHit = applyOnHitHooks({ battle, attackerId, defenderId, damage: before.finalDamage });
  const finalDamage = Math.max(0, Number(onHit.finalDamage || 0));
  battle.players[defenderId].battleHp.current = Math.max(0, battle.players[defenderId].battleHp.current - finalDamage);
  return {
    finalDamage,
    logs: [...before.logs, ...onHit.logs],
  };
}

function applyRoundEndAndCheck(battle, actorUserId) {
  const endRoundLogs = runEndOfRound({ battle });
  mergeRoundLogs(battle, endRoundLogs);

  const defeated = Object.entries(battle.players || {}).find(([userId, player]) => userId !== actorUserId && Number(player?.battleHp?.current || 0) <= 0);
  if (!defeated) return null;
  const [defenderId, defender] = defeated;
  const switched = autoSwitchToNextAlivePokemon(defender);
  if (!switched || !hasAnyAlivePokemon(defender)) {
    return finishBattle(battle, actorUserId);
  }
  return null;
}

function resolveBattleTurn({ battle, actorUserId, actionType, actionPayload = {} }) {
  if (actionType === BATTLE_ACTION.SWITCH) {
    const player = battle.players[actorUserId];
    const switched = switchActivePokemonById(player, actionPayload.pokemonId);

    if (!switched.ok) {
      return {
        battle,
        actionType,
        outcome: {
          ok: false,
          reason: switched.reason || "switch_failed",
          type: "switch",
          actorUserId,
        },
        finished: false,
        shouldPassTurn: false,
      };
    }

    mergeRoundLogs(battle, `🔁 <@${actorUserId}> trocou para ${player.selectedPokemon?.name || "novo Pokémon"}.`);
    const finalized = applyRoundEndAndCheck(battle, actorUserId);
    if (finalized) {
      return {
        battle,
        actionType,
        outcome: { ok: true, type: "switch", actorUserId },
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
        type: "switch",
        actorUserId,
        switchedPokemonId: player.selectedPokemon?.id || null,
        switchedPokemonName: player.selectedPokemon?.name || null,
        turnFlow,
      },
      finished: false,
      shouldPassTurn: true,
    };
  }

  if (actionType === BATTLE_ACTION.MAGIC) {
    const attacker = battle.players[actorUserId];
    const defenderId = getOpponentId(battle, actorUserId);
    const defender = battle.players[defenderId];
    const magicAction = resolveMagicActionEntry(attacker, actionPayload.magicSlot);

    if (!magicAction) {
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


    if (magicAction.kind === "elemental" && Number(attacker?.selectedPokemon?.level || 0) < 50) {
      return {
        battle,
        actionType,
        outcome: {
          ok: false,
          reason: "characteristic_skill_requires_level_50",
          type: "magic",
        },
        finished: false,
        shouldPassTurn: false,
      };
    }
    if (magicAction.kind === "regular") {
      const blockedOwnTurnsRemaining = Math.max(0, Number(attacker?.magicCooldown?.blockedOwnTurnsRemaining) || 0);
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

      const regularEnergyCheck = consumeBattleEnergy({ battle, userId: actorUserId, amount: MAGIC_ENERGY_COST });
      if (!regularEnergyCheck.ok) {
        return { battle, actionType, outcome: { ok: false, reason: "insufficient_skill_energy", type: "magic", requiredEnergy: MAGIC_ENERGY_COST, currentEnergy: regularEnergyCheck.currentEnergy }, finished: false, shouldPassTurn: false };
      }

      const slotNumber = Number(String(magicAction.slot).replace("magic:", ""));
      const regularMagic = (attacker.magicSlots || []).find((entry) => Number(entry.slot) === slotNumber);
      const result = resolveMagicTurn({ attacker, defender, magicEntry: regularMagic });
      defender.battleHp.current = Math.min(defender.battleHp.max, defender.battleHp.current + Number(result.finalDamage || 0));

      const damageWithHooks = applyFinalDamageWithHooks({
        battle,
        attackerId: actorUserId,
        defenderId,
        initialDamage: result.finalDamage,
      });

      attacker.magicCooldown = {
        blockedOwnTurnsRemaining: 2,
        lastAppliedAtRound: battle.round,
        lastMagicName: regularMagic?.name || null,
      };

      mergeRoundLogs(battle, damageWithHooks.logs, `✨ <@${actorUserId}> usou ${regularMagic?.name || "magia"} em <@${defenderId}>.`);

      const finalized = applyRoundEndAndCheck(battle, actorUserId);
      if (finalized) {
        return {
          battle,
          actionType,
          outcome: {
            ...result,
            finalDamage: damageWithHooks.finalDamage,
            type: "magic",
            actorUserId,
            defenderId,
          },
          finished: true,
          finalized,
        };
      }

      const turnFlow = passTurn(battle, actorUserId, { energyPenalty: result.energyConsumed });
      return {
        battle,
        actionType,
        outcome: {
          ...result,
          finalDamage: damageWithHooks.finalDamage,
          type: "magic",
          actorUserId,
          defenderId,
          turnFlow,
        },
        finished: false,
        shouldPassTurn: true,
      };
    }

    const skillCooldown = getElementalSkillCooldown(attacker, magicAction.id);
    if (skillCooldown > 0) {
      return {
        battle,
        actionType,
        outcome: {
          ok: false,
          reason: "elemental_skill_on_cooldown",
          type: "magic",
          blockedOwnTurnsRemaining: skillCooldown,
          magicName: magicAction.name,
        },
        finished: false,
        shouldPassTurn: false,
      };
    }

    const extraEnergyCost = Math.max(0, Number(magicAction.extraEnergyCost || 0));
    const elementalEnergy = consumeBattleEnergy({ battle, userId: actorUserId, amount: MAGIC_ENERGY_COST + extraEnergyCost });
    if (!elementalEnergy.ok) {
      return {
        battle,
        actionType,
        outcome: {
          ok: false,
          reason: "insufficient_skill_energy",
          type: "magic",
          requiredEnergy: MAGIC_ENERGY_COST + extraEnergyCost,
          currentEnergy: elementalEnergy.currentEnergy,
        },
        finished: false,
        shouldPassTurn: false,
      };
    }

    const castResult = runElementalSkillCast({
      battle,
      actorId: actorUserId,
      defenderId,
      skillEntry: magicAction,
      targetId: actionPayload?.targetUserId,
    });
    if (!castResult.ok) {
      return {
        battle,
        actionType,
        outcome: {
          ...castResult,
          type: "magic",
        },
        finished: false,
        shouldPassTurn: false,
      };
    }

    mergeRoundLogs(battle, castResult.battleLog);
    if (castResult.damageDealt != null) {
      if (castResult.damageType === "true") {
        castResult.damageDealt = Math.max(0, Number(castResult.damageDealt || 0));
        castResult.defenderRemainingHp = battle.players[defenderId].battleHp.current;
      } else {
        battle.players[defenderId].battleHp.current = Math.min(battle.players[defenderId].battleHp.max, battle.players[defenderId].battleHp.current + Number(castResult.damageDealt || 0));
        const hooksDamage = applyFinalDamageWithHooks({
          battle,
          attackerId: actorUserId,
          defenderId,
          initialDamage: castResult.damageDealt,
        });
        castResult.damageDealt = hooksDamage.finalDamage;
        castResult.defenderRemainingHp = battle.players[defenderId].battleHp.current;
        mergeRoundLogs(battle, hooksDamage.logs);
      }
    }

    if (castResult.killed && castResult.energyRestoreOnKill) {
      restoreBattleEnergy({ battle, userId: actorUserId, amount: castResult.energyRestoreOnKill });
    }
    if (castResult.killed && castResult.cooldownReductionOnKill) {
      reduceAllElementalCooldowns(attacker, castResult.cooldownReductionOnKill);
    }

    const finalized = applyRoundEndAndCheck(battle, actorUserId);
    if (finalized) {
      return {
        battle,
        actionType,
        outcome: {
          ok: true,
          type: "magic",
          actorUserId,
          defenderId,
          magicEntry: magicAction,
          energyConsumed: MAGIC_ENERGY_COST + extraEnergyCost,
          elemental: resolveElementalDamageRule({ attackElement: magicAction.element, defenderElements: defender.selectedPokemon?.elementTypes || [] }),
          finalDamage: castResult.damageDealt || 0,
          defenderRemainingHp: battle.players[defenderId].battleHp.current,
          battleLog: castResult.battleLog,
        },
        finished: true,
        finalized,
      };
    }

    const turnFlow = passTurn(battle, actorUserId, {
      energyPenalty: MAGIC_ENERGY_COST + extraEnergyCost,
      forceNextActorUserId: castResult.forcePassTurn ? defenderId : null,
    });
    return {
      battle,
      actionType,
      outcome: {
        ok: true,
        type: "magic",
        actorUserId,
        defenderId,
        magicEntry: magicAction,
        energyConsumed: MAGIC_ENERGY_COST + extraEnergyCost,
        elemental: resolveElementalDamageRule({ attackElement: magicAction.element, defenderElements: defender.selectedPokemon?.elementTypes || [] }),
        finalDamage: castResult.damageDealt || 0,
        defenderRemainingHp: battle.players[defenderId].battleHp.current,
        turnFlow,
        battleLog: castResult.battleLog,
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
    defender.battleHp.current = Math.min(defender.battleHp.max, defender.battleHp.current + Number(result.finalDamage || 0));

    const damageWithHooks = applyFinalDamageWithHooks({
      battle,
      attackerId: actorUserId,
      defenderId,
      initialDamage: result.finalDamage,
    });

    mergeRoundLogs(battle, damageWithHooks.logs, `⚔️ <@${actorUserId}> atacou <@${defenderId}>.`);

    const finalized = applyRoundEndAndCheck(battle, actorUserId);
    if (finalized) {
      return {
        battle,
        actionType,
        outcome: {
          ok: true,
          type: "attack",
          actorUserId,
          defenderId,
          ...result,
          finalDamage: damageWithHooks.finalDamage,
          defenderRemainingHp: battle.players[defenderId].battleHp.current,
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
        finalDamage: damageWithHooks.finalDamage,
        defenderRemainingHp: battle.players[defenderId].battleHp.current,
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

  const finalized = applyRoundEndAndCheck(battle, actorUserId);
  if (finalized) {
    return {
      battle,
      actionType,
      outcome: {
        ...result,
        ok: true,
        type: "potion",
        actorUserId,
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
