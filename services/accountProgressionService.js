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
  const { data: user, error } = await supabase
    .from('users')
    .select('slack_user_id, account_xp, account_level')
    .eq('slack_user_id', slackUserId)
    .single();
  if (error) throw error;

  const previousTotalXp = Number(user.account_xp) || 0;
  const nextTotalXp = previousTotalXp + Math.max(0, Number(xpAmount) || 0);
  const previousSnapshot = getAccountLevelSnapshot(previousTotalXp);
  const nextSnapshot = getAccountLevelSnapshot(nextTotalXp);

  const { error: updateError } = await supabase
    .from('users')
    .update({ account_xp: nextTotalXp, account_level: nextSnapshot.level })
    .eq('slack_user_id', slackUserId);
  if (updateError) throw updateError;

  return {
    ok: true,
    reason,
    grantedXp: Math.max(0, Number(xpAmount) || 0),
    previous: previousSnapshot,
    current: nextSnapshot,
    leveledUp: nextSnapshot.level > previousSnapshot.level,
    levelsGained: nextSnapshot.level - previousSnapshot.level,
  };
}

module.exports = {
  CAPTURE_ACCOUNT_XP,
  getXpRequiredForLevel,
  getAccountLevelSnapshot,
  renderProgressBar,
  grantAccountXp,
};
