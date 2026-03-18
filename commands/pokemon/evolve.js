const { parsePositiveInt } = require("../../utils/number");
const { evolvePokemon } = require("../../services/evolutionService");

module.exports = {
  name: "evolve",
  async execute({ event, args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!evolve <pokemon_id>`. Ex.: `!evolve 25`.");
        return;
      }

      const result = await evolvePokemon({ slackUserId: event.user, pokemonId });

      if (!result.ok) {
        const map = {
          user_not_started: "Você ainda não começou. Use `!poke start`.",
          pokemon_not_owned: "Pokémon não encontrado ou não pertence a você.",
          no_evolution_available: "Esse Pokémon não possui evolução disponível no momento.",
          insufficient_gold: `Gold insuficiente para evoluir. Custo: *${result.cost}* | Seu gold: *${result.currentGold}*.`,
          species_stats_missing: "Os stats base da espécie atual ou da evolução ainda não foram configurados.",
        };

        await say(map[result.reason] || "Não consegui evoluir esse Pokémon agora 😵");
        return;
      }

      await say(
        `✨ *Pokémon evoluído!*\n\n` +
          `🆔 ID: *${result.pokemonId}*\n` +
          `${result.previousSpeciesName} → ${result.newSpeciesName}\n` +
          `💸 Custo: *${result.cost}* gold\n` +
          `💰 Gold restante: *${result.remainingGold}*`,
      );
    } catch (error) {
      console.error("Erro no !evolve:", error.message || error);
      await say("Não consegui evoluir agora 😵‍💫");
    }
  },
};
