const { parsePositiveInt } = require("../../utils/number");
const { resetPokemonUpgrades } = require("../../services/resetPokemonService");
const { createLogger } = require("../../utils/logger");

const logger = createLogger("command:resetpokeid");

module.exports = {
  name: "resetpokeid",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!resetpokeid <pokemon_id>`. Ex.: `!resetpokeid 25`.");
        return;
      }

      const result = await resetPokemonUpgrades({ slackUserId: event.user, pokemonId });
      if (!result.ok) {
        const map = {
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          already_level_one: "Esse Pokémon já está no nível 1.",
          species_stats_missing: "Os stats base da espécie estão incompletos para resetar agora.",
        };
        await say(map[result.reason] || "Não consegui resetar esse Pokémon agora 😵");
        return;
      }

      const speciesName = result.pokemon?.pokemon_species?.name || "Pokémon";
      await say(
        `🔄 *Pokémon resetado com sucesso!*\n\n` +
          `*${speciesName}* (#${result.pokemon.id})\n` +
          `Nível: *${result.previousLevel}* → *${result.newLevel}*\n` +
          `Gold devolvido: *${result.refundedGold}*\n` +
          `Gold atual: *${result.remainingGold}*`,
      );
    } catch (error) {
      logger.error("Erro no !resetpokeid", { slackUserId: event.user, args, error });
      await say("Não consegui resetar os upgrades desse Pokémon agora 😵‍💫");
    }
  },
};
