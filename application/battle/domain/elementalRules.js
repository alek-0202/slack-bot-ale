const { resolveElementalRelation, normalizeElementName } = require("../../../services/pokemonElementsService");
const { normalizeElementList } = require("../../../services/elementType");
const { resolveElementalDamageAdjustment } = require("./damagePipeline");

const ELEMENTAL_COUNTER_REDUCTION_MULTIPLIER = 0.3;
const ELEMENTAL_ADVANTAGE_MULTIPLIER = 2;
const ELEMENTAL_NEUTRAL_MULTIPLIER = 1;
const MAX_ELEMENTAL_SKILL_SLOTS_PER_ELEMENT = 2;
const APP_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase();

function parseBooleanEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const IS_DEV_ENV = ["development", "dev", "local"].includes(APP_ENV);
const ENABLE_ELEMENTAL_SKILLS_MASTER = parseBooleanEnv(process.env.ENABLE_ELEMENTAL_SKILLS, false);
const ENABLE_ELEMENTAL_SKILLS_IN_DEV = parseBooleanEnv(process.env.ENABLE_ELEMENTAL_SKILLS_IN_DEV, true);
const ELEMENTAL_SKILLS_DEFAULT_ENABLED = ENABLE_ELEMENTAL_SKILLS_MASTER || (IS_DEV_ENV && ENABLE_ELEMENTAL_SKILLS_IN_DEV);

const ENABLE_ELEMENTAL_SKILLS_REGISTRY = parseBooleanEnv(
  process.env.ENABLE_ELEMENTAL_SKILLS_REGISTRY,
  ELEMENTAL_SKILLS_DEFAULT_ENABLED,
);
const ENABLE_ELEMENTAL_SKILLS_MRSKILL = parseBooleanEnv(
  process.env.ENABLE_ELEMENTAL_SKILLS_MRSKILL,
  ELEMENTAL_SKILLS_DEFAULT_ENABLED,
);
const ENABLE_ELEMENTAL_SKILLS_BATTLE = parseBooleanEnv(
  process.env.ENABLE_ELEMENTAL_SKILLS_BATTLE,
  ELEMENTAL_SKILLS_DEFAULT_ENABLED,
);
const ENABLE_ELEMENTAL_SKILLS = ELEMENTAL_SKILLS_DEFAULT_ENABLED;

const BATTLE_HOOK = {
  BEFORE_DAMAGE: "beforeDamage",
  ON_CAST: "onCast",
  ON_HIT: "onHit",
  END_OF_ROUND: "endOfRound",
};
const EFFECT_TIMING = {
  ON_OWNER_TURN_START: "ON_OWNER_TURN_START",
  ON_OWNER_TURN_END: "ON_OWNER_TURN_END",
};

const elementalRegistry = new Map();

function registerElementalRules(element, rules) {
  elementalRegistry.set(normalizeElementName(element), rules);
}

function getElementalRules(element) {
  return elementalRegistry.get(normalizeElementName(element)) || null;
}

function getRegisteredElementalRules() {
  return Array.from(elementalRegistry.entries()).map(([element, rules]) => ({ element, rules }));
}

function getElementalEfficiencyMultiplier(playerState) {
  const efficiency = Math.max(0, Number(playerState?.stats?.elementalChance || 0));
  const state = ensureElementalState(playerState || {});
  const effectBonusPct = (state.effects || [])
    .filter((effect) => Number(effect?.remainingRounds ?? 1) > 0)
    .reduce((acc, effect) => acc + Math.max(0, Number(effect.elementalEfficiencyBonusPct || 0)), 0);
  const statusBonusPct = (state.statuses || [])
    .filter((status) => Number(status?.remainingRounds ?? 1) > 0)
    .reduce((acc, status) => acc + Math.max(0, Number(status.elementalEfficiencyBonusPct || 0)), 0);
  return 1 + efficiency + ((effectBonusPct + statusBonusPct) / 100);
}

function resolveElementalDamageRule({ attackElement, defenderElements = [] }) {
  const relation = resolveElementalRelation({ attackElement, defenderElements });
  const multiplier = relation.hasAdvantage
    ? ELEMENTAL_ADVANTAGE_MULTIPLIER
    : relation.hasDisadvantage
      ? ELEMENTAL_COUNTER_REDUCTION_MULTIPLIER
      : ELEMENTAL_NEUTRAL_MULTIPLIER;

  return {
    ...relation,
    multiplier,
  };
}

function ensureElementalState(playerState) {
  if (!playerState.elementalState) {
    playerState.elementalState = {
      statuses: [],
      effects: [],
      skillCooldowns: {},
    };
  }
  return playerState.elementalState;
}

function getStatus(playerState, statusId) {
  return ensureElementalState(playerState).statuses.find((status) => status.id === statusId) || null;
}

function hasStatus(playerState, statusId) {
  const status = getStatus(playerState, statusId);
  return Boolean(status && Number(status.stacks || 0) > 0 && Number(status.remainingRounds || 0) > 0);
}

function upsertStatus(playerState, nextStatus) {
  const state = ensureElementalState(playerState);
  const existingIndex = state.statuses.findIndex((status) => status.id === nextStatus.id);

  if (existingIndex >= 0) {
    state.statuses[existingIndex] = { ...state.statuses[existingIndex], ...nextStatus };
    return state.statuses[existingIndex];
  }

  state.statuses.push(nextStatus);
  return nextStatus;
}

function addOrRefreshEffect(playerState, effect) {
  const state = ensureElementalState(playerState);
  const existingIndex = state.effects.findIndex((current) => current.id === effect.id);

  if (existingIndex >= 0) {
    state.effects[existingIndex] = { ...state.effects[existingIndex], ...effect };
    return state.effects[existingIndex];
  }

  state.effects.push(effect);
  return effect;
}

function getAvailableElementalSkills(playerState) {
  if (!ENABLE_ELEMENTAL_SKILLS_BATTLE) return [];
  const byRegistration = Array.isArray(playerState?.characteristicSlots) ? playerState.characteristicSlots : [];
  if (byRegistration.length) {
    return byRegistration.map((entry) => ({
      ...entry,
      kind: "elemental",
      slot: `elemental:${entry.id}`,
    })).filter((entry) => !entry?.isPassive && !entry?.hiddenFromActionMenu && entry?.activationType !== "passive");
  }

  const level = Number(playerState?.selectedPokemon?.level || 0);
  if (level < 50) return [];

  const normalizedElements = Array.isArray(playerState?.selectedPokemon?.elementTypes)
    ? normalizeElementList(playerState.selectedPokemon.elementTypes, { includeUnknown: false })
    : normalizeElementList(playerState?.selectedPokemon?.elementTypes, { includeUnknown: false });

  const entries = [];
  for (const element of normalizedElements) {
    const rules = getElementalRules(element);
    if (!rules?.skills?.length) continue;
    const activeSlots = Math.max(1, Number(rules.activeSkillSlots || MAX_ELEMENTAL_SKILL_SLOTS_PER_ELEMENT));
    entries.push(...rules.skills.slice(0, activeSlots));
  }

  return entries.map((entry) => ({
    ...entry,
    kind: "elemental",
    slot: `elemental:${entry.id}`,
  })).filter((entry) => !entry?.isPassive && !entry?.hiddenFromActionMenu && entry?.activationType !== "passive");
}

function getAvailableMagicActions(playerState) {
  const regular = (Array.isArray(playerState?.magicSlots) ? playerState.magicSlots : []).map((entry) => ({
    ...entry,
    kind: "regular",
    slot: `magic:${entry.slot}`,
  }));

  return [...regular, ...getAvailableElementalSkills(playerState)];
}

function getSkillCooldownRemaining(playerState, skillId) {
  const state = ensureElementalState(playerState);
  return Math.max(0, Number(state.skillCooldowns?.[skillId] || 0));
}

function setSkillCooldown(playerState, skillId, rounds) {
  const state = ensureElementalState(playerState);
  state.skillCooldowns[skillId] = Math.max(0, Number(rounds) || 0);
}

function tickRoundTimers(playerState) {
  const state = ensureElementalState(playerState);
  state.skillCooldowns = Object.fromEntries(
    Object.entries(state.skillCooldowns || {}).map(([skillId, value]) => [skillId, Math.max(0, Number(value || 0) - 1)]),
  );

  state.statuses = state.statuses
    .map((status) => ({ ...status, remainingRounds: Math.max(0, Number(status.remainingRounds || 0) - 1) }))
    .filter((status) => Number(status.remainingRounds) > 0 && Number(status.stacks || 0) > 0);

  const expiredEffects = [];
  state.effects = state.effects
    .map((effect) => ({
      ...effect,
      remainingRounds: effect.remainingRounds == null ? null : Math.max(0, Number(effect.remainingRounds || 0) - 1),
    }))
    .filter((effect) => {
      const expiredByRound = effect.remainingRounds != null && Number(effect.remainingRounds) <= 0;
      const expiredByCharges = Number(effect.chargesRemaining ?? 1) <= 0;
      const expired = expiredByRound || expiredByCharges;
      if (expired) expiredEffects.push(effect);
      return !expired;
    });

  for (const effect of expiredEffects) {
    if (effect?.cooldownOnExpire?.skillId) {
      state.skillCooldowns[effect.cooldownOnExpire.skillId] = Math.max(
        Number(state.skillCooldowns[effect.cooldownOnExpire.skillId] || 0),
        Math.max(0, Number(effect.cooldownOnExpire.rounds || 0)),
      );
    }
    if (effect?.grantEffectOnExpire?.id) {
      addOrRefreshEffect(playerState, {
        ...effect.grantEffectOnExpire,
      });
    }
  }
}

function tickOwnerTurnTimers(playerState) {
  const state = ensureElementalState(playerState);
  state.skillCooldowns = Object.fromEntries(
    Object.entries(state.skillCooldowns || {}).map(([skillId, value]) => [skillId, Math.max(0, Number(value || 0) - 1)]),
  );
  state.statuses = state.statuses
    .map((status) => {
      if (status.durationTurnsRemaining != null) return status;
      return { ...status, remainingRounds: Math.max(0, Number(status.remainingRounds || 0) - 1) };
    })
    .filter((status) => (status.durationTurnsRemaining != null || Number(status.remainingRounds) > 0) && Number(status.stacks || 0) > 0);
  state.effects = state.effects
    .map((effect) => {
      if (effect.durationTurnsRemaining != null) return effect;
      return {
        ...effect,
        remainingRounds: effect.remainingRounds == null ? null : Math.max(0, Number(effect.remainingRounds || 0) - 1),
      };
    })
    .filter((effect) => {
      const expiredByRound = effect.durationTurnsRemaining == null && effect.remainingRounds != null && Number(effect.remainingRounds) <= 0;
      const expiredByCharges = Number(effect.chargesRemaining ?? 1) <= 0;
      return !(expiredByRound || expiredByCharges);
    });
}

function processOwnerTurnEffects({ playerState, ownerUserId, timing }) {
  const state = ensureElementalState(playerState);
  const logs = [];
  state.statuses = state.statuses.filter((status) => {
    if (status.durationTurnsRemaining == null || status.activationTiming !== timing) return true;
    if (status.skipFirstTick) {
      status.skipFirstTick = false;
      return true;
    }
    if (status.effectType === "burn") {
      const burnBaseDamage = Math.max(0, Math.round(Number(status.damagePerStack || 0) * Number(status.stacks || 0)));
      const elemental = resolveElementalDamageAdjustment({
        baseDamage: burnBaseDamage,
        attackElement: status.element || "fire",
        defenderElements: playerState?.selectedPokemon?.elementTypes || [],
      });
      const damage = elemental.adjustedDamage;
      if (damage > 0) {
        playerState.battleHp.current = Math.max(0, Number(playerState?.battleHp?.current || 0) - damage);
        if (elemental.hasElementalAdjustment) {
          logs.push(`🔥 Burn causou ${damage} em <@${ownerUserId}> (${playerState.battleHp.current}/${playerState.battleHp.max}) [${elemental.element} ${elemental.relation} x${elemental.multiplier}].`);
        } else {
          logs.push(`🔥 Burn causou ${damage} em <@${ownerUserId}> (${playerState.battleHp.current}/${playerState.battleHp.max}).`);
        }
      }
    }
    status.durationTurnsRemaining = Math.max(0, Number(status.durationTurnsRemaining || 0) - 1);
    return Number(status.durationTurnsRemaining) > 0 && Number(status.stacks || 0) > 0;
  });
  return logs;
}

function isGroupControlEffect(effect = {}) {
  const tags = Array.isArray(effect?.tags) ? effect.tags.map((entry) => String(entry).toLowerCase()) : [];
  return Boolean(
    effect.controlLight
    || effect.forcedSkipAction
    || effect.forcedAction
    || effect.cannotAct
    || effect.skipTurn
    || effect.blockAction
    || effect.taunt
    || tags.some((tag) => tag.includes('control') || tag.includes('taunt') || tag.includes('displacement'))
  );
}

module.exports = {
  ENABLE_ELEMENTAL_SKILLS,
  ENABLE_ELEMENTAL_SKILLS_IN_DEV,
  ENABLE_ELEMENTAL_SKILLS_REGISTRY,
  ENABLE_ELEMENTAL_SKILLS_MRSKILL,
  ENABLE_ELEMENTAL_SKILLS_BATTLE,
  BATTLE_HOOK,
  EFFECT_TIMING,
  ELEMENTAL_COUNTER_REDUCTION_MULTIPLIER,
  ELEMENTAL_ADVANTAGE_MULTIPLIER,
  registerElementalRules,
  getElementalRules,
  getRegisteredElementalRules,
  getElementalEfficiencyMultiplier,
  resolveElementalDamageRule,
  ensureElementalState,
  getStatus,
  hasStatus,
  upsertStatus,
  addOrRefreshEffect,
  getAvailableMagicActions,
  getAvailableElementalSkills,
  getSkillCooldownRemaining,
  setSkillCooldown,
  tickRoundTimers,
  tickOwnerTurnTimers,
  processOwnerTurnEffects,
  isGroupControlEffect,
};
