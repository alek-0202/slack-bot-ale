const { getUser } = require("../../services/userService");
const { getPokedexView, buildPokedexMessage } = require("../../services/pokedexViewService");

module.exports = {
  name: "pokedex",
  async execute({ event, say }) {
    try {
      const user = await getUser(event.user);
      if (!user) {
        await say("Você ainda não começou. Use `!poke start`.");
        return;
      }

      const view = await getPokedexView(event.user, 0);
      const message = await buildPokedexMessage({
        slackUserId: event.user,
        entry: view.entry,
        index: view.index,
        total: view.total,
      });

      await say(message);
    } catch (error) {
      console.error("Erro no !pokedex:", error.message || error);
      await say("Não consegui abrir sua Pokédex agora 😵");
    }
  },
};
