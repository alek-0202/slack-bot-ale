const { getUser } = require("../../services/userService");
const { getPokedexView, buildPokedexMessage } = require("../../services/pokedexViewService");
const { createLogger } = require("../../utils/logger");

const logger = createLogger("command:pa");

module.exports = {
  name: "pa",
  aliases: ["pokeattributes", "pokeatributes"],
  async execute({ app, event, say }) {
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
        mode: "pa",
        slackClient: app?.client || null,
        channelId: event.channel,
        commandName: "pa",
      });

      await say(message);
    } catch (error) {
      logger.error("Falha ao renderizar mensagem !pa", {
        command: "pa",
        error,
      });
      await say("Não consegui abrir seus atributos da Pokédex agora 😵");
    }
  },
};
