const { parsePositiveInt } = require("../../utils/number");
const { createLogger } = require("../../utils/logger");
const { getOwnedPokemonById } = require("../../services/pokemonLookupService");

const logger = createLogger("command:pokeid");

module.exports = {
  name: "pokeid",
  async execute({ args, say }) {
    try {
      const pokemonId = parsePositiveInt(args);
      if (!pokemonId) {
        await say("Use `!pokeid <id>`. Ex.: `!pokeid 25`.");
        return;
      }

      const pokemon = await getOwnedPokemonById(pokemonId);
      logger.info("Consulta !pokeid executada", {
        pokemonId,
        found: Boolean(pokemon),
      });

      if (!pokemon) {
        await say(`Não encontrei nenhum Pokémon de coleção com o ID *${pokemonId}*.`);
        return;
      }

      const species = pokemon.pokemon_species || {};
      const shinyLabel = pokemon.shiny ? " | ✨ Shiny" : "";
      const rarityLabel = species.rarity ? `\n*Raridade:* ${species.rarity}` : "";
      const typesLabel = Array.isArray(species.element_types) && species.element_types.length
        ? `\n*Tipos:* ${species.element_types.join(", ")}`
        : "";

      await say({
        text: `Consulta do Pokémon ID ${pokemonId}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `Pokémon #${pokemonId}`, emoji: true } },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Espécie:* ${species.name || "Pokémon"}${shinyLabel}\n` +
                `*Level:* ${pokemon.level}\n` +
                `*ID da coleção:* ${pokemon.id}\n` +
                `*Species ID:* ${pokemon.species_id}\n` +
                `*Dono:* <@${pokemon.slack_user_id}>` +
                rarityLabel +
                typesLabel,
            },
            accessory: species.sprite_url
              ? { type: "image", image_url: species.sprite_url, alt_text: species.name || "Pokémon" }
              : undefined,
          },
        ],
      });
    } catch (error) {
      logger.error("Erro no !pokeid", { args, error });
      await say("Não consegui consultar esse ID agora 😵");
    }
  },
};
