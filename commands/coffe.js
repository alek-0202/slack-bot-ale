const { createLogger } = require("../utils/logger");
const { buildCoffeCardMessage } = require("../services/coffeCardService");

const logger = createLogger("command:coffe");

module.exports = {
  name: "coffe",
  async execute({ event, say }) {
    const cardId = `${event.channel || "unknown"}:${Date.now()}`;

    logger.info("Executando comando !coffe", {
      user: event.user,
      channel: event.channel,
      cardId,
    });

    try {
      const message = buildCoffeCardMessage({
        channelId: event.channel,
        actorUserId: event.user,
        cardId,
      });

      logger.info("Card coffe montado", {
        user: event.user,
        channel: event.channel,
        cardId,
        pokemon: message.metadata?.pokemon?.name,
      });

      await say({
        text: message.text,
        blocks: message.blocks,
      });
    } catch (error) {
      logger.error("Falha ao renderizar card do comando !coffe", {
        user: event.user,
        channel: event.channel,
        error,
      });

      await say("☕ Não consegui montar o card agora, mas o coffe está confirmado em `de sempre`.");
    }
  },
};
