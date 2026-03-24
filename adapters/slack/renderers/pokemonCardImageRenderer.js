const { normalizeLevel } = require("../../../services/pokemonProgressionService");

const CARD_SIZE = 256;
const PADDING = 14;
const BORDER_WIDTH = 14;

const LEVEL_THEME = Object.freeze({
  default: {
    frameInner: "#D1D5DB",
    frameOuter: "#94A3B8",
    backgroundCenter: "#334155",
    backgroundEdge: "#0F172A",
    aura: "#A855F7",
  },
  level50: {
    frameInner: "#FFD700",
    frameOuter: "#B8860B",
    backgroundCenter: "#8A2BE2",
    backgroundEdge: "#4B0082",
    aura: "#B026FF",
  },
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value = "") {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function getSparkles(seed) {
  const count = 3 + (seed % 4);
  const points = [];
  let current = seed || 1;

  for (let i = 0; i < count; i += 1) {
    current = (Math.imul(current, 1103515245) + 12345) & 0x7fffffff;
    const x = 58 + (current % 140);

    current = (Math.imul(current, 1103515245) + 12345) & 0x7fffffff;
    const y = 48 + (current % 150);

    current = (Math.imul(current, 1103515245) + 12345) & 0x7fffffff;
    const size = 1.8 + (current % 16) / 6;

    points.push({ x, y, size });
  }

  return points;
}

function getTheme(level) {
  return normalizeLevel(level) >= 50 ? LEVEL_THEME.level50 : LEVEL_THEME.default;
}

function buildShinySparklesMarkup({ sparkles, isShiny }) {
  if (!isShiny || !sparkles.length) return "";

  return sparkles
    .map(({ x, y, size }, index) => (
      `<g opacity="0.84" filter="url(#sparkleGlow)">` +
      `<circle cx="${x}" cy="${y}" r="${size}" fill="${index % 2 === 0 ? "#FFF7C2" : "#FFFFFF"}" />` +
      `<path d="M ${x - size * 1.9} ${y} L ${x + size * 1.9} ${y} M ${x} ${y - size * 1.9} L ${x} ${y + size * 1.9}" stroke="#FFFDE7" stroke-width="1" stroke-linecap="round" />` +
      `</g>`
    ))
    .join("");
}

function buildPokemonLayeredImageUrl({ spriteUrl, level = 1, shiny = false, speciesName = "" }) {
  if (!spriteUrl) return null;

  const safeLevel = normalizeLevel(level);
  const theme = getTheme(safeLevel);
  const spriteShadowBlur = shiny ? 8 : 5;
  const haloOpacity = safeLevel >= 50 ? 0.22 : 0;
  const sparkleSeed = hashString(`${speciesName}|${spriteUrl}|${safeLevel}`);
  const sparkles = shiny ? getSparkles(sparkleSeed) : [];

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
      <stop offset="0%" stop-color="${theme.frameOuter}" />
      <stop offset="52%" stop-color="${theme.frameInner}" />
      <stop offset="100%" stop-color="${theme.frameOuter}" />
    </linearGradient>
    <filter id="frameGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="${theme.frameInner}" flood-opacity="0.25" />
    </filter>
    <filter id="spriteShadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#000000" flood-opacity="0.28" />
      <feDropShadow dx="0" dy="0" stdDeviation="${spriteShadowBlur / 2}" flood-color="${shiny ? "#FFF2A8" : "#FFFFFF"}" flood-opacity="${shiny ? "0.22" : "0"}" />
    </filter>
    <filter id="sparkleGlow" x="-120%" y="-120%" width="340%" height="340%">
      <feDropShadow dx="0" dy="0" stdDeviation="1.8" flood-color="#FFF7C2" flood-opacity="0.85" />
    </filter>
  </defs>

  <!-- 1. Fundo (gradiente) -->
  <rect x="0" y="0" width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#bgGradient)" rx="24" />

  <!-- 2. Aura lvl 50 -->
  <circle cx="128" cy="128" r="78" fill="${theme.aura}" opacity="${haloOpacity}" filter="url(#frameGlow)" />

  <!-- 3 + 4. Sprite com profundidade -->
  <g filter="url(#spriteShadow)">
    <image href="${spriteUrl}" x="${spriteInset}" y="${spriteInset - 2}" width="${CARD_SIZE - spriteInset * 2}" height="${CARD_SIZE - spriteInset * 2}" preserveAspectRatio="xMidYMid meet" />
  </g>

  <!-- 5. Sparkles shiny -->
  ${buildShinySparklesMarkup({ sparkles, isShiny: shiny })}

  <!-- 6. Moldura com gradiente + glow -->
  <rect x="${borderInset}" y="${borderInset}" width="${CARD_SIZE - borderInset * 2}" height="${CARD_SIZE - borderInset * 2}" rx="18" fill="none" stroke="url(#frameGradient)" stroke-width="${BORDER_WIDTH}" filter="url(#frameGlow)" />

  <!-- 7. Linha interna da moldura -->
  <rect x="${innerFrameInset}" y="${innerFrameInset}" width="${CARD_SIZE - innerFrameInset * 2}" height="${CARD_SIZE - innerFrameInset * 2}" rx="12" fill="none" stroke="#FFF8CC" stroke-opacity="0.45" stroke-width="1.5" />
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

module.exports = {
  buildPokemonLayeredImageUrl,
};
