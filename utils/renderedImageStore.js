const crypto = require("crypto");
const { createLogger } = require("./logger");

const logger = createLogger("rendered-image-store");
const DEFAULT_TTL_MS = Number(process.env.RENDERED_IMAGE_TTL_MS || 5 * 60 * 1000);
const MAX_ITEMS = Number(process.env.RENDERED_IMAGE_MAX_ITEMS || 500);
const CLEANUP_INTERVAL_MS = Number(process.env.RENDERED_IMAGE_CLEANUP_INTERVAL_MS || 60 * 1000);

const store = new Map();

function makeId() {
  return crypto.randomBytes(9).toString("base64url");
}

function clearExpired(now = Date.now()) {
  let removed = 0;
  for (const [id, item] of store.entries()) {
    if (!item || item.expiresAt <= now) {
      store.delete(id);
      removed += 1;
    }
  }

  if (removed > 0) {
    logger.info("Limpeza de imagens renderizadas expiradas concluída", {
      removed,
      remaining: store.size,
    });
  }
}

setInterval(() => {
  clearExpired();
}, CLEANUP_INTERVAL_MS).unref();

function saveRenderedImage({ buffer, mimeType = "image/png", ttlMs = DEFAULT_TTL_MS }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }

  if (store.size >= MAX_ITEMS) {
    clearExpired();
    if (store.size >= MAX_ITEMS) {
      const oldestKey = store.keys().next().value;
      if (oldestKey) store.delete(oldestKey);
    }
  }

  const now = Date.now();
  const id = makeId();

  store.set(id, {
    buffer,
    mimeType,
    createdAt: now,
    expiresAt: now + Math.max(1000, Number(ttlMs) || DEFAULT_TTL_MS),
  });

  return id;
}

function readRenderedImage(id) {
  if (!id) return null;
  const item = store.get(id);
  if (!item) return null;

  if (item.expiresAt <= Date.now()) {
    store.delete(id);
    return null;
  }

  return item;
}

module.exports = {
  saveRenderedImage,
  readRenderedImage,
  clearExpired,
};
