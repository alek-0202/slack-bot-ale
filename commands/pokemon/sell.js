const { parsePositiveInt } = require("../../utils/number");
const { sellPokemon } = require("../../services/sellService");

module.exports = {
  name: "sell",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!sell <pokemon_id>`. Ex.: `!sell 25`.");
        return;
      }

      const result = await sellPokemon({ slackUserId: event.user, pokemonId });

      if (!result.ok) {
        if (result.reason === "pokemon_not_owned") {
          await say("Você só pode vender Pokémons que pertencem a você.");
          return;
        }

        await say("Não consegui vender esse Pokémon agora 😵");
        return;
      }

      const speciesName = result.pokemon.pokemon_species?.name || "Pokémon";
      await say(
        `💸 *Pokémon vendido!*\n\n` +
          `${speciesName} (ID ${result.pokemon.id})\n` +
          `Level: ${result.pokemon.level}\n\n` +
          `Você recebeu: *${result.goldReceived}* gold\n` +
          `Seu gold atual: *${result.currentGold}*`,
      );
    } catch (error) {
      console.error("Erro no !sell:", error.message || error);
      await say("Não consegui vender seu Pokémon agora 😵‍💫");
    }
  },
};
