const { captureForUser } = require("../../application/useCases/pokemon/captureForUser");
const { renderSlackCaptureResult } = require("../../adapters/slack/renderers/sharedPokemonRenderer");
const { createLogger } = require("../../utils/logger");

const logger = createLogger("slack-capture-command");

async function sendCaptureReply({ say, payload, slackUserId, channelId }) {
  try {
    await say(payload);
  } catch (error) {
    logger.warn("Falha ao enviar resposta rica do !capture; tentando fallback em texto", {
      slackUserId,
      channelId,
      hasTextFallback: Boolean(payload && typeof payload === "object" && payload.text),
      error: {
        message: error?.message,
        code: error?.code,
        data: error?.data,
      },
    });

    if (payload && typeof payload === "object" && payload.text) {
      await say(payload.text);
      return;
    }

    throw error;
  }
}

module.exports = {
  name: "capture",
  async execute({ event, say, args }) {
    const commandArgs = (args || "").trim();

    logger.info("Entrada no comando !capture", {
      slackUserId: event.user,
      channelId: event.channel,
      text: event.text,
      args: commandArgs || null,
    });

    if (commandArgs) {
      logger.warn("!capture recebeu argumentos inesperados; mantendo compatibilidade e ignorando", {
        slackUserId: event.user,
        channelId: event.channel,
        args: commandArgs,
      });
    }

    try {
      const result = await captureForUser({
        userId: event.user,
        channelId: event.channel,
        platform: "slack",
        rawText: event.text,
      });
      const reply = renderSlackCaptureResult({ slackUserId: event.user, result });

      await sendCaptureReply({
        say,
        payload: reply,
        slackUserId: event.user,
        channelId: event.channel,
      });

      logger.info("Resposta do !capture enviada", {
        slackUserId: event.user,
        channelId: event.channel,
        ok: result?.ok ?? false,
        reason: result?.reason || null,
        captureId: result?.captured?.id || null,
      });
    } catch (error) {
      logger.error("Erro no fluxo do !capture", {
        slackUserId: event.user,
        channelId: event.channel,
        args: commandArgs || null,
        error,
      });
      await say("Não consegui processar sua captura agora 😵 Tente novamente em instantes.");
    }
  },
};
