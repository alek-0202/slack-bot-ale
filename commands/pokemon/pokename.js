const {
  buildSpeciesMessage,
  findSpeciesByName,
  getSpeciesView,
} = require("../../services/speciesCatalogViewService");

module.exports = {
  name: "pokename",
  async execute({ event, args, say }) {
    try {
      const query = (args || "").trim();

      if (!query) {
        await say("Use `!pokename <nomepokemon>`. Ex.: `!pokename pikachu`.");
        return;
      }

      const match = await findSpeciesByName(query);

      if (!match) {
        await say(`Não encontrei nenhuma espécie no catálogo global com o nome *${query}*.`);
        return;
      }

      const view = await getSpeciesView(match.index, match.speciesIds);
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
