const { parsePositiveInt } = require("../../utils/number");
const { togglePokemonFavorite, setPokemonFavorite, getUserPokemonById } = require("../../services/pokemonService");

function parseFavAction(rawArgs = "") {
  const safeArgs = String(rawArgs || "").trim();
  if (!safeArgs) return { mode: "toggle", pokemonId: null };

  const [firstToken, secondToken] = safeArgs.split(/\s+/, 2);
  const normalized = String(firstToken || "").toLowerCase();
  if (normalized === "remove") {
    return { mode: "remove", pokemonId: parsePositiveInt(secondToken) };
  }
  if (normalized === "add") {
    return { mode: "add", pokemonId: parsePositiveInt(secondToken) };
  }
  return { mode: "toggle", pokemonId: parsePositiveInt(safeArgs) };
}

module.exports = {
  name: "pokefav",
  aliases: ["favpoke"],
  async execute({ event, args, say }) {
    const parsed = parseFavAction(args);
    const pokemonId = parsed.pokemonId;
    if (!pokemonId) {
      await say("Use `!pokefav <id>` ou `!pokefav remove <id>`.");
      return;
    }

    const pokemon = await getUserPokemonById(event.user, pokemonId);
    if (!pokemon) {
      await say("Pokémon inválido ou que não pertence a você.");
      return;
    }

    const result = parsed.mode === "toggle"
      ? await togglePokemonFavorite(event.user, pokemonId)
      : await setPokemonFavorite(event.user, pokemonId, parsed.mode === "add");
    if (!result) {
      await say("Não consegui atualizar o favorito agora.");
      return;
    }

    await say(
      `${result.is_favorite ? "⭐" : "▫️"} *${pokemon.pokemon_species?.name || 'Pokémon'}* (#${pokemonId}) ` +
      `${result.is_favorite ? "agora é favorito" : "não é mais favorito"}.`,
    );
  },
};
