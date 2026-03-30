require("./fireElementRules");
require("./waterElementRules");

const {
  ENABLE_ELEMENTAL_SKILLS,
  BATTLE_HOOK,
  getElementalRules,
  getAvailableMagicActions,
  getSkillCooldownRemaining,
  resolveElementalDamageRule,
  ensureElementalState,
  tickRoundTimers,
} = require("./elementalRules");

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
  if (!ENABLE_ELEMENTAL_SKILLS && parsed.kind === "elemental") return null;
  const actions = getAvailableMagicActions(playerState);

  if (parsed.kind === "regular") {
    return actions.find((entry) => entry.kind === "regular" && Number(entry.slot.replace("magic:", "")) === Number(parsed.slot)) || null;
  }

  return actions.find((entry) => entry.kind === "elemental" && entry.id === parsed.skillId) || null;
}

function applyBeforeDamageHooks({ battle, attackerId, defenderId, damage }) {
  if (!ENABLE_ELEMENTAL_SKILLS) {
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
  if (!ENABLE_ELEMENTAL_SKILLS) {
    return {
      finalDamage: Math.max(0, Number(damage || 0)),
      logs: [],
    };
  }
  let modifiedDamage = Math.max(0, Number(damage || 0));
  const logs = [];

  const attacker = battle.players[attackerId];
  const attackerElements = (attacker?.selectedPokemon?.elementTypes || []).map((entry) => String(entry || '').toLowerCase());
  const attackerEffects = ensureElementalState(attacker).effects || [];
  const waterBoost = attackerEffects.find((effect) => effect?.outgoingWaterDamageMultiplier != null);
  if (waterBoost && attackerElements.includes('water')) {
    modifiedDamage = Math.max(0, Math.round(modifiedDamage * Number(waterBoost.outgoingWaterDamageMultiplier || 1)));
    logs.push('💧 Energia Vital amplificou o dano de água em 50%.');
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
      if (hookResult?.battleLog) logs.push(hookResult.battleLog);
    }
  }

  return {
    finalDamage: modifiedDamage,
    logs,
  };
}

function runEndOfRound({ battle }) {
  if (!ENABLE_ELEMENTAL_SKILLS) return [];
  const logs = [];

  for (const element of ["fire"]) {
    const rules = getElementalRules(element);
    const entries = rules?.hooks?.[BATTLE_HOOK.END_OF_ROUND]?.({ battle }) || [];
    if (Array.isArray(entries)) logs.push(...entries);
  }

  for (const userId of Object.keys(battle.players || {})) {
    tickRoundTimers(battle.players[userId]);
  }

  return logs;
}

function getElementalSkillCooldown(playerState, skillId) {
  return getSkillCooldownRemaining(playerState, skillId);
}

function runElementalSkillCast({ battle, actorId, defenderId, skillEntry, targetId = null }) {
  if (!ENABLE_ELEMENTAL_SKILLS) return { ok: false, reason: "magic_not_found" };
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
};
