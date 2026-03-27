const POKEMON_VISUAL_THEME = Object.freeze({
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
  shinyPrime: {
    backgroundCenter: "#5B0000",
    backgroundEdge: "#1A0000",
    aura: "#FF2A2A",
  },
});

function getPokemonVisualTheme({ rarity = null, shiny = false, shinyType = null } = {}) {
  const normalizedShinyType = String(shinyType || "").toLowerCase();
  if (shiny && normalizedShinyType === "prime") return POKEMON_VISUAL_THEME.shinyPrime;

  const safeRarity = String(rarity || "").toLowerCase();
  if (safeRarity === "mythical") return POKEMON_VISUAL_THEME.mythical;
  if (safeRarity === "legendary") return POKEMON_VISUAL_THEME.legendary;
  return POKEMON_VISUAL_THEME.default;
}

module.exports = {
  POKEMON_VISUAL_THEME,
  getPokemonVisualTheme,
};
