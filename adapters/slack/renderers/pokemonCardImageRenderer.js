const { normalizeLevel } = require("../../../services/pokemonProgressionService");
const { getPokemonVisualTheme } = require("./pokemonRarityVisualTheme");
const { getLevelBorderStyle } = require("./pokemonVisualTier");

const CARD_SIZE = 256;
const PADDING = 14;
const BORDER_WIDTH = 14;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildPokemonLayeredImageUrl({ spriteUrl, level = 1, shiny = false, shinyType = null, rarity = null }) {
  if (!spriteUrl) return null;

  normalizeLevel(level);
  const normalizedShinyType = String(shinyType || "").toLowerCase();
  const isShinyPrime = Boolean(shiny) && normalizedShinyType === "prime";
  const theme = getPokemonVisualTheme({ shiny, shinyType, rarity });
  const border = getLevelBorderStyle(level);
  const borderColor = border.hex || "#D1D5DB";
  const spriteShadowBlur = shiny ? 8 : 5;
  const haloOpacity = shiny ? 0.22 : 0;

  const borderInset = clamp(PADDING + BORDER_WIDTH / 2, 10, 26);
  const innerFrameInset = borderInset + 6;
  const spriteInset = 40;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}">
  <defs>
    <radialGradient id="bgGradient" cx="50%" cy="42%" r="68%">
      <stop offset="0%" stop-color="${theme.backgroundCenter}" stop-opacity="0.96" />
      <stop offset="100%" stop-color="${theme.backgroundEdge}" stop-opacity="1" />
    </radialGradient>
    <linearGradient id="frameGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${isShinyPrime ? "#0B0B0B" : borderColor}" />
      <stop offset="52%" stop-color="${isShinyPrime ? "#2A0000" : "#FFFFFF"}" />
      <stop offset="100%" stop-color="${isShinyPrime ? "#0B0B0B" : borderColor}" />
    </linearGradient>
    <filter id="frameGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="${isShinyPrime ? "#FF2A2A" : borderColor}" flood-opacity="0.25" />
    </filter>
    <filter id="spriteShadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#000000" flood-opacity="0.28" />
      <feDropShadow dx="0" dy="0" stdDeviation="${spriteShadowBlur / 2}" flood-color="${isShinyPrime ? "#FF2A2A" : "#FFFFFF"}" flood-opacity="${shiny ? "0.20" : "0"}" />
    </filter>
  </defs>

  <rect x="0" y="0" width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#bgGradient)" rx="24" />
  <circle cx="128" cy="128" r="78" fill="${theme.aura}" opacity="${haloOpacity}" filter="url(#frameGlow)" />
  ${isShinyPrime ? '<g opacity="0.35"><path d="M18 34 L238 34" stroke="#FF3B3B" stroke-width="2"/><path d="M18 54 L238 54" stroke="#FF3B3B" stroke-width="2"/><path d="M18 74 L238 74" stroke="#FF3B3B" stroke-width="2"/><path d="M18 94 L238 94" stroke="#FF3B3B" stroke-width="2"/><path d="M18 114 L238 114" stroke="#FF3B3B" stroke-width="2"/><path d="M18 134 L238 134" stroke="#FF3B3B" stroke-width="2"/><path d="M18 154 L238 154" stroke="#FF3B3B" stroke-width="2"/><path d="M18 174 L238 174" stroke="#FF3B3B" stroke-width="2"/><path d="M18 194 L238 194" stroke="#FF3B3B" stroke-width="2"/><path d="M18 214 L238 214" stroke="#FF3B3B" stroke-width="2"/></g>' : ""}

  <g filter="url(#spriteShadow)">
    <image href="${spriteUrl}" x="${spriteInset}" y="${spriteInset - 2}" width="${CARD_SIZE - spriteInset * 2}" height="${CARD_SIZE - spriteInset * 2}" preserveAspectRatio="xMidYMid meet" />
  </g>

  <rect x="${borderInset}" y="${borderInset}" width="${CARD_SIZE - borderInset * 2}" height="${CARD_SIZE - borderInset * 2}" rx="18" fill="none" stroke="url(#frameGradient)" stroke-width="${BORDER_WIDTH}" filter="url(#frameGlow)" />
  <rect x="${innerFrameInset}" y="${innerFrameInset}" width="${CARD_SIZE - innerFrameInset * 2}" height="${CARD_SIZE - innerFrameInset * 2}" rx="12" fill="none" stroke="${isShinyPrime ? "#FF5A5A" : "#FFF8CC"}" stroke-opacity="0.45" stroke-width="1.5" />
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

module.exports = {
  buildPokemonLayeredImageUrl,
};
