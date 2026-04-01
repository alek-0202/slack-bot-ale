const { extractMentionedUser } = require('../utils/helpers');
const { isAdminSlackUser } = require('../services/adminAuthService');

function parseTargetAndQuantity(args = '') {
  const targetUserId = extractMentionedUser(args);
  const sanitized = String(args || '').replace(/<@[A-Z0-9]+>/i, ' ').trim();
  const [rawQuantity] = sanitized.split(/\s+/).filter(Boolean);
  const quantity = Number(rawQuantity);

  if (!targetUserId) return { ok: false, reason: 'invalid_target' };
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: 'invalid_quantity' };

  return { ok: true, targetUserId, quantity };
}

async function ensureAdminOrReply(event, say) {
  if (!isAdminSlackUser(event.user)) {
    await say('⛔ Apenas o administrador pode usar este comando.');
    return false;
  }
  return true;
}

module.exports = {
  parseTargetAndQuantity,
  ensureAdminOrReply,
};
