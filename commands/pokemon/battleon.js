const { parsePositiveInt } = require("../../utils/number");
const { updatePokemonBattleAvailability, getUserPokemonById } = require("../../services/pokemonService");

module.exports = {
  name: "battleon",
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say("Use `!battleon <id pokemon>`.");
      return;
    }

    const pokemon = await getUserPokemonById(event.user, pokemonId);
    if (!pokemon) {
      await say("Pokémon inválido ou que não pertence a você.");
      return;
    }

    const result = await updatePokemonBattleAvailability(event.user, pokemonId, true);
    await say(result?.is_battle_available
      ? `✅ *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemonId}) marcado como disponível para batalha.`
      : `⚠️ Não consegui atualizar a disponibilidade do Pokémon #${pokemonId}.`);
  },
};
