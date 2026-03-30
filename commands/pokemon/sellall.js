const { buildSellPreviewCard, buildSellPreviewMessage } = require("../../services/slackPokemonActionService");
const { createLogger } = require("../../utils/logger");

const logger = createLogger("command:sellall");

module.exports = {
  name: "sellall",
  async execute({ event, say }) {
    try {
      const preview = await buildSellPreviewCard({ slackUserId: event.user, sellAll: true });

      logger.info("Resultado do preview de !sellall", {
        slackUserId: event.user,
        ok: preview.ok,
        reason: preview.reason || null,
        totalSellPrice: preview.totalSellPrice || null,
        totalEssenceReceived: preview.totalEssenceReceived || null,
        totalCount: preview.totalCount || 0,
        ignoredCount: preview.ignoredCount || 0,
      });

      if (!preview.ok) {
        if (preview.reason === "no_sellable_pokemon") {
          await say(
            `Não há Pokémons elegíveis para venda no !sellall. Ignorados: *${preview.ignoredCount || 0}* (favoritos: *${preview.favoriteIgnoredCount || 0}*, bloqueados: *${preview.blockedCount || 0}*).`,
          );
          return;
        }

        await say("Não consegui preparar o !sellall agora 😵");
        return;
      }

      await say(buildSellPreviewMessage({ slackUserId: event.user, preview }));
    } catch (error) {
      logger.error("Erro no !sellall", { slackUserId: event.user, error });
      await say("Não consegui preparar a venda em lote do !sellall agora 😵‍💫");
    }
  },
};
