const { createUserIfMissing, getUser } = require('../../../services/userService');
const { getProfileStats } = require('../../../services/pokemonService');
const { getAccountLevelSnapshot, renderProgressBar } = require('../../../services/accountProgressionService');

async function getProfileSummary({ userId, createIfMissing = false }) {
  let user = await getUser(userId);

  if (!user && createIfMissing) {
    user = await createUserIfMissing(userId);
  }

  if (!user) {
    return {
      ok: false,
      reason: 'user_not_started',
    };
  }

  const stats = await getProfileStats(userId);

  const progression = getAccountLevelSnapshot(user.account_xp || 0);

  return {
    ok: true,
    profile: {
      userId,
      gold: user.gold,
      totalCaptured: stats.totalCaptured,
      uniqueCount: stats.uniqueCount,
      accountLevel: progression.level,
      accountXp: progression.currentLevelXp,
      accountXpTotal: progression.totalXp,
      accountXpToNextLevel: progression.xpToNextLevel,
      accountXpBar: renderProgressBar(progression.currentLevelXp, progression.xpToNextLevel),
    },
  };
}

module.exports = {
  getProfileSummary,
};
