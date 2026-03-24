const { formatPokemonStars, normalizeLevel } = require("../../../services/pokemonProgressionService");
const { createLogger } = require("../../../utils/logger");
const { LEVEL_BORDER_TIERS, getLevelBorderStyle } = require("./pokemonVisualTier");
const { renderLayeredPokemonSprite } = require("./pokemonLayeredSpriteRenderer");

const logger = createLogger("renderer:pokemon-visual-blocks");

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

async function buildAccessoryImage({ species = {}, level = 1, shiny = false }) {
  if (!species.sprite_url) return undefined;

  const border = getLevelBorderStyle(level);
  const frameEmojis = border.hasBorder ? `${border.emoji} ${border.emoji}` : "▫️ ▫️";

  const layeredRender = await renderLayeredPokemonSprite({ species, level, shiny });
  const imageUrl = layeredRender.ok ? layeredRender.imageUrl : species.sprite_url;

  if (!layeredRender.ok) {
    logger.warn("Falha no render em camadas: mantendo sprite original", {
      speciesName: species.name,
      speciesId: species.id,
      level,
      shiny,
      reason: layeredRender.reason,
    });
  }

  return {
    type: "image",
    image_url: imageUrl,
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
  buildAccessoryImage,
  buildPokemonVisualSummary,
  buildPokemonVisualBlocks,
};
