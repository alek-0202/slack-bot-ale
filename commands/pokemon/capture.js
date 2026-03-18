const { captureForUser } = require("../../application/useCases/pokemon/captureForUser");
const { renderSlackCaptureResult } = require("../../adapters/slack/renderers/sharedPokemonRenderer");

module.exports = {
  name: "capture",
  async execute({ event, say }) {
    try {
      const result = await captureForUser({ userId: event.user });
      await say(renderSlackCaptureResult({ slackUserId: event.user, result }));
    } catch (error) {
      console.error("Erro no !capture:", error.message || error);
      await say("Não consegui capturar agora 😵");
    }
  },
};
