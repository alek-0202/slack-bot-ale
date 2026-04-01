const { buildFusionHud } = require('../../services/fusionService');

module.exports = {
  name: 'fusão',
  aliases: ['fusao'],
  async execute({ event, say }) {
    await say(buildFusionHud({ slackUserId: event.user }));
  },
};
