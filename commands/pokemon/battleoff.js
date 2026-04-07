const { parsePositiveInt } = require("../../utils/number");
const { updatePokemonBattleAvailability, getUserPokemonById } = require("../../services/pokemonService");

module.exports = {
  name: "battleoff",
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say("Use `!battleoff <id pokemon>`.");
      return;
    }

    const pokemon = await getUserPokemonById(event.user, pokemonId);
    if (!pokemon) {
      await say("Pokémon inválido ou que não pertence a você.");
      return;
    }

    const result = await updatePokemonBattleAvailability(event.user, pokemonId, false);
    await say(result && result.is_battle_available === false
      ? `✅ *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemonId}) foi desabilitado da sua lista de batalha.`
      : `⚠️ Não consegui atualizar a disponibilidade do Pokémon #${pokemonId}.`);
  },
};
