const crypto = require("crypto");
const { formatPokemonStars, normalizeLevel } = require("../../../services/pokemonProgressionService");
const { createLogger } = require("../../../utils/logger");
const { saveRenderedImage } = require("../../../utils/renderedImageStore");
const { LEVEL_BORDER_TIERS, getLevelBorderStyle } = require("./pokemonVisualTier");
const { renderLayeredPokemonSprite } = require("./pokemonLayeredSpriteRenderer");

const logger = createLogger("renderer:pokemon-visual-blocks");
const SLACK_IMAGE_URL_MAX_LENGTH = 3000;
const RENDERED_IMAGE_PATH_PREFIX = "/rendered-images/";

function isFinalEvolution(species = {}) {
  return !species?.evolves_to;
}

function buildStarsLabel(level = 1) {
  const stars = formatPokemonStars(level);
  return stars === "-" ? "Sem estrelas" : stars.replaceAll("★", "⭐");
}

function buildPokemonVisualSummary({ species = {}, level = 1 }) {
  const border = getLevelBorderStyle(level);
  const finalEvolution = isFinalEvolution(species);

  return {
    starsLabel: buildStarsLabel(level),
    border,
    finalEvolution,
    finalEvolutionLabel: finalEvolution ? "👑 Última evolução" : "🧬 Ainda evolui",
  };
}

function detectImageReferenceType(value) {
  if (!value || typeof value !== "string") return "missing";
  if (value.startsWith("data:image/")) return "data_uri";
  if (/^[A-Za-z]:\\/.test(value)) return "windows_path";
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) return "local_path";
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return "http_url";
    return "unsupported_url_scheme";
  } catch {
    return "unknown";
  }
}

function isSlackCompatibleImageUrl(value) {
  if (!value || typeof value !== "string") return false;
  if (value.length > SLACK_IMAGE_URL_MAX_LENGTH) return false;

  const referenceType = detectImageReferenceType(value);
  return referenceType === "http_url";
}

function summarizeImageReference(value) {
  return {
    type: detectImageReferenceType(value),
    length: typeof value === "string" ? value.length : 0,
    preview: typeof value === "string" ? value.slice(0, 120) : null,
  };
}

function summarizeAccessoryForLog(accessory) {
  if (!accessory) {
    return {
      present: false,
    };
  }

  const altText = typeof accessory.alt_text === "string" ? accessory.alt_text : "";
  return {
    present: true,
    type: accessory.type || null,
    usesSlackFile: Boolean(accessory.slack_file),
    usesImageUrl: typeof accessory.image_url === "string",
    imageUrlLength: typeof accessory.image_url === "string" ? accessory.image_url.length : 0,
    hasAltText: altText.trim().length > 0,
  };
}

function buildSlackImageAccessory({ finalImage, altText, context = {} }) {
  const normalizedAltText = typeof altText === "string" && altText.trim().length > 0 ? altText : "Pokémon";
  let accessory;

  if (typeof finalImage === "string" && isSlackCompatibleImageUrl(finalImage)) {
    accessory = {
      type: "image",
      image_url: finalImage,
      alt_text: normalizedAltText,
    };
  } else if (finalImage && typeof finalImage === "object") {
    if (finalImage.type === "http_url" && isSlackCompatibleImageUrl(finalImage.url)) {
      accessory = {
        type: "image",
        image_url: finalImage.url,
        alt_text: normalizedAltText,
      };
    }
  }

  logger.info("Accessory final validado para Block Kit", {
    ...context,
    ...summarizeAccessoryForLog(accessory),
  });

  return accessory;
}

function buildDeterministicFileName({ species = {}, level = 1, shiny = false }) {
  const entropy = crypto
    .createHash("md5")
    .update(`${species.id || "unknown"}:${species.name || "pokemon"}:${level}:${shiny ? "1" : "0"}:${Date.now()}`)
    .digest("hex")
    .slice(0, 10);

  const normalizedName = String(species.name || "pokemon")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${normalizedName || "pokemon"}-lv${level}-${shiny ? "shiny" : "normal"}-${entropy}.png`;
}

function getRenderedImagePublicBaseUrl() {
  const fromRenderedImagePublic = (process.env.RENDERED_IMAGE_PUBLIC_BASE_URL || "").trim();
  if (fromRenderedImagePublic) {
    return {
      value: fromRenderedImagePublic.replace(/\/+$/, ""),
      source: "RENDERED_IMAGE_PUBLIC_BASE_URL",
    };
  }

  const fromPublicBase = (process.env.PUBLIC_BASE_URL || "").trim();
  if (fromPublicBase) {
    return {
      value: fromPublicBase.replace(/\/+$/, ""),
      source: "PUBLIC_BASE_URL",
    };
  }

  return {
    value: "",
    source: "none",
  };
}

function summarizePublicBaseUrl(baseUrl) {
  if (!baseUrl) {
    return {
      configured: false,
      host: null,
      port: null,
      protocol: null,
      looksLocalOnly: null,
      usesContainerPort3000: null,
    };
  }

  try {
    const parsed = new URL(baseUrl);
    const explicitPort = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    const hostname = parsed.hostname || "";
    return {
      configured: true,
      host: hostname,
      port: explicitPort,
      protocol: parsed.protocol,
      looksLocalOnly: hostname === "localhost" || hostname === "127.0.0.1",
      usesContainerPort3000: explicitPort === 3000,
    };
  } catch {
    return {
      configured: true,
      host: null,
      port: null,
      protocol: null,
      looksLocalOnly: null,
      usesContainerPort3000: null,
      invalidUrl: true,
    };
  }
}

function publishRenderedImageUrl({ pngBuffer, commandName = "unknown", species = {}, level = 1, shiny = false }) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    return {
      ok: false,
      reason: "missing_render_buffer",
      format: "buffer",
      imageUrl: null,
    };
  }

  try {
    const resolvedBaseUrl = getRenderedImagePublicBaseUrl();
    const baseUrl = resolvedBaseUrl.value;
    if (!baseUrl) {
      logger.warn("URL pública base indisponível para publicar render em camadas", {
        commandName,
        speciesName: species.name,
        level,
        shiny,
        baseUrlSource: resolvedBaseUrl.source,
      });
      return {
        ok: false,
        reason: "missing_public_base_url",
        format: "buffer",
        imageUrl: null,
      };
    }

    const filename = buildDeterministicFileName({ species, level, shiny });
    const imageId = saveRenderedImage({ buffer: pngBuffer, mimeType: "image/png" });
    const imageUrl = imageId ? `${baseUrl}${RENDERED_IMAGE_PATH_PREFIX}${imageId}` : null;
    const imageUrlLength = typeof imageUrl === "string" ? imageUrl.length : 0;
    const baseUrlSummary = summarizePublicBaseUrl(baseUrl);

    if (baseUrlSummary.looksLocalOnly || baseUrlSummary.usesContainerPort3000) {
      logger.warn("Base URL pública pode não ser alcançável pelo Slack", {
        commandName,
        speciesName: species.name,
        level,
        shiny,
        baseUrl,
        baseUrlSource: resolvedBaseUrl.source,
        baseUrlSummary,
      });
    }

    logger.info("Render em camadas publicado em URL pública", {
      commandName,
      speciesName: species.name,
      level,
      shiny,
      renderedFilename: filename,
      imageBufferSize: pngBuffer.length,
      imageId,
      baseUrl,
      baseUrlSource: resolvedBaseUrl.source,
      baseUrlSummary,
      imagePublicUrl: imageUrl,
      imageUrlLength,
    });

    if (!isSlackCompatibleImageUrl(imageUrl)) {
      logger.warn("URL pública renderizada incompatível com image_url do Slack; fallback será aplicado", {
        commandName,
        speciesName: species.name,
        level,
        shiny,
        imageUrl: summarizeImageReference(imageUrl),
      });
      return {
        ok: false,
        reason: "invalid_public_url",
        format: "buffer",
        imageUrl: null,
      };
    }

    return {
      ok: true,
      reason: null,
      format: "public_url",
      imageUrl,
    };
  } catch (error) {
    logger.error("Falha ao publicar render em camadas para URL pública", {
      commandName,
      speciesName: species.name,
      level,
      shiny,
      error,
    });

    return {
      ok: false,
      reason: "publish_failed",
      format: "buffer",
      imageUrl: null,
    };
  }
}

function resolveSlackCompatibleImageUrl({ layeredImageUrl, fallbackImageUrl, context = {} }) {
  if (isSlackCompatibleImageUrl(layeredImageUrl)) {
    return {
      imageUrl: layeredImageUrl,
      source: "layered_render_public_url",
    };
  }

  if (layeredImageUrl) {
    logger.warn("Render em camadas gerou referência incompatível com Slack image_url; aplicando fallback", {
      ...context,
      layeredImage: summarizeImageReference(layeredImageUrl),
    });
  }

  if (isSlackCompatibleImageUrl(fallbackImageUrl)) {
    return {
      imageUrl: fallbackImageUrl,
      source: "species_sprite_url",
    };
  }

  logger.warn("Nenhuma referência de imagem compatível com Slack disponível para accessory", {
    ...context,
    fallbackImage: summarizeImageReference(fallbackImageUrl),
  });

  return {
    imageUrl: null,
    source: "none",
  };
}

async function buildAccessoryImage({
  species = {},
  level = 1,
  shiny = false,
  shinyType = null,
  commandName = "unknown",
}) {
  if (!species.sprite_url) return undefined;

  const border = getLevelBorderStyle(level);
  const frameEmojis = border.hasBorder ? `${border.emoji} ${border.emoji}` : "▫️ ▫️";

  const layeredRender = await renderLayeredPokemonSprite({ species, level, shiny, shinyType, commandName });

  if (!layeredRender.ok) {
    logger.warn("Falha no render em camadas: mantendo sprite original", {
      commandName,
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      reason: layeredRender.reason,
      metadata: layeredRender.metadata || {},
    });
  }

  if (layeredRender.ok && layeredRender.imageBuffer) {
    const publishResult = publishRenderedImageUrl({
      pngBuffer: layeredRender.imageBuffer,
      species,
      level,
      shiny,
      commandName,
    });

    logger.info("Resultado do delivery da imagem renderizada", {
      commandName,
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      rendererOk: layeredRender.ok,
      rendererOutputType: layeredRender.metadata?.outputType || "unknown",
      published: publishResult.ok,
      deliveryFormat: publishResult.format,
      publishReason: publishResult.reason,
      loadedAssets: layeredRender.metadata?.loadedAssets?.length || 0,
      missingAssets: layeredRender.metadata?.missingAssets?.length || 0,
      generatedFrame: Boolean(layeredRender.metadata?.usedGeneratedFrame),
    });

    if (publishResult.ok && publishResult.imageUrl) {
      logger.info("Imagem final resolvida para Slack accessory", {
        commandName,
        speciesName: species.name,
        speciesId: species.id,
        level,
        shiny,
        resolvedSource: "layered_render_public_url",
        accessoryMode: "image_url",
        finalImage: summarizeImageReference(publishResult.imageUrl),
        imageUrlLength: publishResult.imageUrl.length,
      });

      return buildSlackImageAccessory({
        finalImage: publishResult.imageUrl,
        altText: `${frameEmojis} ${species.name || "Pokémon"} · Lv ${normalizeLevel(level)} ${frameEmojis}`,
        context: {
          commandName,
          speciesName: species.name,
          speciesId: species.id,
          level,
          shiny,
        },
      });
    }

    logger.warn("Render em camadas disponível, mas delivery falhou. Aplicando fallback para URL pública", {
      commandName,
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      fallbackReason: publishResult.reason,
    });
  }

  const resolvedImage = resolveSlackCompatibleImageUrl({
    layeredImageUrl: null,
    fallbackImageUrl: layeredRender.fallbackImageUrl || species.sprite_url,
    context: {
      commandName,
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      layeredOk: Boolean(layeredRender?.ok),
      layeredReason: layeredRender?.reason || null,
    },
  });

  logger.info("Imagem final resolvida para Slack accessory", {
    commandName,
    speciesName: species.name,
    speciesId: species.id,
    level,
    shiny,
    rendererOk: Boolean(layeredRender?.ok),
    resolvedSource: resolvedImage.source,
    finalImage: summarizeImageReference(resolvedImage.imageUrl),
  });

  return buildSlackImageAccessory({
    finalImage: resolvedImage.imageUrl
      ? {
          type: "http_url",
          url: resolvedImage.imageUrl,
        }
      : null,
    altText: `${frameEmojis} ${species.name || "Pokémon"} · Lv ${normalizeLevel(level)} ${frameEmojis}`,
    context: {
      commandName,
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
    },
  });
}

async function buildPokemonVisualBlocks({
  species = {},
  level = 1,
  shiny = false,
  shinyType = null,
  commandName = "unknown",
}) {
  const visual = buildPokemonVisualSummary({ species, level });
  const blocks = [];
  const contextElements = [
    {
      type: "mrkdwn",
      text: `⭐ *${visual.starsLabel}*`,
    },
  ];

  if (visual.finalEvolution) {
    contextElements.push({
      type: "mrkdwn",
      text: "👑 *Última evolução*",
    });
  }

  if (visual.border.hasBorder) {
    contextElements.push({
      type: "mrkdwn",
      text: `${visual.border.emoji} ${visual.border.emoji} ${visual.border.emoji}`,
    });
  }

  blocks.push({
    type: "context",
    elements: contextElements,
  });

  return {
    ...visual,
    accessory: await buildAccessoryImage({ species, level, shiny, shinyType, commandName }),
    blocks,
  };
}

module.exports = {
  LEVEL_BORDER_TIERS,
  getLevelBorderStyle,
  isFinalEvolution,
  buildStarsLabel,
  isSlackCompatibleImageUrl,
  summarizeImageReference,
  resolveSlackCompatibleImageUrl,
  buildSlackImageAccessory,
  publishRenderedImageUrl,
  summarizeAccessoryForLog,
  buildAccessoryImage,
  buildPokemonVisualSummary,
  buildPokemonVisualBlocks,
};
