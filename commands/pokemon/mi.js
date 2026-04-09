const { openItemMarket } = require('../../services/itemMarketService');

module.exports = {
  name: 'mi',
  aliases: ['marketitems'],
  async execute({ event, say }) {
    const payload = await openItemMarket({ slackUserId: event.user, channelId: event.channel });
    await say(payload);
  },
};
