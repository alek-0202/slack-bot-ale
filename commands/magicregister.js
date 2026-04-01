const { parsePositiveInt } = require("../utils/number");
const {
  upsertPokemonMagicLoadout,
  buildMagicSummary,
  clearLegacyCharacteristicSkillsFromAllLoadouts,
} = require("../services/pokemonMagicService");
const { renderMagicRegisterElementPrompt } = require("../services/battleRenderService");
const { createLogger } = require("../utils/logger");

const logger = createLogger("command:magicregister");
let legacyCharacteristicCleanupDone = false;

module.exports = {
  name: "magicregister",
  async execute({ event, args, say }) {
    if (!legacyCharacteristicCleanupDone) {
      try {
        await clearLegacyCharacteristicSkillsFromAllLoadouts();
      } catch (error) {
        logger.error("Falha ao limpar registros legados de skills características no !magicregister", { error });
      } finally {
        legacyCharacteristicCleanupDone = true;
      }
    }

    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say("Use `!magicregister <pokeid>` com um ID válido da sua coleção.");
      return;
    }

    const result = await upsertPokemonMagicLoadout({
      slackUserId: event.user,
      pokemonId,
    });

    if (!result.ok) {
      if (result.reason === "pokemon_not_found") {
        await say("Pokémon não encontrado.");
        return;
      }

      if (result.reason === "not_owner") {
        await say("Você não pode registrar magias em Pokémon de outro usuário.");
        return;
      }

      if (result.reason === "pokemon_without_elements") {
        await say("Este Pokémon não possui elementos registrados, então ainda não pode receber magias.");
        return;
      }

      if (result.reason === "requires_element_selection") {
        await say(renderMagicRegisterElementPrompt({
          pokemon: result.pokemon,
          elements: result.allElements,
          maxSlots: result.maxSlots,
        }));
        return;
      }
    }

    await say(
      `✨ Magias registradas para *${result.pokemon.pokemon_species?.name || `Pokémon #${pokemonId}`}* (ID ${pokemonId}).\n` +
      `${buildMagicSummary(result.spells)}`,
    );
  },
};
