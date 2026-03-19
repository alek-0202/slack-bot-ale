const { formatPokemonStars, normalizeLevel } = require("../../../services/pokemonProgressionService");

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

function buildPokemonVisualBlocks({ species = {}, level = 1 }) {
  const visual = buildPokemonVisualSummary({ species, level });
  const blocks = [];

  // O Slack Block Kit não suporta borda/overlay real em image blocks.
  // Por isso centralizamos a melhor aproximação visual possível:
  // imagem + linha de status logo abaixo com estrelas, moldura e selo de forma final.
  if (species.sprite_url) {
    blocks.push({
      type: "image",
      image_url: species.sprite_url,
      alt_text: species.name || "Pokémon",
      title: {
        type: "plain_text",
        text: `${species.name || "Pokémon"} · Lv ${normalizeLevel(level)}`,
        emoji: true,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `*Estrelas:* ${visual.starsLabel}`,
      },
      {
        type: "mrkdwn",
        text: `*Moldura:* ${visual.border.emoji} ${visual.border.label}`,
      },
      {
        type: "mrkdwn",
        text: visual.finalEvolutionLabel,
      },
    ],
  });

  return {
    ...visual,
    blocks,
  };
}

module.exports = {
  LEVEL_BORDER_TIERS,
  getLevelBorderStyle,
  isFinalEvolution,
  buildStarsLabel,
  buildPokemonVisualSummary,
  buildPokemonVisualBlocks,
};
