const ADMIN_CLOSE_ALL_BATTLES_CONFIRM_ACTION_ID = 'admin_close_all_battles_confirm';

function createAdminCloseAllBattlesActionValue({ requestedBy }) {
  return JSON.stringify({ requestedBy: requestedBy || null });
}

function parseAdminCloseAllBattlesActionValue(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return { requestedBy: parsed.requestedBy || null };
  } catch {
    return { requestedBy: null };
  }
}

function buildAdminCloseAllBattlesConfirmationMessage({ adminSlackUserId }) {
  return {
    text: '⚠️ Confirmação para encerrar batalhas ativas',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '⚠️ *Atenção:* esta ação encerra *todas* as batalhas ativas (PvP e dungeon) e libera os Pokémon para uso novamente.',
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Somente <@${adminSlackUserId}> pode confirmar esta ação.` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: ADMIN_CLOSE_ALL_BATTLES_CONFIRM_ACTION_ID,
            style: 'danger',
            text: { type: 'plain_text', text: 'Encerrar batalhas ativas' },
            value: createAdminCloseAllBattlesActionValue({ requestedBy: adminSlackUserId }),
            confirm: {
              title: { type: 'plain_text', text: 'Confirmar encerramento' },
              text: {
                type: 'mrkdwn',
                text: 'Tem certeza que deseja encerrar todas as batalhas ativas agora?',
              },
              confirm: { type: 'plain_text', text: 'Sim, encerrar' },
              deny: { type: 'plain_text', text: 'Cancelar' },
            },
          },
        ],
      },
    ],
  };
}

module.exports = {
  ADMIN_CLOSE_ALL_BATTLES_CONFIRM_ACTION_ID,
  createAdminCloseAllBattlesActionValue,
  parseAdminCloseAllBattlesActionValue,
  buildAdminCloseAllBattlesConfirmationMessage,
};
