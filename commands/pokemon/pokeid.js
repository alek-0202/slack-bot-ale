const { parsePositiveInt } = require("../../utils/number");
const { createLogger } = require("../../utils/logger");
const { getOwnedPokemonById } = require("../../services/pokemonLookupService");
const { buildPokemonTypesLabel } = require("../../services/pokemonTypeService");
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
      const visualBlocks = buildPokemonVisualBlocks({ species, level: pokemon.level });
      const shinyLabel = pokemon.shiny ? "\n✨ *Shiny*" : "";
      const rarityLabel = species.rarity ? `\n🏅 *Raridade:* ${species.rarity}` : "";
      const typesLabel = buildPokemonTypesLabel(species.element_types)
        ? `\n🧪 ${buildPokemonTypesLabel(species.element_types)}`
        : "";
      const finalEvolutionLabel = visual.finalEvolution ? "\n👑 *Última evolução*" : "";

      await say({
        text: `Consulta do Pokémon ID ${pokemonId}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `🎯 Pokémon #${pokemonId}`, emoji: true } },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*${species.name || "Pokémon"}* (#${species.id || "?"})\n` +
                `🆔 *ID da coleção:* ${pokemon.id}\n` +
                `🎚️ *Level:* ${pokemon.level}\n` +
                `⚔️ *ATK:* ${pokemon.attack || 0} | ✨ *MAG:* ${pokemon.magic ?? pokemon.attack ?? 0}\n` +
                `🛡️ *DEF:* ${pokemon.defense || 0} | ❤️ *HP:* ${pokemon.hp || 0} | 💨 *SPD:* ${pokemon.speed || 0}\n` +
                `⭐ *Estrelas:* ${visual.starsLabel}\n` +
                `👤 *Dono:* <@${pokemon.slack_user_id}>` +
                finalEvolutionLabel +
                rarityLabel +
                typesLabel +
                shinyLabel,
            },
            ...(visualBlocks.accessory ? { accessory: visualBlocks.accessory } : {}),
          },
          ...visualBlocks.blocks,
        ],
      });
    } catch (error) {
      logger.error("Erro no !pokeid", { args, error });
      await say("Não consegui consultar esse ID agora 😵");
    }
  },
};
