const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_FORMAT = process.env.LOG_FORMAT || "text";

function normalizeLevel(level = DEFAULT_LEVEL) {
  const safeLevel = String(level || "").toLowerCase();
  return LOG_LEVELS[safeLevel] ? safeLevel : "info";
}

function shouldLog(level) {
  return LOG_LEVELS[normalizeLevel(level)] >= LOG_LEVELS[normalizeLevel(DEFAULT_LEVEL)];
}

function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) return;

  const payload = {
    timestamp: new Date().toISOString(),
    level: normalizeLevel(level),
    message,
    ...meta,
  };

  if (LOG_FORMAT === "json") {
    const line = JSON.stringify(payload);
    if (payload.level === "error") {
      console.error(line);
      return;
    }
    console.log(line);
    return;
  }

  const text = `[${payload.timestamp}] [${payload.level.toUpperCase()}] ${message}`;
  const details = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";

  if (payload.level === "error") {
    console.error(`${text}${details}`);
    return;
  }
  console.log(`${text}${details}`);
}

function createLogger(context = "app") {
  return {
    debug(message, meta) {
      write("debug", message, { context, ...meta });
    },
    info(message, meta) {
      write("info", message, { context, ...meta });
    },
    warn(message, meta) {
      write("warn", message, { context, ...meta });
    },
    error(message, meta = {}) {
      const safeMeta = {
        ...meta,
        error: serializeError(meta.error),
      };
      write("error", message, safeMeta);
    },
  };
}

module.exports = {
  createLogger,
};
