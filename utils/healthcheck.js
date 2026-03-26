const http = require("http");
const { createLogger } = require("./logger");
const { sendCriticalAlert } = require("./criticalAlert");
const { readRenderedImage } = require("./renderedImageStore");

const IMAGE_ROUTE_PREFIX = "/rendered-images/";

function detectBufferImageKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return "unknown";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "gif";
  return "unknown";
}

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


    if (requestUrl.pathname.startsWith(IMAGE_ROUTE_PREFIX)) {
      const imageId = requestUrl.pathname.slice(IMAGE_ROUTE_PREFIX.length).trim();

      if (!imageId) {
        logger.warn("Requisição de imagem renderizada sem id", {
          method: req.method,
          path: requestUrl.pathname,
          query: requestUrl.search || "",
        });
        res.writeHead(400, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ status: "invalid_id" }));
        return;
      }

      const renderedImage = readRenderedImage(imageId);

      if (!renderedImage) {
        logger.warn("Imagem renderizada não encontrada no store em memória", {
          method: req.method,
          imageId,
          path: requestUrl.pathname,
        });
        res.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ status: "not_found" }));
        return;
      }

      const detectedKind = detectBufferImageKind(renderedImage.buffer);
      if (detectedKind === "unknown") {
        logger.warn("Imagem renderizada retornada com assinatura de arquivo desconhecida", {
          imageId,
          mimeType: renderedImage.mimeType || "image/png",
          contentLength: renderedImage.buffer?.length || 0,
        });
      }

      const maxAgeSeconds = Math.max(1, Math.floor((renderedImage.expiresAt - Date.now()) / 1000));
      res.writeHead(200, {
        "Content-Type": renderedImage.mimeType || "image/png",
        "Content-Length": renderedImage.buffer.length,
        "Cache-Control": `public, max-age=${maxAgeSeconds}, immutable`,
      });
      res.end(renderedImage.buffer);
      logger.info("Imagem renderizada servida com sucesso", {
        method: req.method,
        imageId,
        mimeType: renderedImage.mimeType || "image/png",
        detectedKind,
        contentLength: renderedImage.buffer.length,
        maxAgeSeconds,
      });
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
