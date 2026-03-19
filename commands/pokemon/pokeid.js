const { parsePositiveInt } = require("../../utils/number");
const { createLogger } = require("../../utils/logger");
const { getOwnedPokemonById } = require("../../services/pokemonLookupService");
const { buildPokemonVisualBlocks, buildPokemonVisualSummary } = require("../../adapters/slack/renderers/pokemonVisualBlocks");

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
      const visual = buildPokemonVisualSummary({ species, level: pokemon.level });
      const shinyLabel = pokemon.shiny ? " | ✨ Shiny" : "";
      const rarityLabel = species.rarity ? `\n*Raridade:* ${species.rarity}` : "";
      const typesLabel = Array.isArray(species.element_types) && species.element_types.length
        ? `\n*Tipos:* ${species.element_types.join(", ")}`
        : "";
      const visualLabels =
        `\n*Estrelas:* ${visual.starsLabel}` +
        `\n*Moldura:* ${visual.border.label}` +
        `\n*Status evolutivo:* ${visual.finalEvolution ? "👑 Última evolução" : "🧬 Ainda possui evolução"}`;

      await say({
        text: `Consulta do Pokémon ID ${pokemonId}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `Pokémon #${pokemonId}`, emoji: true } },
          ...buildPokemonVisualBlocks({ species, level: pokemon.level }).blocks,
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
                visualLabels +
                rarityLabel +
                typesLabel,
            },
          },
        ],
      });
    } catch (error) {
      logger.error("Erro no !pokeid", { args, error });
      await say("Não consegui consultar esse ID agora 😵");
    }
  },
};
