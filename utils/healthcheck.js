const http = require("http");
const { createLogger } = require("./logger");
const { sendCriticalAlert } = require("./criticalAlert");
const { readRenderedImage } = require("./renderedImageStore");

function startHealthcheckServer(serviceName) {
  const logger = createLogger(`healthcheck:${serviceName}`);
  const port = Number(process.env.HEALTHCHECK_PORT || 0);

  if (!port) {
    logger.info("Healthcheck desabilitado (HEALTHCHECK_PORT não definido)");
    return;
  }

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");

    if (requestUrl.pathname === "/health") {
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


    if (requestUrl.pathname.startsWith("/rendered-images/")) {
      const imageId = requestUrl.pathname.slice("/rendered-images/".length).trim();
      const renderedImage = readRenderedImage(imageId);

      if (!renderedImage) {
        res.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ status: "not_found" }));
        return;
      }

      const maxAgeSeconds = Math.max(1, Math.floor((renderedImage.expiresAt - Date.now()) / 1000));
      res.writeHead(200, {
        "Content-Type": renderedImage.mimeType || "image/png",
        "Content-Length": renderedImage.buffer.length,
        "Cache-Control": `public, max-age=${maxAgeSeconds}, immutable`,
      });
      res.end(renderedImage.buffer);
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
