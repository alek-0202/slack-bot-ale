const { formatPokemonStars, normalizeLevel } = require("../../../services/pokemonProgressionService");
const { buildPokemonLayeredImageUrl } = require("./pokemonCardImageRenderer");

const LEVEL_BORDER_TIERS = Object.freeze([
  { min: 50, max: 50, label: "Dourada", emoji: "🟨", hex: "#D4AF37", hasBorder: true },
  { min: 40, max: 49, label: "Vermelha", emoji: "🟥", hex: "#C62828", hasBorder: true },
  { min: 30, max: 39, label: "Roxa", emoji: "🟪", hex: "#7B1FA2", hasBorder: true },
  { min: 20, max: 29, label: "Azul escuro", emoji: "🟦", hex: "#1E3A8A", hasBorder: true },
  { min: 10, max: 19, label: "Cinza claro", emoji: "⬜", hex: "#D1D5DB", hasBorder: true },
  { min: 1, max: 9, label: "Sem borda", emoji: "⚪", hex: null, hasBorder: false },
]);

function getLevelBorderStyle(level = 1) {
  const safeLevel = normalizeLevel(level);
  return LEVEL_BORDER_TIERS.find((tier) => safeLevel >= tier.min && safeLevel <= tier.max) || LEVEL_BORDER_TIERS[LEVEL_BORDER_TIERS.length - 1];
}

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

function buildAccessoryImage({ species = {}, level = 1, shiny = false }) {
  if (!species.sprite_url) return undefined;

  const border = getLevelBorderStyle(level);
  const frameEmojis = border.hasBorder ? `${border.emoji} ${border.emoji}` : "▫️ ▫️";

  return {
    type: "image",
    image_url: buildPokemonLayeredImageUrl({
      spriteUrl: species.sprite_url,
      level,
      shiny,
      speciesName: species.name || "",
    }) || species.sprite_url,
    alt_text: `${frameEmojis} ${species.name || "Pokémon"} · Lv ${normalizeLevel(level)} ${frameEmojis}`,
  };
}

function buildPokemonVisualBlocks({ species = {}, level = 1, shiny = false }) {
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
    accessory: buildAccessoryImage({ species, level, shiny }),
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
