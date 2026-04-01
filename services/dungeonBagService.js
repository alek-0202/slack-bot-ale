const { addItem, removeItem, getUserItemQuantity } = require('./inventoryService');
const { grantFarmDungeonLevel60Reward } = require('./dungeonService');

const DUNGEON_60_BAG_ITEM_KEY = 'dungeon_60_supply_bag';

async function openDungeon60RewardBag(slackUserId) {
  const quantity = await getUserItemQuantity(slackUserId, DUNGEON_60_BAG_ITEM_KEY);
  if (quantity <= 0) {
    return { ok: false, reason: 'bag_not_found' };
  }

  const consumeResult = await removeItem(slackUserId, DUNGEON_60_BAG_ITEM_KEY, 1);
  if (!consumeResult.ok) {
    return { ok: false, reason: consumeResult.reason || 'consume_failed' };
  }

  try {
    const rewards = await grantFarmDungeonLevel60Reward({
      slackUserId,
      transactionType: 'dungeon_60_bag_open_reward',
    });
    return { ok: true, rewards };
  } catch (error) {
    await addItem(slackUserId, DUNGEON_60_BAG_ITEM_KEY, 1);
    throw error;
  }
}

module.exports = {
  DUNGEON_60_BAG_ITEM_KEY,
  openDungeon60RewardBag,
};
