const battlesByChannel = new Map();
const activeBattleByUser = new Map();

function isUserInActiveBattle(userId) {
  return activeBattleByUser.has(userId);
}

function getUserActiveBattleChannel(userId) {
  return activeBattleByUser.get(userId) || null;
}

function getBattle(channelId) {
  return battlesByChannel.get(channelId) || null;
}

function setBattle(channelId, battle) {
  battlesByChannel.set(channelId, battle);

  if (battle?.status === "active" || battle?.status === "selecting") {
    activeBattleByUser.set(battle.challengerId, channelId);
    activeBattleByUser.set(battle.challengedId, channelId);
  }

  if (battle?.status === "finished" || battle?.status === "declined") {
    activeBattleByUser.delete(battle.challengerId);
    activeBattleByUser.delete(battle.challengedId);
  }

  return battle;
}

function clearBattle(channelId) {
  const battle = battlesByChannel.get(channelId);
  if (!battle) return;

  activeBattleByUser.delete(battle.challengerId);
  activeBattleByUser.delete(battle.challengedId);
  battlesByChannel.delete(channelId);
}

module.exports = {
  isUserInActiveBattle,
  getUserActiveBattleChannel,
  getBattle,
  setBattle,
  clearBattle,
};
