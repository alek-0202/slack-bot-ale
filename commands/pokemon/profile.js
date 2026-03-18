const { getProfileSummary } = require("../../application/useCases/pokemon/getProfileSummary");
const { renderSlackProfileSummary } = require("../../adapters/slack/renderers/sharedPokemonRenderer");

module.exports = {
  name: "profile",
  async execute({ event, say }) {
    try {
      const result = await getProfileSummary({ userId: event.user });
      if (!result.ok) {
        await say("Você ainda não começou. Use `!poke start`.");
        return;
      }

      await say(renderSlackProfileSummary({ slackUserId: event.user, profile: result.profile }));
    } catch (error) {
      console.error("Erro no !profile:", error.message || error);
      await say("Não consegui carregar seu perfil 😵");
    }
  },
};
