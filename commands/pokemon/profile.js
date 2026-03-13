const { getUser } = require("../../services/userService");
const { getProfileStats } = require("../../services/pokemonService");

module.exports = {
  name: "profile",
  async execute({ event, say }) {
    try {
      const user = await getUser(event.user);
      if (!user) {
        await say("Você ainda não começou. Use `!poke start`.");
        return;
      }

      const stats = await getProfileStats(event.user);

      await say(
        `📋 Perfil de <@${event.user}>\n` +
          `💰 Gold: *${user.gold}*\n` +
          `🎯 Total capturado: *${stats.totalCaptured}*\n` +
          `📘 Pokédex descoberta: *${stats.uniqueCount}*`,
      );
    } catch (error) {
      console.error("Erro no !profile:", error.message || error);
      await say("Não consegui carregar seu perfil 😵");
    }
  },
};
