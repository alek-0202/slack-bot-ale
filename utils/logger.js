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
    code: error.code,
    details: error.details,
    hint: error.hint,
    schema: error.schema,
    table: error.table,
    constraint: error.constraint,
    routine: error.routine,
    stack: error.stack,
  };
}

function normalizeLogValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalizeLogValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeLogValue(entry)]));
  }
  return value;
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) return;

  const normalizedLevel = normalizeLevel(level);
  const normalizedMeta = normalizeLogValue(meta);

  const payload = {
    timestamp: new Date().toISOString(),
    ...normalizedMeta,
    level: normalizedLevel,
    message,
  };

  if (LOG_FORMAT === "json") {
    const line = JSON.stringify(payload);
    if (normalizedLevel === "error") {
      console.error(line);
      return;
    }
    console.log(line);
    return;
  }

  const text = `[${payload.timestamp}] [${normalizedLevel.toUpperCase()}] ${message}`;
  const details = Object.keys(normalizedMeta).length ? ` ${JSON.stringify(normalizedMeta)}` : "";

  if (normalizedLevel === "error") {
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
