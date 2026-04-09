const { openItemMarketWithCart, ITEM_MARKET_SCOPE } = require('../../services/itemMarketService');
const { upsertMarketSession } = require('../../services/marketSessionService');

module.exports = {
  name: 'mi',
  aliases: ['marketitems'],
  async execute({ event, say }) {
    const payload = await openItemMarketWithCart({ slackUserId: event.user, channelId: event.channel });
    const marketMessage = await say(payload.marketMessage);
    const cartMessage = await say(payload.cartMessage);

    upsertMarketSession({
      scope: ITEM_MARKET_SCOPE,
      context: 'mi',
      userId: event.user,
      channelId: event.channel,
      marketMessageTs: marketMessage?.ts,
      cartMessageTs: cartMessage?.ts,
      cart: payload.cart,
    });
  },
};
