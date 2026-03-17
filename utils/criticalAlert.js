const { createLogger } = require("./logger");

const logger = createLogger("critical-alert");

async function sendCriticalAlert({ source, message, error }) {
  const webhookUrl = process.env.CRITICAL_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const body = {
    source,
    message,
    timestamp: new Date().toISOString(),
    error: error
      ? {
          name: error.name,
          message: error.message,
        }
      : undefined,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.warn("Falha ao enviar alerta crítico para webhook", {
        status: response.status,
        source,
      });
    }
  } catch (sendError) {
    logger.warn("Erro ao enviar alerta crítico", {
      source,
      error: sendError,
    });
  }
}

module.exports = {
  sendCriticalAlert,
};
