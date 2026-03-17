const http = require("http");
const { createLogger } = require("./logger");
const { sendCriticalAlert } = require("./criticalAlert");

function startHealthcheckServer(serviceName) {
  const logger = createLogger(`healthcheck:${serviceName}`);
  const port = Number(process.env.HEALTHCHECK_PORT || 0);

  if (!port) {
    logger.info("Healthcheck desabilitado (HEALTHCHECK_PORT não definido)");
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      const payload = {
        status: "ok",
        service: serviceName,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info("Healthcheck server online", { bind: "0.0.0.0", port });
  });

  server.on("error", async (error) => {
    logger.error("Falha ao iniciar servidor de healthcheck", { error });
    await sendCriticalAlert({
      source: serviceName,
      message: "Falha crítica ao iniciar healthcheck",
      error,
    });
    process.exit(1);
  });
}

module.exports = {
  startHealthcheckServer,
};
