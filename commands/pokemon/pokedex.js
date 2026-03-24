const { getUser } = require("../../services/userService");
const { getPokedexView, buildPokedexMessage } = require("../../services/pokedexViewService");
const { createLogger } = require("../../utils/logger");

const logger = createLogger("command:pokedex");

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
      logger.error("Falha ao renderizar mensagem !pokedex", {
        command: "pokedex",
        error,
      });
      await say("Não consegui abrir sua Pokédex agora 😵");
    }
  },
};
