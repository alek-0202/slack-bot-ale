const {
  MARKET_CHANGE_CONFIRM_ACTION_ID,
  parseMarketChangeActionValue,
  buildMarketChangeSlackMessage,
} = require("../services/marketChangeViewService");
const { confirmDailyMarketChange } = require("../application/useCases/market/changeDailyMarket");

function registerMarketActions(app) {
  app.action(MARKET_CHANGE_CONFIRM_ACTION_ID, async ({ ack, body, action, client, respond }) => {
    await ack();

    try {
      const payload = parseMarketChangeActionValue(action.value);
      const actorUserId = body.user?.id;

      const result = await confirmDailyMarketChange({
        userId: actorUserId,
        channelId: payload.channelId || body.channel?.id,
      });

      if (result.status === "already_confirmed") {
        await respond({
          response_type: "ephemeral",
          text: "Você já confirmou essa troca manual de market.",
        });
        return;
      }

      if (result.status === "already_used_today") {
        await respond({
          response_type: "ephemeral",
          text: "A troca manual do market de hoje já foi utilizada.",
        });
        return;
      }

      if (result.status === "no_active_request") {
        await respond({
          response_type: "ephemeral",
          text: "Não existe pedido ativo de troca manual do market neste canal.",
        });
        return;
      }

      const message = buildMarketChangeSlackMessage({ result });
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: message.text,
        blocks: message.blocks,
      });
    } catch (error) {
      console.error("Erro na confirmação do market change:", error.message || error);
      if (respond) {
        await respond({
          response_type: "ephemeral",
          text: "Não consegui registrar essa confirmação do market 😵",
        });
      }
    }
  });
}

module.exports = {
  registerMarketActions,
};
