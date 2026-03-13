const DEFAULT_COMMAND_COOLDOWN_MS = 3000;

const cooldowns = new Map();

function buildCooldownKey({ user, channel, command }) {
  return `${channel}:${user}:${command}`;
}

function isOnCooldown({
  user,
  channel,
  command,
  durationMs = DEFAULT_COMMAND_COOLDOWN_MS,
}) {
  const key = buildCooldownKey({ user, channel, command });
  const now = Date.now();
  const expiresAt = cooldowns.get(key);

  if (expiresAt && now < expiresAt) {
    return true;
  }

  cooldowns.set(key, now + durationMs);
  return false;
}

function clearExpiredCooldowns() {
  const now = Date.now();

  for (const [key, expiresAt] of cooldowns.entries()) {
    if (expiresAt <= now) {
      cooldowns.delete(key);
    }
  }
}

module.exports = {
  DEFAULT_COMMAND_COOLDOWN_MS,
  isOnCooldown,
  clearExpiredCooldowns,
};
