const { createUserIfMissing } = require("../../services/userService");

module.exports = {
  name: "poke",
  async execute({ event, args, say }) {
    const subcommand = (args || "").trim().toLowerCase();

    if (subcommand !== "start") {
      await say("Use `!poke start` para iniciar sua jornada Pokémon.");
      return;
    }

    try {
      const user = await createUserIfMissing(event.user);
      await say(
        `🎒 Treinador <@${event.user}> pronto!\n` +
          `💰 Gold inicial: *${user.gold}*\n` +
          "Agora use `!capture` para capturar um Pokémon.",
      );
    } catch (error) {
      console.error("Erro no !poke start:", error.message || error);
      await say("Não consegui iniciar seu perfil agora 😵");
    }
  },
};
