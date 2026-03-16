const { parsePositiveInt } = require("../../utils/number");
const { upgradePokemon, getUpgradeCost, MAX_LEVEL } = require("../../services/upgradeService");

module.exports = {
  name: "upgrade",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!upgrade <pokemon_id>`. Ex.: `!upgrade 123`.");
        return;
      }

      const result = await upgradePokemon({ slackUserId: event.user, pokemonId });

      if (!result.ok) {
        if (result.reason === "pokemon_not_owned") {
          await say("Você só pode melhorar Pokémons que pertencem a você.");
          return;
        }

        if (result.reason === "max_level") {
          await say(`Esse Pokémon já atingiu o nível máximo (${MAX_LEVEL}).`);
          return;
        }

        if (result.reason === "insufficient_gold") {
          await say(
            `Gold insuficiente. Custo para próximo upgrade: *${result.cost}*. Seu saldo atual: *${result.currentGold}*.`,
          );
          return;
        }

        await say("Não consegui melhorar esse Pokémon agora 😵");
        return;
      }

      const speciesName = result.pokemon.pokemon_species?.name || "Pokémon";
      const nextUpgradeCost =
        result.newLevel >= MAX_LEVEL ? "MAX" : `${getUpgradeCost(result.newLevel)} gold`;

      await say(
        `🛠️ *${speciesName}* (#${result.pokemon.id}) melhorado com sucesso!\n` +
          `📈 Nível: *${result.previousLevel}* → *${result.newLevel}*\n` +
          `💸 Custo pago: *${result.cost}* gold\n` +
          `💰 Gold restante: *${result.remainingGold}*\n` +
          `🔜 Próximo upgrade: *${nextUpgradeCost}*`,
      );
    } catch (error) {
      console.error("Erro no !upgrade:", error.message || error);
      await say("Não consegui aplicar upgrade agora 😵");
    }
  },
};
