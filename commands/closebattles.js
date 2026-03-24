const {
  buildAdminCloseAllBattlesConfirmationMessage,
} = require('../services/adminBattleControlViewService');

const ADMIN_SLACK_USER_ID = 'U0ABLSVUZ41';

module.exports = {
  name: 'closebattles',
  aliases: ['closebattle', 'fecharbatalhas', 'battlecloseall'],
  async execute({ event, say }) {
    if (event.user !== ADMIN_SLACK_USER_ID) {
      await say('⛔ Apenas o administrador pode usar este comando.');
      return;
    }

    await say(buildAdminCloseAllBattlesConfirmationMessage({ adminSlackUserId: ADMIN_SLACK_USER_ID }));
  },
};
