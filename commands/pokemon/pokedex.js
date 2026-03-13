const { getUser } = require("../../services/userService");
const { getProfileStats } = require("../../services/pokemonService");

module.exports = {
  name: "pokedex",
  async execute({ event, say }) {
    try {
      const user = await getUser(event.user);
      if (!user) {
        await say("Você ainda não começou. Use `!poke start`.");
        return;
      }

      const stats = await getProfileStats(event.user);
      await say(`📘 <@${event.user}>, você já descobriu *${stats.uniqueCount}* Pokémon diferentes.`);
    } catch (error) {
      console.error("Erro no !pokedex:", error.message || error);
      await say("Não consegui abrir sua Pokédex agora 😵");
    }
  },
};
