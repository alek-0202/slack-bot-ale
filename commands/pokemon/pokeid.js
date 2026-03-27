const { parsePositiveInt } = require("../../utils/number");
const { createLogger } = require("../../utils/logger");
const { getOwnedPokemonById } = require("../../services/pokemonLookupService");
const { buildPokemonTypesLabel } = require("../../services/pokemonTypeService");
const { calculatePokemonStats } = require("../../services/pokemonStatsService");
const {
  buildPokemonVisualBlocks,
  buildPokemonVisualSummary,
  summarizeImageReference,
} = require("../../adapters/slack/renderers/pokemonVisualBlocks");

const logger = createLogger("command:pokeid");

const POKEID_OPEN_STATS_ACTION_ID = "pokeid_open_stats";

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
      const recalculatedStats = calculatePokemonStats({
        species,
        level: pokemon.level,
        fallbackStats: {
          attack: pokemon.attack,
          magic: pokemon.magic,
          defense: pokemon.defense,
          hp: pokemon.hp,
          speed: pokemon.speed,
        },
        ivOffsets: {
          attack_iv: pokemon.attack_iv,
          magic_iv: pokemon.magic_iv,
          defense_iv: pokemon.defense_iv,
          hp_iv: pokemon.hp_iv,
          speed_iv: pokemon.speed_iv,
        },
        shiny: Boolean(pokemon.shiny),
        shinyType: pokemon.shiny_type,
      });
      const storedHp = Number(pokemon.hp || 0);
      const storedCurrentHp = Number(pokemon.current_hp ?? storedHp);
      const recalculatedHp = Number(recalculatedStats.hp || storedHp || 1);
      const hpRatio = storedHp > 0 ? Math.min(1, Math.max(0, storedCurrentHp / storedHp)) : 1;
      const displayedCurrentHp = Math.max(0, Math.min(recalculatedHp, Math.round(recalculatedHp * hpRatio)));

      const visual = buildPokemonVisualSummary({ species, level: pokemon.level });
      const visualBlocks = await buildPokemonVisualBlocks({
        species,
        level: pokemon.level,
        shiny: pokemon.shiny,
        shinyType: pokemon.shiny_type,
      });
      logger.info("Payload visual do !pokeid preparado", {
        command: "pokeid",
        builder: "buildPokemonVisualBlocks",
        pokemonId: pokemon.id,
        speciesName: species.name,
        hasAccessory: Boolean(visualBlocks.accessory),
        accessoryImage: summarizeImageReference(visualBlocks.accessory?.image_url),
      });
      const shinyType = pokemon.shiny ? (pokemon.shiny_type === "prime" ? "prime" : "normal") : null;
      const shinyLabel = pokemon.shiny ? `\n✨ *Shiny (${shinyType})*` : "";
      const rarityLabel = species.rarity ? `\n🏅 *Raridade:* ${species.rarity}` : "";
      const typesLabel = buildPokemonTypesLabel(species.element_types)
        ? `\n🧪 ${buildPokemonTypesLabel(species.element_types)}`
        : "";
      const finalEvolutionLabel = visual.finalEvolution ? "\n👑 *Última evolução*" : "";
      const bookBonusLabel =
        Number(pokemon.book_bonus_attack || 0) +
        Number(pokemon.book_bonus_magic || 0) +
        Number(pokemon.book_bonus_defense || 0) +
        Number(pokemon.book_bonus_hp || 0) +
        Number(pokemon.book_bonus_speed || 0) > 0
          ? `\n📘 *Livro do Ancião:* ⚔️ +${pokemon.book_bonus_attack || 0} | ✨ +${pokemon.book_bonus_magic || 0} | 🛡️ +${pokemon.book_bonus_defense || 0} | ❤️ +${pokemon.book_bonus_hp || 0} | 💨 +${pokemon.book_bonus_speed || 0}`
          : "";

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
                `⚔️ *ATK:* ${recalculatedStats.attack || 0} | ✨ *MAG:* ${recalculatedStats.magic || 0}\n` +
                `🛡️ *DEF:* ${recalculatedStats.defense || 0} | ❤️ *HP:* ${displayedCurrentHp}/${recalculatedStats.hp || 0} | 💨 *SPD:* ${recalculatedStats.speed || 0}\n` +
                `⭐ *Estrelas:* ${visual.starsLabel}\n` +
                `👤 *Dono:* <@${pokemon.slack_user_id}>` +
                bookBonusLabel +
                finalEvolutionLabel +
                rarityLabel +
                typesLabel +
                shinyLabel,
            },
            ...(visualBlocks.accessory ? { accessory: visualBlocks.accessory } : {}),
          },
          ...visualBlocks.blocks,
          {
            type: "actions",
            elements: [
              {
                type: "button",
                action_id: POKEID_OPEN_STATS_ACTION_ID,
                text: { type: "plain_text", text: "Stats", emoji: true },
                value: JSON.stringify({ pokemonId: pokemon.id, ownerSlackUserId: pokemon.slack_user_id }),
              },
            ],
          },
        ],
      });
    } catch (error) {
      logger.error("Erro no !pokeid", { args, error });
      await say("Não consegui consultar esse ID agora 😵");
    }
  },
};

module.exports.POKEID_OPEN_STATS_ACTION_ID = POKEID_OPEN_STATS_ACTION_ID;
