const { resolveElementalRelation, normalizeElementName } = require("../../../services/pokemonElementsService");

const ELEMENTAL_COUNTER_REDUCTION_MULTIPLIER = 0.3;
const ELEMENTAL_ADVANTAGE_MULTIPLIER = 2;
const ELEMENTAL_NEUTRAL_MULTIPLIER = 1;
const MAX_ELEMENTAL_SKILL_SLOTS_PER_ELEMENT = 2;

const BATTLE_HOOK = {
  BEFORE_DAMAGE: "beforeDamage",
  ON_CAST: "onCast",
  ON_HIT: "onHit",
  END_OF_ROUND: "endOfRound",
};

const elementalRegistry = new Map();

function registerElementalRules(element, rules) {
  elementalRegistry.set(normalizeElementName(element), rules);
}

function getElementalRules(element) {
  return elementalRegistry.get(normalizeElementName(element)) || null;
}

function getElementalEfficiencyMultiplier(playerState) {
  const efficiency = Math.max(0, Number(playerState?.stats?.elementalChance || 0));
  return 1 + efficiency;
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
  const byRegistration = Array.isArray(playerState?.characteristicSlots) ? playerState.characteristicSlots : [];
  if (byRegistration.length) {
    return byRegistration.map((entry) => ({
      ...entry,
      kind: "elemental",
      slot: `elemental:${entry.id}`,
    }));
  }

  const level = Number(playerState?.selectedPokemon?.level || 0);
  if (level < 50) return [];

  const normalizedElements = Array.isArray(playerState?.selectedPokemon?.elementTypes)
    ? playerState.selectedPokemon.elementTypes.map((entry) => normalizeElementName(entry)).filter(Boolean)
    : [];

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
  }));
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
  }
}

module.exports = {
  BATTLE_HOOK,
  ELEMENTAL_COUNTER_REDUCTION_MULTIPLIER,
  ELEMENTAL_ADVANTAGE_MULTIPLIER,
  registerElementalRules,
  getElementalRules,
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
};
