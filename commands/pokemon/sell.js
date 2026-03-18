const { parsePositiveInt } = require("../../utils/number");
const { buildSellPreviewCard, buildSellPreviewMessage } = require("../../services/slackPokemonActionService");
const { createLogger } = require("../../utils/logger");

const logger = createLogger("command:sell");

module.exports = {
  name: "sell",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!sell <pokemon_id>`. Ex.: `!sell 25`.");
        return;
      }

      const preview = await buildSellPreviewCard({ slackUserId: event.user, pokemonId });

      logger.info("Resultado do preview de !sell", {
        slackUserId: event.user,
        pokemonId,
        ok: preview.ok,
        reason: preview.reason || null,
        sellValue: preview.priceBreakdown?.finalPrice || null,
      });

      if (!preview.ok) {
        if (preview.reason === "pokemon_not_owned") {
          await say("Você só pode vender Pokémons que pertencem a você.");
          return;
        }

        await say("Não consegui preparar a venda desse Pokémon agora 😵");
        return;
      }

      await say(buildSellPreviewMessage({ slackUserId: event.user, preview }));
    } catch (error) {
      logger.error("Erro no !sell", { slackUserId: event.user, args, error });
      await say("Não consegui preparar a venda do seu Pokémon agora 😵‍💫");
    }
  },
};
