const { parsePositiveInt } = require("../../utils/number");
const { createLogger } = require("../../utils/logger");
const { buildApplyItemPreview, getPokemonBookBonuses } = require("../../services/ancientBookService");
const { buildApplyItemViewMessage } = require("../../services/slackPokemonActionService");

const logger = createLogger("command:applyitem");

module.exports = {
  name: "applyitem",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!applyitem <pokemon_id>`. Ex.: `!applyitem 25`.");
        return;
      }

      logger.info("Comando !applyitem recebido", {
        slackUserId: event.user,
        pokemonId,
      });

      const preview = await buildApplyItemPreview({ slackUserId: event.user, pokemonId });
      if (!preview.ok) {
        const map = {
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          pokemon_in_healing_station: "Esse Pokémon está na estação de cura e não pode receber Livro do Ancião agora.",
        };
        await say(map[preview.reason] || "Não consegui abrir o painel de aplicação de item agora 😵");
        return;
      }

      logger.info("HUD de !applyitem pronta", {
        slackUserId: event.user,
        pokemonId,
        booksQty: preview.booksQty,
        bonuses: getPokemonBookBonuses(preview.pokemon),
      });

      await say(buildApplyItemViewMessage({ slackUserId: event.user, preview }));
    } catch (error) {
      logger.error("Erro no !applyitem", { slackUserId: event.user, args, error });
      await say("Não consegui abrir o !applyitem agora 😵");
    }
  },
};
