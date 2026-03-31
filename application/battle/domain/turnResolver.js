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
  getForcedAction,
  resolveMobilityInterception,
  evaluateActionStartModifiers,
  getFieldAttackBonuses,
} = require("./elementalEngine");
const { GRASS_EFFECT_FOREST_THORN, GRASS_EFFECT_SHORT_CUT, GRASS_EFFECT_SLOWNESS } = require("./grassElementRules");
const { ensureElementalState, addOrRefreshEffect, ENABLE_ELEMENTAL_SKILLS_BATTLE } = require("./elementalRules");
const { resolveSkillTargets, applyDamageToTargetRef } = require("./targetingEngine");
const { ELECTRIC_EFFECT_FIELD_DEBUFF } = require("./electricElementRules");
const { ICE_EFFECT_ARMOR } = require("./iceElementRules");
const { applyGelidStacks } = require("./iceStatusRules");
const { FIGHTING_EFFECT_RHYTHM, FIGHTING_EFFECT_FINISHER, FIGHTING_EFFECT_UNYIELDING, FIGHTING_EFFECT_STANCE_RELEASE } = require("./fightingElementRules");
const { PSYCHIC_SKILLS, PSYCHIC_EFFECT_BARRIER, PSYCHIC_EFFECT_BARRIER_BREAK_BUFF, getReadState, clearReadState } = require("./psychicElementRules");
const { GHOST_SKILLS, GHOST_EFFECT_ETHEREAL, GHOST_EFFECT_CURSE, GHOST_EFFECT_SHADOW_MARK } = require("./ghostElementRules");
const { consumeSkillEnergy, restoreSkillEnergy, ensureSkillEnergyState } = require("./skillEnergy");
const { validateSkillActionRequest } = require("./skillActionValidator");
const { tickOwnerTurnTimers, processOwnerTurnEffects, EFFECT_TIMING } = require("./elementalRules");


function consumeBattleEnergy({ battle, userId, amount }) {
  const actor = battle?.players?.[userId];
  return consumeSkillEnergy(actor, amount);
}

function restoreBattleEnergy({ battle, userId, amount }) {
  restoreSkillEnergy(battle?.players?.[userId], amount);
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
  let finalDamage = Math.max(0, Number(onHit.finalDamage || 0));
  const defender = battle.players[defenderId];
  const defenderEffects = ensureElementalState(defender).effects || [];
  for (const effect of defenderEffects) {
    if (effect?.shieldCurrentHp == null) continue;
    if (Number(effect.shieldCurrentHp || 0) <= 0) continue;
    if (effect.immuneToDamageAndControl) {
      finalDamage = 0;
      break;
    }
    const absorbed = Math.min(finalDamage, Math.max(0, Number(effect.shieldCurrentHp || 0)));
    effect.shieldCurrentHp = Math.max(0, Number(effect.shieldCurrentHp || 0) - absorbed);
    finalDamage = Math.max(0, finalDamage - absorbed);
    if (effect.id === PSYCHIC_EFFECT_BARRIER && Number(effect.shieldCurrentHp || 0) <= 0) {
      const stacks = Math.max(0, Number(effect.psychicEnergyStacks || 0));
      addOrRefreshEffect(defender, {
        id: PSYCHIC_EFFECT_BARRIER_BREAK_BUFF,
        name: "Sobrecarga Psíquica",
        element: "psychic",
        remainingRounds: 2,
        outgoingDamageMultiplier: 1.05,
        incomingDamageTakenMultiplier: Math.max(0.5, 1 - (0.01 * (5 * stacks))),
        damageFlatBonusPerStack: 5 * stacks,
      });
      effect.remainingRounds = 0;
      effect.psychicEnergyStacks = 0;
    }
  }
  defender.battleHp.current = Math.max(0, defender.battleHp.current - finalDamage);
  const shadowMark = (ensureElementalState(defender).effects || []).find((effect) => effect.id === GHOST_EFFECT_SHADOW_MARK && effect.sourceUserId === attackerId);
  if (shadowMark && finalDamage > 0) {
    const attacker = battle.players?.[attackerId];
    if (attacker?.battleHp) {
      attacker.battleHp.current = Math.min(Number(attacker?.battleHp?.max || 0), Number(attacker?.battleHp?.current || 0) + Math.max(1, Math.round(finalDamage * 0.02)));
    }
    const threshold = Math.max(0, Math.round(Number(defender?.battleHp?.max || 0) * Number(shadowMark.executeThresholdPct || 0)));
    const antiExecute = (ensureElementalState(defender).effects || []).some((effect) => effect.antiExecute === true);
    if (!antiExecute && Number(defender?.battleHp?.current || 0) > 0 && Number(defender?.battleHp?.current || 0) <= threshold) {
      defender.battleHp.current = 0;
    }
  }
  return {
    finalDamage,
    logs: [...before.logs, ...onHit.logs],
  };
}

function applyDamageEvents({ battle, actorUserId, damageEvents = [] }) {
  const logs = [];
  const applied = [];
  for (const event of damageEvents) {
    const targetRef = { ...event.targetRef, isAreaDamage: ["chain", "splash", "area"].includes(String(event.type || "")) };
    const result = applyDamageToTargetRef(battle, targetRef, event.damageDealt);
    event.applyAfterDamage?.();
    applied.push({
      ...event,
      appliedDamage: result.damageApplied,
      remainingHp: result.remainingHp,
    });
    logs.push(`⚡ <@${actorUserId}> atingiu <@${event.targetRef.userId}> (${event.type}) com ${result.damageApplied}.`);
    const defenderPlayer = battle.players?.[event.targetRef.userId];
    const armor = defenderPlayer ? ensureElementalState(defenderPlayer).effects?.find((effect) => effect.id === ICE_EFFECT_ARMOR) : null;
    if (armor?.retaliationApplyGelid) {
      const attacker = battle.players?.[actorUserId];
      applyGelidStacks(attacker, Number(armor.retaliationApplyGelid || 1), event.targetRef.userId);
      logs.push(`🧊 Armadura de Gelo aplicou Gélido em <@${actorUserId}>.`);
    }
  }
  return { logs, applied };
}

function applyFightingDefensiveState({ player, damageTaken }) {
  const stance = ensureElementalState(player).effects?.find((effect) => effect.id === FIGHTING_EFFECT_UNYIELDING);
  if (!stance) return { logs: [] };
  const logs = [];
  const gained = Math.max(0, Math.round(Number(damageTaken || 0) * Number(stance.chargeFromTakenDamageRatio || 0.3)));
  stance.storedCharge = Math.max(0, Number(stance.storedCharge || 0) + gained);
  const release = ensureElementalState(player).effects?.find((effect) => effect.id === FIGHTING_EFFECT_STANCE_RELEASE);
  if (release) release.storedCharge = Math.max(Number(release.storedCharge || 0), Number(stance.storedCharge || 0));
  if (Number(player?.battleHp?.current || 0) <= 0 && stance.preventFatal) {
    const rescuedHp = Math.max(1, Math.round(Number(player?.battleHp?.max || 1) * 0.1));
    player.battleHp.current = rescuedHp;
    logs.push("🛡️ Postura Inabalável impediu eliminação e restaurou 10% de HP.");
  }
  return { logs };
}

function consumeFightingFinisher(attacker) {
  const finisher = ensureElementalState(attacker).effects?.find((effect) => effect.id === FIGHTING_EFFECT_FINISHER);
  if (!finisher) return 1;
  finisher.remainingRounds = 0;
  return Math.max(1, Number(finisher.guaranteedCritMultiplier || 3));
}

function consumeStanceReleaseBonus(attacker) {
  const release = ensureElementalState(attacker).effects?.find((effect) => effect.id === FIGHTING_EFFECT_STANCE_RELEASE);
  if (!release) return 0;
  const bonus = Math.max(0, Math.round(Number(release.storedCharge || 0) * 0.5));
  release.remainingRounds = 0;
  release.storedCharge = 0;
  return bonus;
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

function advanceTurnForActor(battle, actorUserId, options = {}) {
  const ownerEndLogs = processOwnerTurnEffects({
    playerState: battle.players?.[actorUserId],
    ownerUserId: actorUserId,
    timing: EFFECT_TIMING.ON_OWNER_TURN_END,
  });
  tickOwnerTurnTimers(battle.players?.[actorUserId]);
  if (ownerEndLogs.length) mergeRoundLogs(battle, ownerEndLogs);
  return passTurn(battle, actorUserId, options);
}

function resolveBattleTurn({ battle, actorUserId, actionType, actionPayload = {} }) {
  const ownerStartLogs = processOwnerTurnEffects({
    playerState: battle.players?.[actorUserId],
    ownerUserId: actorUserId,
    timing: EFFECT_TIMING.ON_OWNER_TURN_START,
  });
  if (ownerStartLogs.length) mergeRoundLogs(battle, ownerStartLogs);

  const actionStart = evaluateActionStartModifiers({ battle, actorId: actorUserId, actionType });
  const actorRhythm = ensureElementalState(battle.players?.[actorUserId]).effects?.find((effect) => effect.id === FIGHTING_EFFECT_RHYTHM);
  const hasGroupControl = (ensureElementalState(battle.players?.[actorUserId]).effects || [])
    .some((effect) => effect.controlLight || effect.forcedSkipAction || effect.forcedAction);
  if (actorRhythm && hasGroupControl) {
    actorRhythm.stacks = 0;
    actorRhythm.targetUserId = null;
  }
  if (actionStart.logs?.length) mergeRoundLogs(battle, actionStart.logs);
  if (actionStart.cancelTurn) {
    const turnFlow = advanceTurnForActor(battle, actorUserId, { energyPenalty: Math.round((1 - Number(actionStart.initiativePenaltyMultiplier || 1)) * 20) });
    return {
      battle,
      actionType,
      outcome: {
        ok: true,
        type: actionType,
        actorUserId,
        canceledByStatus: true,
        selfDamage: actionStart.selfDamage || 0,
        turnFlow,
      },
      finished: false,
      shouldPassTurn: true,
    };
  }

  const forcedAction = getForcedAction(battle.players?.[actorUserId]);
  if (forcedAction && forcedAction.forcedAction !== actionType) {
    return {
      battle,
      actionType,
      outcome: {
        ok: false,
        reason: "taunted_must_attack",
        type: actionType,
      },
      finished: false,
      shouldPassTurn: false,
    };
  }

  const ghostEthereal = ensureElementalState(battle.players?.[actorUserId]).effects?.find((effect) => effect.id === GHOST_EFFECT_ETHEREAL);
  const isManualEtherealExit = actionType === BATTLE_ACTION.MAGIC && String(actionPayload?.magicSlot || "").includes(GHOST_SKILLS.ETHEREAL_FORM);
  if (ghostEthereal && actionType === BATTLE_ACTION.ATTACK) {
    return {
      battle,
      actionType,
      outcome: { ok: false, reason: "ethereal_cannot_attack", type: actionType },
      finished: false,
      shouldPassTurn: false,
    };
  }
  if (ghostEthereal && actionType === BATTLE_ACTION.MAGIC && !isManualEtherealExit) {
    return {
      battle,
      actionType,
      outcome: { ok: false, reason: "ethereal_cannot_cast_other_skills", type: actionType },
      finished: false,
      shouldPassTurn: false,
    };
  }

  const mobilityInterception = resolveMobilityInterception({ battle, actorId: actorUserId, actionType, actionPayload });
  if (mobilityInterception.logs?.length) mergeRoundLogs(battle, mobilityInterception.logs);

  if (actionType === BATTLE_ACTION.SWITCH) {
    const actorEffects = ensureElementalState(battle.players[actorUserId]).effects || [];
    const rhythm = actorEffects.find((effect) => effect.id === FIGHTING_EFFECT_RHYTHM);
    if (rhythm) {
      rhythm.stacks = 0;
      rhythm.targetUserId = null;
    }
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

    const turnFlow = advanceTurnForActor(battle, actorUserId);
    return {
      battle,
      actionType,
      outcome: {
        ok: true,
        type: "switch",
        actorUserId,
        switchedPokemonId: player.selectedPokemon?.id || null,
        switchedPokemonName: player.selectedPokemon?.name || null,
        selfPenaltyDamage: mobilityInterception.damageTaken || 0,
        turnFlow,
      },
      finished: false,
      shouldPassTurn: true,
    };
  }

  if (actionType === BATTLE_ACTION.MAGIC) {
    const attacker = battle.players[actorUserId];
    ensureSkillEnergyState(attacker);
    const curse = ensureElementalState(attacker).effects?.find((effect) => effect.id === GHOST_EFFECT_CURSE);
    if (curse) curse.stacks = Math.max(0, Number(curse.stacks || 0) + 2);
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
    const usageValidation = validateSkillActionRequest({ battle, actorUserId, magicSlot: actionPayload.magicSlot, targetUserId: defenderId });
    if (!usageValidation.ok) {
      const mapped = usageValidation.reason === "INSUFFICIENT_ENERGY"
        ? "insufficient_skill_energy"
        : usageValidation.reason === "COOLDOWN"
          ? (magicAction.kind === "regular" ? "magic_on_cooldown" : "elemental_skill_on_cooldown")
          : usageValidation.reason === "NOT_YOUR_TURN"
            ? "not_actor_turn"
            : "magic_not_found";
      return {
        battle,
        actionType,
        outcome: {
          ok: false,
          reason: mapped,
          type: "magic",
          blockedOwnTurnsRemaining: magicAction?.kind === "regular"
            ? Math.max(0, Number(attacker?.magicCooldown?.blockedOwnTurnsRemaining || 0))
            : Math.max(0, Number(getElementalSkillCooldown(attacker, magicAction?.id) || 0)),
          requiredEnergy: usageValidation.requiredEnergy,
          currentEnergy: attacker?.skillEnergy,
        },
        finished: false,
        shouldPassTurn: false,
      };
    }

    if (magicAction.kind === "regular") {
      const rhythm = ensureElementalState(attacker).effects?.find((effect) => effect.id === FIGHTING_EFFECT_RHYTHM);
      if (rhythm?.breakOnMagic) {
        rhythm.stacks = 0;
        rhythm.targetUserId = null;
      }
      const regularEnergyCheck = consumeBattleEnergy({ battle, userId: actorUserId, amount: MAGIC_ENERGY_COST });
      if (!regularEnergyCheck.ok) {
        return { battle, actionType, outcome: { ok: false, reason: "insufficient_skill_energy", type: "magic", requiredEnergy: MAGIC_ENERGY_COST, currentEnergy: regularEnergyCheck.currentEnergy }, finished: false, shouldPassTurn: false };
      }

      const slotNumber = Number(String(magicAction.slot).replace("magic:", ""));
      const regularMagic = (attacker.magicSlots || []).find((entry) => Number(entry.slot) === slotNumber);
      const result = resolveMagicTurn({ attacker, defender, magicEntry: regularMagic });
      result.finalDamage = Math.max(0, Math.round(Number(result.finalDamage || 0) * consumeFightingFinisher(attacker)));
      result.finalDamage = Math.max(0, Math.round(Number(result.finalDamage || 0) * Number(actionStart.damageMultiplier || 1)));
      defender.battleHp.current = Math.min(defender.battleHp.max, defender.battleHp.current + Number(result.finalDamage || 0));

      const damageWithHooks = applyFinalDamageWithHooks({
        battle,
        attackerId: actorUserId,
        defenderId,
        initialDamage: result.finalDamage,
      });
      const defenderArmor = ensureElementalState(defender).effects?.find((effect) => effect.id === ICE_EFFECT_ARMOR);
      if (defenderArmor?.retaliationApplyGelid) {
        applyGelidStacks(attacker, Number(defenderArmor.retaliationApplyGelid || 1), defenderId);
        mergeRoundLogs(battle, `🧊 Armadura de Gelo aplicou Gélido em <@${actorUserId}>.`);
      }
      const defenderFighting = applyFightingDefensiveState({ player: defender, damageTaken: damageWithHooks.finalDamage });
      if (defenderFighting.logs.length) mergeRoundLogs(battle, defenderFighting.logs);

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
          selfDamage: actionStart.selfDamage || 0,
        },
          finished: true,
          finalized,
        };
      }

      const turnFlow = advanceTurnForActor(battle, actorUserId, { energyPenalty: result.energyConsumed });
      return {
        battle,
        actionType,
        outcome: {
          ...result,
          finalDamage: damageWithHooks.finalDamage,
          type: "magic",
          actorUserId,
          defenderId,
          selfDamage: actionStart.selfDamage || 0,
          turnFlow,
        },
        finished: false,
        shouldPassTurn: true,
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

    if (magicAction.element === "psychic" && magicAction.id !== PSYCHIC_SKILLS.MIND_READING) {
      const readingState = getReadState(attacker);
      if (readingState && Number(readingState.chargesRemaining || 0) === 1) {
        clearReadState(attacker);
      }
    }

    mergeRoundLogs(battle, castResult.battleLog);
    let multiTargetApplied = [];
    if (Array.isArray(castResult.damageEvents) && castResult.damageEvents.length) {
      const multi = applyDamageEvents({ battle, actorUserId, damageEvents: castResult.damageEvents });
      mergeRoundLogs(battle, multi.logs);
      multiTargetApplied = multi.applied;
    }
    if (castResult.damageDealt != null) {
      if (castResult.consumeStanceRelease) {
        castResult.damageDealt += consumeStanceReleaseBonus(attacker);
      }
      castResult.damageDealt = Math.max(0, Math.round(Number(castResult.damageDealt || 0) * consumeFightingFinisher(attacker)));
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
        const defenderArmor = ensureElementalState(defender).effects?.find((effect) => effect.id === ICE_EFFECT_ARMOR);
        if (defenderArmor?.retaliationApplyGelid) {
          applyGelidStacks(attacker, Number(defenderArmor.retaliationApplyGelid || 1), defenderId);
          mergeRoundLogs(battle, `🧊 Armadura de Gelo aplicou Gélido em <@${actorUserId}>.`);
        }
        const defenderFighting = applyFightingDefensiveState({ player: defender, damageTaken: hooksDamage.finalDamage });
        if (defenderFighting.logs.length) mergeRoundLogs(battle, defenderFighting.logs);
      }
    }
    if (castResult.consumeAllEnergy) attacker.skillEnergy = 0;

    if (castResult.onKillSpread?.status === "gelid" && Number(battle.players[defenderId]?.battleHp?.current || 0) <= 0) {
      const next = resolveSkillTargets({
        battle,
        actorId: actorUserId,
        primaryDefenderId: defenderId,
        targeting: { mode: "splash", maxTargets: 2, includeBench: true, allowSecondaryOutsideActive: true },
      })[1];
      if (next) {
        applyGelidStacks(battle.players[next.userId], Number(castResult.onKillSpread.stacks || 1), actorUserId);
        mergeRoundLogs(battle, `❄️ Estilhaço Glacial espalhou Gélido para <@${next.userId}>.`);
      }
    }

    if (ENABLE_ELEMENTAL_SKILLS_BATTLE) {
      const totalSkillCost = MAGIC_ENERGY_COST + extraEnergyCost;
      if (totalSkillCost >= 120) {
        const attackerEffects = ensureElementalState(attacker).effects || [];
        const hostileField = attackerEffects.find((effect) => String(effect.id || "").startsWith(ELECTRIC_EFFECT_FIELD_DEBUFF));
        if (hostileField?.actionShockDamage) {
          attacker.battleHp.current = Math.max(0, Number(attacker?.battleHp?.current || 0) - Number(hostileField.actionShockDamage || 0));
          mergeRoundLogs(battle, `🧲 Campo Eletrostático retaliou habilidade de alto custo em <@${actorUserId}>.`);
        }
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
          multiTargetEvents: multiTargetApplied,
          defenderRemainingHp: battle.players[defenderId].battleHp.current,
          battleLog: castResult.battleLog,
        },
        finished: true,
        finalized,
      };
    }

    const turnFlow = advanceTurnForActor(battle, actorUserId, {
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
        multiTargetEvents: multiTargetApplied,
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
    result.finalDamage = Math.max(0, Math.round(Number(result.finalDamage || 0) * consumeFightingFinisher(attacker)));
    result.finalDamage += consumeStanceReleaseBonus(attacker);
    result.finalDamage = Math.max(0, Math.round(Number(result.finalDamage || 0) * Number(actionStart.damageMultiplier || 1)));
    defender.battleHp.current = Math.min(defender.battleHp.max, defender.battleHp.current + Number(result.finalDamage || 0));

    const damageWithHooks = applyFinalDamageWithHooks({
      battle,
      attackerId: actorUserId,
      defenderId,
      initialDamage: result.finalDamage,
    });
    const defenderArmor = ensureElementalState(defender).effects?.find((effect) => effect.id === ICE_EFFECT_ARMOR);
    if (defenderArmor?.retaliationApplyGelid) {
      applyGelidStacks(attacker, Number(defenderArmor.retaliationApplyGelid || 1), defenderId);
      mergeRoundLogs(battle, `🧊 Armadura de Gelo aplicou Gélido em <@${actorUserId}>.`);
    }
    const defenderFighting = applyFightingDefensiveState({ player: defender, damageTaken: damageWithHooks.finalDamage });
    if (defenderFighting.logs.length) mergeRoundLogs(battle, defenderFighting.logs);

    mergeRoundLogs(battle, damageWithHooks.logs, `⚔️ <@${actorUserId}> atacou <@${defenderId}>.`);
    const defenderEffects = ensureElementalState(defender).effects || [];
    const forestThorn = defenderEffects.find((effect) => effect.id === GRASS_EFFECT_FOREST_THORN);
    if (ENABLE_ELEMENTAL_SKILLS_BATTLE && forestThorn?.reflectOnCommonAttack) {
      const attackerHpRatio = Number(attacker?.battleHp?.current || 0) / Math.max(1, Number(attacker?.battleHp?.max || 1));
      const useLowHpBonus = attackerHpRatio < Number(forestThorn.reflectOnCommonAttack.lowHpThreshold || 0.3);
      const reflectPct = useLowHpBonus
        ? Number(forestThorn.reflectOnCommonAttack.lowHpReflectPct || 0.22)
        : Number(forestThorn.reflectOnCommonAttack.normalReflectPct || 0.15);
      const slowChance = useLowHpBonus
        ? Number(forestThorn.reflectOnCommonAttack.lowHpSlowChance || 0.35)
        : Number(forestThorn.reflectOnCommonAttack.normalSlowChance || 0.2);
      const reflectedDamage = Math.max(0, Math.round(Number(damageWithHooks.finalDamage || 0) * reflectPct));
      attacker.battleHp.current = Math.max(0, Number(attacker?.battleHp?.current || 0) - reflectedDamage);

      addOrRefreshEffect(attacker, {
        id: GRASS_EFFECT_SHORT_CUT,
        name: "Corte Curto",
        element: "grass",
        remainingRounds: 2,
        outgoingDamageMultiplier: 0.9,
      });

      const slowed = Math.random() < slowChance;
      if (slowed) {
        addOrRefreshEffect(attacker, {
          id: GRASS_EFFECT_SLOWNESS,
          name: "Lentidão",
          element: "grass",
          remainingRounds: 2,
          speedMultiplier: 0.75,
        });
      }

      mergeRoundLogs(
        battle,
        `🌲 Espinho da Floresta refletiu ${reflectedDamage} em <@${actorUserId}> e aplicou Corte Curto por 2 rodadas.${slowed ? " Lentidão aplicada." : ""}`,
      );
    }

    if (ENABLE_ELEMENTAL_SKILLS_BATTLE) {
      const fieldBonuses = getFieldAttackBonuses({ battle, actorId: actorUserId });
      if (fieldBonuses && Math.random() < Number(fieldBonuses.splashChance || 0)) {
        const secondary = resolveSkillTargets({
          battle,
          actorId: actorUserId,
          primaryDefenderId: defenderId,
          targeting: { mode: "splash", maxTargets: 2, includeBench: true, allowSecondaryOutsideActive: true },
        })[1];
        if (secondary) {
          const splashDamage = Math.max(1, Math.round(Number(damageWithHooks.finalDamage || 0) * Number(fieldBonuses.splashDamageMultiplier || 0.3)));
          const splashResult = applyDamageToTargetRef(battle, secondary, splashDamage);
          mergeRoundLogs(battle, `🧲 Campo Eletrostático gerou splash em <@${secondary.userId}> por ${splashResult.damageApplied}.`);
        }
      }
    }

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
          selfPenaltyDamage: mobilityInterception.damageTaken || 0,
          selfDamage: actionStart.selfDamage || 0,
        },
        finished: true,
        finalized,
      };
    }

    const turnFlow = advanceTurnForActor(battle, actorUserId);
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
        selfPenaltyDamage: mobilityInterception.damageTaken || 0,
        selfDamage: actionStart.selfDamage || 0,
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

  const turnFlow = advanceTurnForActor(battle, actorUserId);
  const ownerEndLogs = processOwnerTurnEffects({
    playerState: battle.players?.[actorUserId],
    ownerUserId: actorUserId,
    timing: EFFECT_TIMING.ON_OWNER_TURN_END,
  });
  tickOwnerTurnTimers(battle.players?.[actorUserId]);
  if (ownerEndLogs.length) mergeRoundLogs(battle, ownerEndLogs);
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
