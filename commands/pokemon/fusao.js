const { buildFusionHud, getFusionHudResources } = require('../../services/fusionService');

module.exports = {
  name: 'fusão',
  aliases: ['fusao'],
  async execute({ event, say }) {
    const resources = await getFusionHudResources(event.user);
    await say(buildFusionHud({ slackUserId: event.user, resources }));
  },
};
