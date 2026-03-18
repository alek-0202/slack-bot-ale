const {
  buildSpeciesMessage,
  getSpeciesView,
} = require("../../services/speciesCatalogViewService");
const { findCatalogSpeciesByName } = require("../../application/useCases/pokemon/catalogLookup");

module.exports = {
  name: "pokename",
  async execute({ event, args, say }) {
    try {
      const query = (args || "").trim();

      if (!query) {
        await say("Use `!pokename <nomepokemon>`. Ex.: `!pokename pikachu`.");
        return;
      }

      const result = await findCatalogSpeciesByName(query);

      if (!result.ok) {
        if (result.reason === "ambiguous") {
          const options = result.matches.map((match) => `${match.name} (#${match.id})`).join(", ");
          await say(`A busca por *${query}* ficou ambígua. Seja mais específico. Possíveis resultados: ${options}.`);
          return;
        }

        await say(`Não encontrei nenhuma espécie no catálogo global com o nome *${query}*.`);
        return;
      }

      const view = await getSpeciesView(result.index, result.speciesIds);
      const message = buildSpeciesMessage({
        slackUserId: event.user,
        entry: view.entry,
        index: view.index,
        total: view.total,
        speciesIds: view.speciesIds,
      });

      await say(message);
    } catch (error) {
      console.error("Erro no !pokename:", error.message || error);
      await say("Não consegui consultar esse Pokémon agora 😵");
    }
  },
};
