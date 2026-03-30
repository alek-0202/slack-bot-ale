require("./fireElementRules");
require("./waterElementRules");
require("./grassElementRules");
require("./electricElementRules");
require("./iceElementRules");
require("./fightingElementRules");
require("./psychicElementRules");
require("./ghostElementRules");

const {
  ENABLE_ELEMENTAL_SKILLS_BATTLE,
  BATTLE_HOOK,
  getElementalRules,
  getRegisteredElementalRules,
  getAvailableMagicActions,
  getSkillCooldownRemaining,
  resolveElementalDamageRule,
  ensureElementalState,
  tickRoundTimers,
} = require("./elementalRules");
const { GRASS_EFFECT_SUFFOCATING_ROOTS } = require("./grassElementRules");
const { ELECTRIC_EFFECT_SHOCK, ELECTRIC_EFFECT_OVERLOAD, ELECTRIC_EFFECT_FIELD_DEBUFF, ELECTRIC_EFFECT_FIELD } = require("./electricElementRules");
const { normalizeElementList, matchesElement } = require("../../../services/elementType");

function parseMagicActionSlot(rawMagicSlot) {
  const value = String(rawMagicSlot || "");
  if (value.startsWith("magic:")) return { kind: "regular", slot: Number(value.replace("magic:", "")) || null };
  if (value.startsWith("elemental:")) return { kind: "elemental", skillId: value.replace("elemental:", "") };
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) return { kind: "regular", slot: asNumber };
  return { kind: "elemental", skillId: value };
}

function resolveMagicActionEntry(playerState, rawMagicSlot) {
  const parsed = parseMagicActionSlot(rawMagicSlot);
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE && parsed.kind === "elemental") return null;
  const actions = getAvailableMagicActions(playerState);

  if (parsed.kind === "regular") {
    return actions.find((entry) => entry.kind === "regular" && Number(entry.slot.replace("magic:", "")) === Number(parsed.slot)) || null;
  }

  return actions.find((entry) => entry.kind === "elemental" && entry.id === parsed.skillId) || null;
}

function applyBeforeDamageHooks({ battle, attackerId, defenderId, damage }) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) {
    return {
      finalDamage: Math.max(0, Number(damage || 0)),
      logs: [],
    };
  }
  let modifiedDamage = Math.max(0, Number(damage || 0));
  const logs = [];


  const attackerEffects = ensureElementalState(battle.players[attackerId]).effects || [];
  for (const effect of attackerEffects) {
    if (effect?.outgoingDamageMultiplier != null) {
      modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(effect.outgoingDamageMultiplier || 1)));
    }
  }

  const defenderEffects = ensureElementalState(battle.players[defenderId]).effects || [];
  for (const effect of defenderEffects) {
    if (effect?.incomingDamageTakenMultiplier != null) {
      modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(effect.incomingDamageTakenMultiplier || 1)));
    }
  }

  for (const attackerElement of (battle.players[attackerId]?.selectedPokemon?.elementTypes || [])) {
    const rules = getElementalRules(attackerElement);
    for (const skill of rules?.skills || []) {
      if (!Array.isArray(skill.hooks) || !skill.hooks.includes(BATTLE_HOOK.BEFORE_DAMAGE)) continue;
      const hookResult = skill.beforeDamage?.({
        battle,
        attacker: battle.players[attackerId],
        defender: battle.players[defenderId],
        attackerId,
        defenderId,
      });
      if (hookResult?.damageMultiplier != null) {
        modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(hookResult.damageMultiplier || 1)));
      }
      if (hookResult?.battleLog) logs.push(hookResult.battleLog);
    }
  }

  for (const defenderElement of (battle.players[defenderId]?.selectedPokemon?.elementTypes || [])) {
    const rules = getElementalRules(defenderElement);
    for (const skill of rules?.skills || []) {
      if (!Array.isArray(skill.hooks) || !skill.hooks.includes(BATTLE_HOOK.BEFORE_DAMAGE)) continue;
      const hookResult = skill.beforeDamage?.({
        battle,
        attacker: battle.players[attackerId],
        defender: battle.players[defenderId],
        attackerId,
        defenderId,
      });
      if (hookResult?.damageMultiplier != null) {
        modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(hookResult.damageMultiplier || 1)));
      }
      if (hookResult?.battleLog) logs.push(hookResult.battleLog);
    }
  }

  return {
    finalDamage: modifiedDamage,
    logs,
  };
}

function applyOnHitHooks({ battle, attackerId, defenderId, damage }) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) {
    return {
      finalDamage: Math.max(0, Number(damage || 0)),
      logs: [],
    };
  }
  let modifiedDamage = Math.max(0, Number(damage || 0));
  const logs = [];

  const attacker = battle.players[attackerId];
  const attackerElements = normalizeElementList(attacker?.selectedPokemon?.elementTypes || [], { includeUnknown: false });
  const attackerEffects = ensureElementalState(attacker).effects || [];
  const waterBoost = attackerEffects.find((effect) => effect?.outgoingWaterDamageMultiplier != null);
  if (waterBoost && attackerElements.some((entry) => matchesElement(entry, "water"))) {
    modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(waterBoost.outgoingWaterDamageMultiplier || 1)));
    logs.push('💧 Energia Vital amplificou o dano de água em 50%.');
  }
  for (const effect of attackerEffects) {
    if (effect?.damageFlatBonusPerStack != null && effect?.remainingRounds != null && Number(effect.remainingRounds || 0) > 0) {
      modifiedDamage = Math.max(0, Math.round(modifiedDamage + Number(effect.damageFlatBonusPerStack || 0)));
    }
  }
  const marked = attackerEffects.find((effect) => effect?.outgoingDamageVsMarkedMultiplier != null && effect?.markedTargetUserId === defenderId);
  if (marked) {
    modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(marked.outgoingDamageVsMarkedMultiplier || 1)));
  }

  for (const element of (battle.players[attackerId]?.selectedPokemon?.elementTypes || [])) {
    const rules = getElementalRules(element);
    for (const skill of rules?.skills || []) {
      if (!Array.isArray(skill.hooks) || !skill.hooks.includes(BATTLE_HOOK.ON_HIT)) continue;
      const hookResult = skill.onHit?.({
        battle,
        attacker: battle.players[attackerId],
        defender: battle.players[defenderId],
        attackerId,
        defenderId,
        currentDamage: modifiedDamage,
      });
      if (hookResult?.extraDamageMultiplier != null) {
        modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(hookResult.extraDamageMultiplier || 1)));
      }
      if (hookResult?.extraDamageFlat != null) {
        modifiedDamage = Math.max(0, Math.round(modifiedDamage + Number(hookResult.extraDamageFlat || 0)));
      }
      if (hookResult?.battleLog) logs.push(hookResult.battleLog);
    }
  }

  return {
    finalDamage: modifiedDamage,
    logs,
  };
}

function runEndOfRound({ battle }) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) return [];
  const logs = [];
  const uniqueElements = [...new Set(
    normalizeElementList(
      Object.values(battle.players || {}).flatMap((player) => player?.selectedPokemon?.elementTypes || []),
      { includeUnknown: false },
    ),
  )];
  const fallbackRegistered = getRegisteredElementalRules().map((entry) => entry.element);
  const runFor = [...new Set([...uniqueElements, ...fallbackRegistered])];
  for (const element of runFor) {
    const rules = getElementalRules(element);
    const entries = rules?.hooks?.[BATTLE_HOOK.END_OF_ROUND]?.({ battle }) || [];
    if (Array.isArray(entries)) logs.push(...entries);
  }

  for (const userId of Object.keys(battle.players || {})) {
    tickRoundTimers(battle.players[userId]);
  }

  return logs;
}

function getForcedAction(playerState) {
  const effects = ensureElementalState(playerState).effects || [];
  return effects.find((effect) => Number(effect?.remainingRounds ?? 1) > 0 && effect?.forcedAction) || null;
}

function resolveMobilityInterception({ battle, actorId, actionType, actionPayload = {} }) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) return { damageTaken: 0, logs: [] };
  const actor = battle.players?.[actorId];
  if (!actor) return { damageTaken: 0, logs: [] };
  const isMobilityAttempt = actionType === "switch" || actionPayload?.isMobilitySkill === true;
  if (!isMobilityAttempt) return { damageTaken: 0, logs: [] };

  const rooted = (ensureElementalState(actor).effects || []).find((effect) => effect.id === GRASS_EFFECT_SUFFOCATING_ROOTS);
  if (!rooted || Number(rooted.remainingRounds || 0) <= 0) return { damageTaken: 0, logs: [] };
  const extraPct = Math.max(0, Number(rooted.mobilityPunishDamagePctMaxHp || 0));
  const penaltyDamage = Math.max(0, Math.round(Number(actor?.battleHp?.max || 0) * extraPct));
  actor.battleHp.current = Math.max(0, Number(actor?.battleHp?.current || 0) - penaltyDamage);
  return {
    damageTaken: penaltyDamage,
    logs: [`🌱 Enraizado puniu mobilidade: <@${actorId}> sofreu ${penaltyDamage} ao tentar se deslocar.`],
  };
}

function evaluateActionStartModifiers({ battle, actorId, actionType }) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) return { cancelTurn: false, damageMultiplier: 1, logs: [] };
  const actor = battle.players?.[actorId];
  if (!actor) return { cancelTurn: false, damageMultiplier: 1, logs: [] };
  const logs = [];
  let damageMultiplier = 1;
  let cancelTurn = false;
  let initiativePenaltyMultiplier = 1;
  let selfDamage = 0;

  const effects = ensureElementalState(actor).effects || [];
  for (const effect of effects) {
    if (effect.forcedSkipAction) {
      cancelTurn = true;
      logs.push(`❄️ ${effect.name || "Congelado"} impediu a ação.`);
      if (effect.consumeOnActionStart) effect.remainingRounds = 0;
    }
    if (effect.id === ELECTRIC_EFFECT_OVERLOAD && Math.random() < Number(effect.loseTurnChance || 0)) {
      cancelTurn = true;
      logs.push("⚡ Sobrecarga elétrica causou perda total do turno.");
    }
    if (effect.id === ELECTRIC_EFFECT_SHOCK && Math.random() < Number(effect.partialFailureChance || 0)) {
      damageMultiplier *= Number(effect.partialFailureDamageMultiplier || 0.5);
      logs.push("⚡ Choque causou falha parcial: dano reduzido pela metade.");
    }
    if (effect.id !== ELECTRIC_EFFECT_SHOCK && effect.partialFailureChance != null && Math.random() < Number(effect.partialFailureChance || 0)) {
      damageMultiplier *= Number(effect.partialFailureDamageMultiplier || 0.85);
      logs.push(`⚠️ ${effect.name || "Debuff"} causou falha leve.`);
    }
    if (effect.partialTurnLossMultiplier != null) {
      initiativePenaltyMultiplier *= Number(effect.partialTurnLossMultiplier || 1);
    }
    if (effect.id.startsWith(ELECTRIC_EFFECT_FIELD_DEBUFF) && actionType !== "potion") {
      if (Math.random() < Number(effect.actionShockChance || 0)) {
        selfDamage += Math.max(0, Number(effect.actionShockDamage || 0));
        logs.push("🧲 Campo Eletrostático disparou choque ao agir.");
      }
    }
  }

  if (selfDamage > 0) {
    actor.battleHp.current = Math.max(0, Number(actor?.battleHp?.current || 0) - selfDamage);
  }
  return { cancelTurn, damageMultiplier, initiativePenaltyMultiplier, selfDamage, logs };
}

function getFieldAttackBonuses({ battle, actorId }) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) return null;
  const actor = battle.players?.[actorId];
  const field = (ensureElementalState(actor).effects || []).find((effect) => effect.id === ELECTRIC_EFFECT_FIELD);
  if (!field) return null;
  return {
    splashChance: Number(field.splashChance || 0),
    splashDamageMultiplier: Number(field.splashDamageMultiplier || 0),
    reactiveHighCostDamage: Number(field.reactiveHighCostDamage || 0),
  };
}

function getElementalSkillCooldown(playerState, skillId) {
  return getSkillCooldownRemaining(playerState, skillId);
}

function runElementalSkillCast({ battle, actorId, defenderId, skillEntry, targetId = null }) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) return { ok: false, reason: "magic_not_found" };
  const actor = battle.players[actorId];
  const defender = battle.players[defenderId];
  ensureElementalState(actor);

  const element = String(skillEntry?.element || "").toLowerCase();
  const rules = getElementalRules(element);
  const skill = (rules?.skills || []).find((entry) => entry.id === skillEntry.id);
  if (!skill) return { ok: false, reason: "elemental_skill_not_found" };

  const skillCooldownRemaining = getSkillCooldownRemaining(actor, skill.id);
  if (skillCooldownRemaining > 0) {
    return { ok: false, reason: "elemental_skill_on_cooldown", blockedOwnTurnsRemaining: skillCooldownRemaining, skillId: skill.id, skillName: skill.name };
  }

  const elementalRelation = resolveElementalDamageRule({
    attackElement: skillEntry.element,
    defenderElements: defender.selectedPokemon?.elementTypes || [],
  });

  return skill.cast({
    battle,
    actor,
    defender,
    actorId,
    defenderId,
    elementalRelation,
    targetId,
  });
}

module.exports = {
  parseMagicActionSlot,
  resolveMagicActionEntry,
  getAvailableMagicActions,
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
};
