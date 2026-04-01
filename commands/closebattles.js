const {
  buildAdminCloseAllBattlesConfirmationMessage,
} = require('../services/adminBattleControlViewService');
const { ADMIN_SLACK_USER_ID, isAdminSlackUser } = require('../services/adminAuthService');

module.exports = {
  name: 'closebattles',
  aliases: ['closebattle', 'fecharbatalhas', 'battlecloseall'],
  async execute({ event, say }) {
    if (!isAdminSlackUser(event.user)) {
      await say('⛔ Apenas o administrador pode usar este comando.');
      return;
    }

    await say(buildAdminCloseAllBattlesConfirmationMessage({ adminSlackUserId: ADMIN_SLACK_USER_ID }));
  },
};
