const {
  ADMIN_CLOSE_ALL_BATTLES_CONFIRM_ACTION_ID,
  parseAdminCloseAllBattlesActionValue,
} = require('../services/adminBattleControlViewService');
const { clearAllActiveBattles } = require('../services/battleStateStore');

const ADMIN_SLACK_USER_ID = 'U0ABLSVUZ41';

function registerAdminBattleActions(app) {
  app.action(ADMIN_CLOSE_ALL_BATTLES_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();

    const actorUserId = body.user?.id;
    const payload = parseAdminCloseAllBattlesActionValue(action.value);

    if (actorUserId !== ADMIN_SLACK_USER_ID || payload.requestedBy !== ADMIN_SLACK_USER_ID) {
      await respond({
        response_type: 'ephemeral',
        text: `Somente <@${ADMIN_SLACK_USER_ID}> pode confirmar esta ação.`,
      });
      return;
    }

    const { clearedCount } = clearAllActiveBattles();
    const text =
      clearedCount > 0
        ? `✅ Encerramento concluído. Total de batalhas ativas finalizadas: *${clearedCount}*.`
        : 'ℹ️ Não havia batalhas ativas para encerrar.';

    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text,
          },
        },
      ],
    });
  });
}

module.exports = {
  registerAdminBattleActions,
};
