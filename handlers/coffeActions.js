const { createLogger } = require("../utils/logger");
const {
  COFFE_CONFIRM_ACTION_ID,
  parseCoffeActionValue,
} = require("../services/coffeCardService");

const logger = createLogger("handler:coffe-actions");
const coffePresenceByCard = new Map();

function getPresenceSet(cardId) {
  if (!coffePresenceByCard.has(cardId)) {
    coffePresenceByCard.set(cardId, new Set());
  }

  return coffePresenceByCard.get(cardId);
}

function registerCoffeActions(app) {
  app.action(COFFE_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();

    const actorUserId = body.user?.id;
    const payload = parseCoffeActionValue(action?.value);

    logger.info("Interação do botão !coffe recebida", {
      user: actorUserId,
      channel: body.channel?.id,
      messageTs: body.message?.ts,
      hasPayload: Boolean(payload),
    });

    if (!actorUserId || !payload?.cardId || !payload.channelId) {
      if (respond) {
        await respond({
          response_type: "ephemeral",
          text: "Não consegui registrar sua presença nesse coffe 😵",
        });
      }
      return;
    }

    const attendees = getPresenceSet(payload.cardId);

    if (attendees.has(actorUserId)) {
      if (respond) {
        await respond({
          response_type: "ephemeral",
          text: "Você já marcou presença nesse coffe ☕",
        });
      }
      return;
    }

    attendees.add(actorUserId);

    logger.info("Presença no coffe registrada", {
      user: actorUserId,
      channel: payload.channelId,
      cardId: payload.cardId,
      attendees: attendees.size,
    });

    await client.chat.postMessage({
      channel: payload.channelId,
      text: `<@${actorUserId}> marcou presença no coffe ☕`,
    });
  });
}

module.exports = {
  registerCoffeActions,
};
