const { parsePositiveInt } = require("../../utils/number");
const { createLogger } = require("../../utils/logger");
const {
  buildEvolvePreview,
  buildEvolvePreviewMessage,
  buildEvolveUnavailableMessage,
} = require("../../services/slackPokemonActionService");

const logger = createLogger("command:evolve");

module.exports = {
  name: "evolve",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!evolve <pokemon_id>`. Ex.: `!evolve 25`.");
        return;
      }

      const preview = await buildEvolvePreview({ slackUserId: event.user, pokemonId });

      logger.info("Resultado do preview de !evolve", {
        slackUserId: event.user,
        pokemonId,
        ok: preview.ok,
        reason: preview.reason || null,
        cost: preview.cost || null,
      });

      if (!preview.ok) {
        const map = {
          user_not_started: "Você ainda não começou. Use `!poke start`.",
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          pokemon_in_healing_station: "Esse Pokémon está na estação de cura e não pode evoluir agora.",
          species_stats_missing: "Os dados da próxima evolução estão incompletos no momento.",
        };

        if (preview.reason === "no_evolution_available") {
          await say(buildEvolveUnavailableMessage({ slackUserId: event.user, preview }));
          return;
        }

        await say(map[preview.reason] || "Não consegui preparar essa evolução agora 😵");
        return;
      }

      await say(buildEvolvePreviewMessage({ slackUserId: event.user, preview }));
    } catch (error) {
      logger.error("Erro no !evolve", { slackUserId: event.user, args, error });
      await say("Não consegui preparar a evolução agora 😵‍💫");
    }
  },
};
