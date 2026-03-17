const { buildSpeciesMessage, getSpeciesView } = require("../../services/speciesCatalogViewService");

module.exports = {
  name: "pokeall",
  async execute({ event, say }) {
    try {
      const view = await getSpeciesView(0);
      const message = buildSpeciesMessage({
        slackUserId: event.user,
        entry: view.entry,
        index: view.index,
        total: view.total,
        speciesIds: view.speciesIds,
      });

      await say(message);
    } catch (error) {
      console.error("Erro no !pokeall:", error.message || error);
      await say("Não consegui abrir o catálogo global agora 😵");
    }
  },
};
