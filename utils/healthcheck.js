const http = require("http");

function startHealthcheckServer(serviceName) {
  const port = Number(process.env.HEALTHCHECK_PORT || 0);

  if (!port) {
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
    console.log(`[healthcheck] ${serviceName} escutando em 0.0.0.0:${port}`);
  });

  server.on("error", (error) => {
    console.error(`[healthcheck] Falha ao iniciar servidor de healthcheck para ${serviceName}:`, error);
    process.exit(1);
  });
}

module.exports = {
  startHealthcheckServer,
};
