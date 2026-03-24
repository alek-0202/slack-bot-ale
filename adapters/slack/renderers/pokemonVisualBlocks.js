const crypto = require("crypto");
const { formatPokemonStars, normalizeLevel } = require("../../../services/pokemonProgressionService");
const { createLogger } = require("../../../utils/logger");
const { LEVEL_BORDER_TIERS, getLevelBorderStyle } = require("./pokemonVisualTier");
const { renderLayeredPokemonSprite } = require("./pokemonLayeredSpriteRenderer");

const logger = createLogger("renderer:pokemon-visual-blocks");
const SLACK_IMAGE_URL_MAX_LENGTH = 3000;

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

async function uploadRenderToSlack({ slackClient, channelId, pngBuffer, species = {}, level = 1, shiny = false, commandName = "unknown" }) {
  if (!slackClient || !channelId || !Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    return {
      ok: false,
      reason: "missing_upload_context",
      format: "buffer",
      slackFileId: null,
    };
  }

  try {
    const filename = buildDeterministicFileName({ species, level, shiny });
    const uploadResponse = await slackClient.files.uploadV2({
      channel_id: channelId,
      file: pngBuffer,
      filename,
      title: `${species.name || "Pokémon"} · Lv ${level}`,
    });

    const firstFile = uploadResponse?.files?.[0] || uploadResponse?.file || null;
    const slackFileId = firstFile?.id || null;

    if (!slackFileId) {
      logger.warn("Upload Slack concluído sem file id; fallback será aplicado", {
        commandName,
        speciesName: species.name,
        level,
        shiny,
        channelId,
      });
      return {
        ok: false,
        reason: "missing_file_id",
        format: "buffer",
        slackFileId: null,
      };
    }

    return {
      ok: true,
      reason: null,
      format: "uploaded_slack_file",
      slackFileId,
    };
  } catch (error) {
    logger.error("Falha ao enviar render em camadas para Slack Files", {
      commandName,
      speciesName: species.name,
      level,
      shiny,
      channelId,
      error,
    });

    return {
      ok: false,
      reason: "upload_failed",
      format: "buffer",
      slackFileId: null,
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
  slackClient = null,
  channelId = null,
  commandName = "unknown",
}) {
  if (!species.sprite_url) return undefined;

  const border = getLevelBorderStyle(level);
  const frameEmojis = border.hasBorder ? `${border.emoji} ${border.emoji}` : "▫️ ▫️";

  const layeredRender = await renderLayeredPokemonSprite({ species, level, shiny, commandName });

  if (!layeredRender.ok) {
    logger.warn("Falha no render em camadas: mantendo sprite original", {
      commandName,
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      reason: layeredRender.reason,
    });
  }

  if (layeredRender.ok && layeredRender.imageBuffer) {
    const uploadResult = await uploadRenderToSlack({
      slackClient,
      channelId,
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
      uploaded: uploadResult.ok,
      deliveryFormat: uploadResult.format,
      uploadReason: uploadResult.reason,
      loadedAssets: layeredRender.metadata?.loadedAssets?.length || 0,
      missingAssets: layeredRender.metadata?.missingAssets?.length || 0,
      generatedFrame: Boolean(layeredRender.metadata?.usedGeneratedFrame),
    });

    if (uploadResult.ok && uploadResult.slackFileId) {
      logger.info("Imagem final resolvida para Slack accessory", {
        commandName,
        speciesName: species.name,
        speciesId: species.id,
        level,
        shiny,
        resolvedSource: "layered_render_uploaded",
        finalImage: {
          type: "slack_file_id",
          id: uploadResult.slackFileId,
        },
      });

      return {
        type: "image",
        slack_file: {
          id: uploadResult.slackFileId,
        },
        alt_text: `${frameEmojis} ${species.name || "Pokémon"} · Lv ${normalizeLevel(level)} ${frameEmojis}`,
      };
    }

    logger.warn("Render em camadas disponível, mas delivery falhou. Aplicando fallback para URL pública", {
      commandName,
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      fallbackReason: uploadResult.reason,
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

  if (!resolvedImage.imageUrl) {
    return undefined;
  }

  return {
    type: "image",
    image_url: resolvedImage.imageUrl,
    alt_text: `${frameEmojis} ${species.name || "Pokémon"} · Lv ${normalizeLevel(level)} ${frameEmojis}`,
  };
}

async function buildPokemonVisualBlocks({
  species = {},
  level = 1,
  shiny = false,
  slackClient = null,
  channelId = null,
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
    accessory: await buildAccessoryImage({ species, level, shiny, slackClient, channelId, commandName }),
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
  buildAccessoryImage,
  buildPokemonVisualSummary,
  buildPokemonVisualBlocks,
};
