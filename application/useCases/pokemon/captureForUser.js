const { capturePokemon } = require('../../../services/captureService');

async function captureForUser({ userId, channelId = null, platform = null, rawText = null } = {}) {
  return capturePokemon(userId, {
    channelId,
    platform,
    rawText,
  });
}

module.exports = {
  captureForUser,
};
