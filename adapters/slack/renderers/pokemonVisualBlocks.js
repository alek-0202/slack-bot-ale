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

function resolveSlackCompatibleImageUrl({ layeredImageUrl, fallbackImageUrl, context = {} }) {
  if (isSlackCompatibleImageUrl(layeredImageUrl)) {
    return {
      imageUrl: layeredImageUrl,
      source: "layered_render",
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

async function buildAccessoryImage({ species = {}, level = 1, shiny = false }) {
  if (!species.sprite_url) return undefined;

  const border = getLevelBorderStyle(level);
  const frameEmojis = border.hasBorder ? `${border.emoji} ${border.emoji}` : "▫️ ▫️";

  const layeredRender = await renderLayeredPokemonSprite({ species, level, shiny });
  const resolvedImage = resolveSlackCompatibleImageUrl({
    layeredImageUrl: layeredRender?.imageUrl,
    fallbackImageUrl: species.sprite_url,
    context: {
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      layeredOk: Boolean(layeredRender?.ok),
      layeredReason: layeredRender?.reason || null,
    },
  });

  if (!layeredRender.ok) {
    logger.warn("Falha no render em camadas: mantendo sprite original", {
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      reason: layeredRender.reason,
    });
  }

  logger.info("Imagem final resolvida para Slack accessory", {
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

async function buildPokemonVisualBlocks({ species = {}, level = 1, shiny = false }) {
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
    accessory: await buildAccessoryImage({ species, level, shiny }),
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
