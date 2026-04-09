const { getSupabaseClient } = require('../database/supabase');
const { createUserIfMissing } = require('./userService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('service:energy');

const DEFAULT_MAX_ENERGY = 5;
const ENERGY_REGEN_MS = 2 * 60 * 60 * 1000;

function clampEnergy(value, maxEnergy) {
  return Math.max(0, Math.min(Number(maxEnergy) || DEFAULT_MAX_ENERGY, Number(value) || 0));
}

function isSameUtcDay(left, right) {
  if (!(left instanceof Date) || Number.isNaN(left.getTime())) return false;
  if (!(right instanceof Date) || Number.isNaN(right.getTime())) return false;
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

function calculateEnergyState({ currentEnergy, maxEnergy, lastEnergyUpdate, now = new Date() }) {
  const safeNow = now instanceof Date ? now : new Date(now);
  const safeMax = Math.max(1, Number(maxEnergy) || DEFAULT_MAX_ENERGY);
  const parsedLast = lastEnergyUpdate ? new Date(lastEnergyUpdate) : null;

  let nextEnergy = clampEnergy(currentEnergy ?? safeMax, safeMax);
  let nextLastUpdate = parsedLast && !Number.isNaN(parsedLast.getTime()) ? parsedLast : safeNow;
  let regenerated = 0;
  let resetApplied = false;

  if (!isSameUtcDay(nextLastUpdate, safeNow)) {
    nextEnergy = safeMax;
    nextLastUpdate = safeNow;
    resetApplied = true;
  } else if (nextEnergy < safeMax) {
    const elapsedMs = Math.max(0, safeNow.getTime() - nextLastUpdate.getTime());
    const regenPoints = Math.floor(elapsedMs / ENERGY_REGEN_MS);
    if (regenPoints > 0) {
      regenerated = Math.min(regenPoints, safeMax - nextEnergy);
      nextEnergy += regenerated;
      nextLastUpdate = new Date(nextLastUpdate.getTime() + (regenPoints * ENERGY_REGEN_MS));
      if (nextEnergy >= safeMax) nextLastUpdate = safeNow;
    }
  }

  const msToNextEnergy = nextEnergy >= safeMax
    ? 0
    : Math.max(0, ENERGY_REGEN_MS - ((safeNow.getTime() - nextLastUpdate.getTime()) % ENERGY_REGEN_MS));

  return {
    currentEnergy: clampEnergy(nextEnergy, safeMax),
    maxEnergy: safeMax,
    lastEnergyUpdate: nextLastUpdate.toISOString(),
    regenerated,
    resetApplied,
    msToNextEnergy,
  };
}

async function refreshUserEnergy(slackUserId, { persist = true, now = new Date() } = {}) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const { data: user, error } = await supabase
    .from('users')
    .select('slack_user_id, current_energy, max_energy, last_energy_update')
    .eq('slack_user_id', slackUserId)
    .single();
  if (error) throw error;

  const computed = calculateEnergyState({
    currentEnergy: user.current_energy,
    maxEnergy: user.max_energy,
    lastEnergyUpdate: user.last_energy_update,
    now,
  });

  const shouldPersist = persist && (
    Number(user.current_energy) !== computed.currentEnergy
    || Number(user.max_energy) !== computed.maxEnergy
    || String(user.last_energy_update || '') !== String(computed.lastEnergyUpdate)
  );

  if (shouldPersist) {
    const { error: updateError } = await supabase
      .from('users')
      .update({
        current_energy: computed.currentEnergy,
        max_energy: computed.maxEnergy,
        last_energy_update: computed.lastEnergyUpdate,
      })
      .eq('slack_user_id', slackUserId);
    if (updateError) throw updateError;

    if (computed.regenerated > 0 || computed.resetApplied) {
      logger.info('Energia do usuário sincronizada por regeneração/reset', {
        file: 'services/energyService.js',
        method: 'refreshUserEnergy',
        slackUserId,
        regenerated: computed.regenerated,
        resetApplied: computed.resetApplied,
        currentEnergy: computed.currentEnergy,
        maxEnergy: computed.maxEnergy,
      });
    }
  }

  return computed;
}

async function consumeDungeonEnergy(slackUserId, amount = 1) {
  const cost = Math.max(1, Number(amount) || 1);
  const snapshot = await refreshUserEnergy(slackUserId);

  if (snapshot.currentEnergy < cost) {
    logger.info('Entrada de dungeon bloqueada por falta de energia', {
      file: 'services/energyService.js',
      method: 'consumeDungeonEnergy',
      slackUserId,
      required: cost,
      currentEnergy: snapshot.currentEnergy,
      maxEnergy: snapshot.maxEnergy,
    });
    return { ok: false, reason: 'insufficient_energy', energy: snapshot };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .update({ current_energy: snapshot.currentEnergy - cost, last_energy_update: snapshot.lastEnergyUpdate })
    .eq('slack_user_id', slackUserId)
    .gte('current_energy', cost)
    .select('slack_user_id, current_energy, max_energy, last_energy_update')
    .single();

  if (error || !data) {
    const refreshed = await refreshUserEnergy(slackUserId);
    if (refreshed.currentEnergy < cost) {
      return { ok: false, reason: 'insufficient_energy', energy: refreshed };
    }
    throw error || new Error('Não foi possível consumir energia agora.');
  }

  logger.info('Energia consumida para dungeon', {
    file: 'services/energyService.js',
    method: 'consumeDungeonEnergy',
    slackUserId,
    consumed: cost,
    previousEnergy: snapshot.currentEnergy,
    currentEnergy: data.current_energy,
    maxEnergy: data.max_energy,
  });

  return {
    ok: true,
    energy: {
      currentEnergy: Number(data.current_energy) || 0,
      maxEnergy: Number(data.max_energy) || DEFAULT_MAX_ENERGY,
      lastEnergyUpdate: data.last_energy_update,
    },
  };
}

async function resetUserEnergy(slackUserId) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('max_energy')
    .eq('slack_user_id', slackUserId)
    .single();
  if (error) throw error;
  const maxEnergy = Math.max(1, Number(data?.max_energy) || DEFAULT_MAX_ENERGY);
  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('users')
    .update({ current_energy: maxEnergy, last_energy_update: nowIso })
    .eq('slack_user_id', slackUserId)
    .select('current_energy, max_energy')
    .single();
  if (updateError) throw updateError;
  return {
    ok: true,
    currentEnergy: Number(updated.current_energy) || maxEnergy,
    maxEnergy: Number(updated.max_energy) || maxEnergy,
  };
}

function formatTimeToNextEnergy(msToNextEnergy) {
  const totalSeconds = Math.ceil((Number(msToNextEnergy) || 0) / 1000);
  if (totalSeconds <= 0) return 'cheia';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

module.exports = {
  DEFAULT_MAX_ENERGY,
  ENERGY_REGEN_MS,
  calculateEnergyState,
  refreshUserEnergy,
  consumeDungeonEnergy,
  resetUserEnergy,
  formatTimeToNextEnergy,
};
