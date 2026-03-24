const { capturePokemon } = require('../../../services/captureService');

async function captureForUser({
  userId,
  channelId = null,
  platform = null,
  rawText = null,
  source = 'capture',
  bypassCooldown = false,
  skipCooldownWrite = false,
} = {}) {
  return capturePokemon(userId, {
    channelId,
    platform,
    rawText,
    source,
    bypassCooldown,
    skipCooldownWrite,
  });
}

module.exports = {
  captureForUser,
};
