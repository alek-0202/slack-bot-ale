const { createLogger } = require("../utils/logger");
const { decideInvite } = require("../services/battleService");
const {
  BATTLE_ACCEPT_ACTION_ID,
  BATTLE_DECLINE_ACTION_ID,
} = require("../services/battleRenderService");

const logger = createLogger("battle-actions");

function parseValue(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed;
  } catch (_error) {
    return {};
  }
}

function registerBattleActions(app) {
  const handler = async ({ ack, action, body, say, respond }) => {
    await ack();

    const payload = parseValue(action?.value);
    const channelId = payload.channelId || body.channel?.id;

    if (!channelId) {
      logger.warn("Ação de batalha sem channelId", { actionId: action?.action_id });
      if (respond) {
        await respond({
          response_type: "ephemeral",
          text: "Não consegui identificar o canal desse desafio.",
        });
      }
      return;
    }

    const decision = action.action_id === BATTLE_ACCEPT_ACTION_ID ? "accept" : "decline";
    logger.info("Ação de convite PvP recebida", {
      channelId,
      actorUserId: body.user?.id,
      decision,
    });

    await decideInvite({
      channelId,
      actorUserId: body.user?.id,
      decision,
      say,
    });
  };

  app.action(BATTLE_ACCEPT_ACTION_ID, handler);
  app.action(BATTLE_DECLINE_ACTION_ID, handler);
}

module.exports = {
  registerBattleActions,
};
