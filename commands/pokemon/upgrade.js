const { parsePositiveInt } = require("../../utils/number");
const { upgradePokemonForUser } = require("../../application/useCases/pokemon/upgradePokemonForUser");
const { getUpgradeCost, MAX_LEVEL } = require("../../services/upgradeService");
const { renderSlackUpgradeResult } = require("../../adapters/slack/renderers/sharedPokemonRenderer");

module.exports = {
  name: "upgrade",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!upgrade <pokemon_id>`. Ex.: `!upgrade 123`.");
        return;
      }

      const result = await upgradePokemonForUser({ userId: event.user, pokemonId });

      await say(
        renderSlackUpgradeResult({
          result,
          slackUserId: event.user,
          maxLevel: MAX_LEVEL,
          getNextUpgradeCost: getUpgradeCost,
        }),
      );
    } catch (error) {
      console.error("Erro no !upgrade:", error.message || error);
      await say("Não consegui aplicar upgrade agora 😵");
    }
  },
};
