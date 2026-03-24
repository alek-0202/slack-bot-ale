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
    const slackFileId = typeof finalImage.id === "string" ? finalImage.id : null;
    const slackFileUrl = typeof finalImage.url === "string" ? finalImage.url : null;

    if ((finalImage.type === "slack_file_id" || finalImage.type === "slack_file") && slackFileId) {
      accessory = {
        type: "image",
        alt_text: normalizedAltText,
        slack_file: {
          id: slackFileId,
        },
      };
    } else if (finalImage.type === "slack_file" && slackFileUrl) {
      accessory = {
        type: "image",
        alt_text: normalizedAltText,
        slack_file: {
          url: slackFileUrl,
        },
      };
    } else if (finalImage.type === "http_url" && isSlackCompatibleImageUrl(finalImage.url)) {
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

function extractSlackFileId(uploadResponse) {
  const candidates = [
    { path: "file.id", value: uploadResponse?.file?.id },
    { path: "file_id", value: uploadResponse?.file_id },
    { path: "files[0].id", value: uploadResponse?.files?.[0]?.id },
    { path: "files[0].file.id", value: uploadResponse?.files?.[0]?.file?.id },
    { path: "files[0].files[0].id", value: uploadResponse?.files?.[0]?.files?.[0]?.id },
    { path: "result.file.id", value: uploadResponse?.result?.file?.id },
    { path: "result.files[0].id", value: uploadResponse?.result?.files?.[0]?.id },
    { path: "result.files[0].files[0].id", value: uploadResponse?.result?.files?.[0]?.files?.[0]?.id },
  ];

  const matched = candidates.find((candidate) => typeof candidate.value === "string" && candidate.value.length > 0);
  return {
    slackFileId: matched?.value || null,
    extractedFrom: matched?.path || null,
  };
}

function summarizeUploadResponse(uploadResponse) {
  const files = Array.isArray(uploadResponse?.files) ? uploadResponse.files : null;
  const firstFilesEntry = files?.[0] || null;
  const nestedFiles = Array.isArray(firstFilesEntry?.files) ? firstFilesEntry.files : null;

  return {
    ok: uploadResponse?.ok,
    topLevelKeys: uploadResponse && typeof uploadResponse === "object" ? Object.keys(uploadResponse).slice(0, 20) : [],
    hasFile: Boolean(uploadResponse?.file),
    hasFiles: Boolean(files),
    filesCount: files?.length || 0,
    firstFilesEntryKeys: firstFilesEntry && typeof firstFilesEntry === "object" ? Object.keys(firstFilesEntry).slice(0, 20) : [],
    firstFilesEntryHasFile: Boolean(firstFilesEntry?.file),
    firstFilesEntryHasFiles: Boolean(nestedFiles),
    firstFilesEntryNestedFilesCount: nestedFiles?.length || 0,
    resultKeys: uploadResponse?.result && typeof uploadResponse.result === "object" ? Object.keys(uploadResponse.result).slice(0, 20) : [],
  };
}

async function uploadRenderToSlack({ slackClient, channelId, pngBuffer, species = {}, level = 1, shiny = false, commandName = "unknown" }) {
  if (!slackClient || !Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    return {
      ok: false,
      reason: "missing_upload_context",
      format: "buffer",
      slackFileId: null,
    };
  }

  try {
    const filename = buildDeterministicFileName({ species, level, shiny });
    const uploadMethod = "files.uploadV2";
    const uploadPayload = {
      file: pngBuffer,
      filename,
      title: `${species.name || "Pokémon"} · Lv ${level}`,
      ...(channelId ? { channel_id: channelId } : {}),
    };

    const uploadResponse = await slackClient.files.uploadV2(uploadPayload);

    const { slackFileId, extractedFrom } = extractSlackFileId(uploadResponse);
    const responseSummary = summarizeUploadResponse(uploadResponse);

    logger.info("Upload Slack finalizado para render em camadas", {
      commandName,
      uploadMethod,
      channelId: channelId || null,
      speciesName: species.name,
      level,
      shiny,
      extractedFrom,
      ...responseSummary,
    });

    if (!slackFileId) {
      logger.warn("Upload Slack concluído sem file id; fallback será aplicado", {
        commandName,
        uploadMethod,
        speciesName: species.name,
        level,
        shiny,
        channelId,
        extractedFrom,
        ...responseSummary,
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
      extractedFrom,
    };
  } catch (error) {
    logger.error("Falha ao enviar render em camadas para Slack Files", {
      commandName,
      speciesName: species.name,
      level,
      shiny,
      channelId: channelId || null,
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
      const finalImage = {
        type: "slack_file_id",
        id: uploadResult.slackFileId,
      };

      logger.info("Imagem final resolvida para Slack accessory", {
        commandName,
        speciesName: species.name,
        speciesId: species.id,
        level,
        shiny,
        resolvedSource: "layered_render_uploaded",
        finalImage,
      });

      return buildSlackImageAccessory({
        finalImage,
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
  extractSlackFileId,
  summarizeUploadResponse,
  resolveSlackCompatibleImageUrl,
  buildSlackImageAccessory,
  summarizeAccessoryForLog,
  buildAccessoryImage,
  buildPokemonVisualSummary,
  buildPokemonVisualBlocks,
};
