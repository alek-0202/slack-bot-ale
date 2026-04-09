const { ensureElementalState } = require('./elementalRules');

const GLOBAL_EFFECT_IDS = Object.freeze({
  EXHAUSTION: 'exhaustion',
  FREEZE: 'ice_frozen',
  CHILL: 'global_chill',
  STUN: 'global_stun',
  EXECUTE: 'global_execute',
});

const GLOBAL_EFFECT_DEFINITIONS = Object.freeze({
  [GLOBAL_EFFECT_IDS.EXHAUSTION]: {
    id: GLOBAL_EFFECT_IDS.EXHAUSTION,
    name: 'Exaustão',
    description: 'Reduz a geração de energia em 35%.',
    gameplayDescription: 'reduz em 35% a geração de energia do alvo',
    type: 'debuff',
    energyRegenMultiplier: 0.65,
    remainingRounds: 2,
  },
  [GLOBAL_EFFECT_IDS.FREEZE]: {
    id: GLOBAL_EFFECT_IDS.FREEZE,
    name: 'Congelamento',
    description: 'Impede agir por 1 turno jogável e recebe +15% dano de gelo.',
    gameplayDescription: 'impede agir por 1 turno jogável e recebe +15% de dano de gelo',
    type: 'debuff',
    forcedSkipAction: true,
    decrementOnPlayableTurn: true,
    durationTurnsRemaining: 1,
    incomingIceDamageMultiplier: 1.15,
  },
  [GLOBAL_EFFECT_IDS.CHILL]: {
    id: GLOBAL_EFFECT_IDS.CHILL,
    name: 'Resfriamento',
    description: 'Reduz a iniciativa em 15%.',
    gameplayDescription: 'reduz a iniciativa em 15%',
    type: 'debuff',
    speedMultiplier: 0.85,
    remainingRounds: 2,
  },
  [GLOBAL_EFFECT_IDS.STUN]: {
    id: GLOBAL_EFFECT_IDS.STUN,
    name: 'Stun',
    description: 'Impede agir por 2 turnos jogáveis sem zerar iniciativa.',
    gameplayDescription: 'impede qualquer ação por 2 turnos jogáveis sem zerar iniciativa',
    type: 'debuff',
    forcedSkipAction: true,
    decrementOnPlayableTurn: true,
    durationTurnsRemaining: 2,
  },
  [GLOBAL_EFFECT_IDS.EXECUTE]: {
    id: GLOBAL_EFFECT_IDS.EXECUTE,
    name: 'Execute',
    description: 'Executa ao ficar abaixo do limiar calculado por fontes aplicadas.',
    gameplayDescription: 'acumula stacks e elimina ao atingir limiar de vida calculado',
    type: 'debuff_status',
    stackable: true,
    baseThresholdPct: 0,
    stackThresholdPct: 0.01,
    maxThresholdPct: 0.15,
  },
});

function getGlobalEffectDefinition(effectId) {
  if (!effectId) return null;
  return GLOBAL_EFFECT_DEFINITIONS[String(effectId)] || null;
}

function createGlobalEffect(effectId, overrides = {}) {
  const definition = getGlobalEffectDefinition(effectId);
  if (!definition) return { id: effectId, ...overrides };
  return { ...definition, ...overrides };
}

function applyGlobalEffect(target, effectId, overrides = {}) {
  const state = ensureElementalState(target);
  const next = createGlobalEffect(effectId, overrides);
  const index = state.effects.findIndex((entry) => entry.id === next.id && (entry.sourceUserId || null) === (next.sourceUserId || null));
  if (index >= 0) {
    state.effects[index] = { ...state.effects[index], ...next };
    return state.effects[index];
  }
  state.effects.push(next);
  return next;
}

function getExecuteStatus(target) {
  const state = ensureElementalState(target);
  state.statuses = Array.isArray(state.statuses) ? state.statuses : [];
  return state.statuses.find((entry) => entry.id === GLOBAL_EFFECT_IDS.EXECUTE) || null;
}

function ensureExecuteStatus(target) {
  const existing = getExecuteStatus(target);
  if (existing) return existing;
  const state = ensureElementalState(target);
  const def = getGlobalEffectDefinition(GLOBAL_EFFECT_IDS.EXECUTE);
  const status = {
    id: def.id,
    name: def.name,
    description: def.description,
    gameplayDescription: def.gameplayDescription,
    stacks: 0,
    maxStacks: 99,
    baseThresholdPct: 0,
    stackThresholdPct: def.stackThresholdPct,
    maxThresholdPct: def.maxThresholdPct,
  };
  state.statuses.push(status);
  return status;
}

function applyExecuteStacks(target, { stacks = 1, maxStacks = 99, baseThresholdPct = 0, stackThresholdPct = 0.01 } = {}) {
  const status = ensureExecuteStatus(target);
  const maxThresholdPct = Math.max(0, Number(status.maxThresholdPct || getGlobalEffectDefinition(GLOBAL_EFFECT_IDS.EXECUTE)?.maxThresholdPct || 0.15));
  status.maxStacks = Math.max(1, Number(maxStacks || status.maxStacks || 99));
  status.baseThresholdPct = Math.min(maxThresholdPct, Math.max(0, Number(baseThresholdPct)));
  status.stackThresholdPct = Math.max(0, Number(stackThresholdPct || status.stackThresholdPct || 0.01));
  status.maxThresholdPct = maxThresholdPct;
  status.stacks = Math.min(status.maxStacks, Math.max(0, Number(status.stacks || 0) + Math.max(0, Number(stacks || 0))));
  return status;
}

function getExecuteThresholdPct(target) {
  const status = getExecuteStatus(target);
  if (!status) return 0;
  const maxThresholdPct = Math.max(0, Number(status.maxThresholdPct || getGlobalEffectDefinition(GLOBAL_EFFECT_IDS.EXECUTE)?.maxThresholdPct || 0.15));
  const calculated = Math.max(0, Number(status.baseThresholdPct || 0) + (Math.max(0, Number(status.stacks || 0)) * Math.max(0, Number(status.stackThresholdPct || 0))));
  return Math.min(maxThresholdPct, calculated);
}

function tryExecuteTarget(target) {
  const antiExecute = (ensureElementalState(target).effects || []).some((effect) => effect.antiExecute === true && Number(effect?.remainingRounds ?? 1) > 0);
  if (antiExecute) return false;
  const thresholdPct = getExecuteThresholdPct(target);
  if (thresholdPct <= 0) return false;
  const threshold = Math.round(Number(target?.battleHp?.max || 0) * thresholdPct);
  if (Number(target?.battleHp?.current || 0) > 0 && Number(target?.battleHp?.current || 0) <= threshold) {
    target.battleHp.current = 0;
    return true;
  }
  return false;
}

module.exports = {
  GLOBAL_EFFECT_IDS,
  GLOBAL_EFFECT_DEFINITIONS,
  getGlobalEffectDefinition,
  createGlobalEffect,
  applyGlobalEffect,
  applyExecuteStacks,
  ensureExecuteStatus,
  getExecuteStatus,
  getExecuteThresholdPct,
  tryExecuteTarget,
};
