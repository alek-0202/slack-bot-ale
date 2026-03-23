const { parsePositiveIntList } = require("../../utils/number");
const { buildSellPreviewCard, buildSellPreviewMessage } = require("../../services/slackPokemonActionService");
const { createLogger } = require("../../utils/logger");

const logger = createLogger("command:sell");

module.exports = {
  name: "sell",
  async execute({ event, args, say }) {
    try {
      const pokemonIds = parsePositiveIntList(args);
      if (!pokemonIds.length) {
        await say("Use `!sell <pokemon_id[,pokemon_id,...]>`. Ex.: `!sell 25` ou `!sell 23,45,534`.");
        return;
      }

      const preview = await buildSellPreviewCard({ slackUserId: event.user, pokemonIds });

      logger.info("Resultado do preview de !sell", {
        slackUserId: event.user,
        pokemonIds,
        ok: preview.ok,
        reason: preview.reason || null,
        sellValue: preview.totalSellPrice || preview.priceBreakdown?.finalPrice || null,
      });

      if (!preview.ok) {
        if (preview.reason === "pokemon_not_owned") {
          const invalidIds = preview.missingIds?.length ? ` IDs: ${preview.missingIds.join(", ")}.` : "";
          await say(`Você só pode vender Pokémons que pertencem a você.${invalidIds}`);
          return;
        }

        await say("Não consegui preparar a venda desse(s) Pokémon(s) agora 😵");
        return;
      }

      await say(buildSellPreviewMessage({ slackUserId: event.user, preview }));
    } catch (error) {
      logger.error("Erro no !sell", { slackUserId: event.user, args, error });
      await say("Não consegui preparar a venda do seu Pokémon agora 😵‍💫");
    }
  },
};
