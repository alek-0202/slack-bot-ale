const { createUserIfMissing, getUser } = require('../../../services/userService');
const { getProfileStats } = require('../../../services/pokemonService');
const { getAccountLevelSnapshot, renderProgressBar } = require('../../../services/accountProgressionService');
const { getUserItemQuantity } = require('../../../services/inventoryService');
const { refreshUserEnergy, formatTimeToNextEnergy } = require('../../../services/energyService');
const { getCooldownRemainingMs, formatRemaining } = require('../../../services/captureService');

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
  const [pokeballCQty, energy] = await Promise.all([
    getUserItemQuantity(userId, 'pokeball_c'),
    refreshUserEnergy(userId),
  ]);
  const captureCooldownRemainingMs = getCooldownRemainingMs(user.last_capture_at);

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
      energyCurrent: energy.currentEnergy,
      energyMax: energy.maxEnergy,
      energyNextIn: formatTimeToNextEnergy(energy.msToNextEnergy),
      pokeballCQty,
      pokemonEssence: user.pokemonEssence || "0",
      captureCooldownRemainingMs,
      captureCooldownText: captureCooldownRemainingMs > 0 ? formatRemaining(captureCooldownRemainingMs) : 'pronto',
      pvpWins: user.pvpWins || 0,
    },
  };
}

module.exports = {
  getProfileSummary,
};
