const { parsePositiveInt } = require("../../utils/number");
const { togglePokemonFavorite, getUserPokemonById } = require("../../services/pokemonService");

module.exports = {
  name: "favpoke",
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say("Use `!favpoke <id pokemon>`.");
      return;
    }

    const pokemon = await getUserPokemonById(event.user, pokemonId);
    if (!pokemon) {
      await say("Pokémon inválido ou que não pertence a você.");
      return;
    }

    const toggled = await togglePokemonFavorite(event.user, pokemonId);
    if (!toggled) {
      await say("Não consegui atualizar o favorito agora.");
      return;
    }

    await say(
      `${toggled.is_favorite ? "⭐" : "▫️"} *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemonId}) ` +
      `${toggled.is_favorite ? "agora é favorito" : "não é mais favorito"}.`,
    );
  },
};
