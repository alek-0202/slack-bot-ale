const { listGlobalMarket, buildGlobalMarketHud } = require('../../services/globalMarketService');
const { getCart } = require('../../services/cartService');

module.exports = {
  name: 'mgml',
  async execute({ event, say }) {
    const listings = await listGlobalMarket({ sellerUserId: event.user });
    const cart = getCart({ scope: 'global_market', userId: event.user, channelId: event.channel });
    await say(buildGlobalMarketHud({ listings, ownerFilter: event.user, cart }));
  },
};
