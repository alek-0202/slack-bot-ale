const { getSupabaseClient } = require('../database/supabase');

const CAPTURE_ACCOUNT_XP = {
  common: 15,
  uncommon: 25,
  rare: 50,
  epic: 100,
  legendary: 300,
  mythical: 1000,
};

function getXpRequiredForLevel(level) {
  const safeLevel = Math.max(1, Number(level) || 1);
  return 100 + (safeLevel - 1) * 50;
}

function getAccountLevelSnapshot(totalXp = 0) {
  let level = 1;
  let remainingXp = Math.max(0, Number(totalXp) || 0);
  let required = getXpRequiredForLevel(level);

  while (remainingXp >= required) {
    remainingXp -= required;
    level += 1;
    required = getXpRequiredForLevel(level);
  }

  return {
    level,
    totalXp: Math.max(0, Number(totalXp) || 0),
    currentLevelXp: remainingXp,
    xpToNextLevel: required,
    progressRatio: required > 0 ? remainingXp / required : 0,
  };
}

function renderProgressBar(current, total, size = 10) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.max(0, Math.min(safeTotal, Number(current) || 0));
  const filled = Math.round((safeCurrent / safeTotal) * size);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, size - filled))}`;
}

async function grantAccountXp(slackUserId, xpAmount, reason = 'system') {
  const supabase = getSupabaseClient();
  const grantedXp = Math.max(0, Number(xpAmount) || 0);
  const { data, error } = await supabase.rpc('grant_account_xp', {
    p_slack_user_id: slackUserId,
    p_xp_amount: grantedXp,
    p_reason: reason,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  const previousSnapshot = getAccountLevelSnapshot(row?.previous_total_xp || 0);
  const nextSnapshot = getAccountLevelSnapshot(row?.current_total_xp || 0);

  return {
    ok: true,
    reason,
    grantedXp,
    previous: previousSnapshot,
    current: nextSnapshot,
    leveledUp: Boolean(row?.leveled_up),
    levelsGained: Number(row?.levels_gained) || 0,
  };
}

module.exports = {
  CAPTURE_ACCOUNT_XP,
  getXpRequiredForLevel,
  getAccountLevelSnapshot,
  renderProgressBar,
  grantAccountXp,
};
