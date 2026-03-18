const { createLogger } = require("../../utils/logger");
const { extractMentionedUser } = require("../../utils/helpers");
const { findCatalogSpeciesByName } = require("../../application/useCases/pokemon/catalogLookup");
const { findUserPokemonsBySpeciesName } = require("../../services/pokemonLookupService");

const logger = createLogger("command:pokeplayer");

module.exports = {
  name: "pokeplayer",
  async execute({ args, say }) {
    try {
      const targetUserId = extractMentionedUser(args || "");
      const speciesQuery = String(args || "").replace(/<@[A-Z0-9]+>/i, "").trim();

      if (!targetUserId) {
        await say("Use `!pokeplayer @player <nomepokemon>`. Ex.: `!pokeplayer @usuario pikachu`.");
        return;
      }

      if (!speciesQuery) {
        await say("Informe também o nome do Pokémon. Ex.: `!pokeplayer @usuario pikachu`.");
        return;
      }

      const speciesResult = await findCatalogSpeciesByName(speciesQuery);
      if (!speciesResult.ok) {
        if (speciesResult.reason === "ambiguous") {
          const options = speciesResult.matches.map((match) => `${match.name} (#${match.id})`).join(", ");
          await say(`O nome *${speciesQuery}* ficou ambíguo. Possíveis resultados: ${options}.`);
          return;
        }

        await say(`Não encontrei nenhuma espécie com o nome *${speciesQuery}*.`);
        return;
      }

      const found = await findUserPokemonsBySpeciesName({
        slackUserId: targetUserId,
        speciesName: speciesResult.species.name,
      });

      logger.info("Consulta !pokeplayer executada", {
        targetUserId,
        speciesName: speciesResult.species.name,
        foundCount: found.length,
      });

      if (!found.length) {
        await say(`<@${targetUserId}> não possui nenhum *${speciesResult.species.name}* na coleção.`);
        return;
      }

      const summary = found
        .slice(0, 10)
        .map((pokemon) => `• ID ${pokemon.id} — level ${pokemon.level}${pokemon.shiny ? " — shiny" : ""}`)
        .join("\n");
      const extra = found.length > 10 ? `\n…e mais *${found.length - 10}* exemplar(es).` : "";

      await say(
        `🔎 <@${targetUserId}> possui *${found.length}* exemplar(es) de *${speciesResult.species.name}*.\n${summary}${extra}`,
      );
    } catch (error) {
      logger.error("Erro no !pokeplayer", { args, error });
      await say("Não consegui consultar a coleção desse jogador agora 😵");
    }
  },
};
