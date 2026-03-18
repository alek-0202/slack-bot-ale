const { createUserIfMissing, getUser } = require('../../../services/userService');
const { getProfileStats } = require('../../../services/pokemonService');

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

  return {
    ok: true,
    profile: {
      userId,
      gold: user.gold,
      totalCaptured: stats.totalCaptured,
      uniqueCount: stats.uniqueCount,
    },
  };
}

module.exports = {
  getProfileSummary,
};
