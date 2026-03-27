const POKEMON_BACKGROUND_THEME = Object.freeze({
  default: {
    backgroundCenter: "#334155",
    backgroundEdge: "#0F172A",
    aura: "#A855F7",
  },
  legendary: {
    backgroundCenter: "#7C3AED",
    backgroundEdge: "#2E1065",
    aura: "#C084FC",
  },
  mythical: {
    backgroundCenter: "#EA9A2A",
    backgroundEdge: "#7A3E00",
    aura: "#FBBF24",
  },
});

const POKEMON_BORDER_THEME = Object.freeze({
  normal: {
    isPrime: false,
    frameStart: null,
    frameMid: "#FFFFFF",
    frameEnd: null,
    frameGlow: null,
    frameGlowOpacity: "0.25",
    innerStroke: "#FFF8CC",
    innerStrokeOpacity: "0.45",
    accentDotsColor: null,
    accentDotsOpacity: "0",
  },
  shinyPrime: {
    isPrime: true,
    frameStart: "#0B0B0B",
    frameMid: "#B91C1C",
    frameEnd: "#0B0B0B",
    frameGlow: "#FF2A2A",
    frameGlowOpacity: "0.18",
    innerStroke: "#EF4444",
    innerStrokeOpacity: "0.65",
    accentDotsColor: "#FF4D4D",
    accentDotsOpacity: "0.28",
  },
});

function getBackgroundByRarity({ rarity = null } = {}) {
  const safeRarity = String(rarity || "").toLowerCase();
  if (safeRarity === "mythical") return POKEMON_BACKGROUND_THEME.mythical;
  if (safeRarity === "legendary") return POKEMON_BACKGROUND_THEME.legendary;
  return POKEMON_BACKGROUND_THEME.default;
}

function getBorderByState({ shiny = false, shinyType = null } = {}) {
  const normalizedShinyType = String(shinyType || "").toLowerCase();
  if (shiny && normalizedShinyType === "prime") return POKEMON_BORDER_THEME.shinyPrime;
  return POKEMON_BORDER_THEME.normal;
}

function getPokemonVisualTheme({ rarity = null, shiny = false, shinyType = null } = {}) {
  const background = getBackgroundByRarity({ rarity });
  const border = getBorderByState({ shiny, shinyType });
  return {
    ...background,
    border,
  };
}

module.exports = {
  POKEMON_BACKGROUND_THEME,
  POKEMON_BORDER_THEME,
  getBackgroundByRarity,
  getBorderByState,
  getPokemonVisualTheme,
};
