function toPlatformUserId(platform, userId) {
  if (!userId) return userId;
  if (platform === "slack") return userId;
  return `${platform}:${userId}`;
}

function toPlatformChannelId(platform, channelId) {
  if (!channelId) return channelId;
  if (platform === "slack") return channelId;
  return `${platform}:${channelId}`;
}

function fromPlatformId(platformId) {
  if (!platformId || typeof platformId !== "string") return platformId;
  const parts = platformId.split(":");
  if (parts.length < 2) return platformId;
  return parts.slice(1).join(":");
}

module.exports = {
  toPlatformUserId,
  toPlatformChannelId,
  fromPlatformId,
};
