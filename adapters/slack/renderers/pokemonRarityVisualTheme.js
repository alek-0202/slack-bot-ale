const POKEMON_VISUAL_THEME = Object.freeze({
  default: {
    frameInner: "#D1D5DB",
    frameOuter: "#94A3B8",
    backgroundCenter: "#334155",
    backgroundEdge: "#0F172A",
    aura: "#A855F7",
    shinyGlow: "#FFFFFF",
  },
  legendary: {
    frameInner: "#C4B5FD",
    frameOuter: "#6D28D9",
    backgroundCenter: "#7C3AED",
    backgroundEdge: "#2E1065",
    aura: "#C084FC",
    shinyGlow: "#FFFFFF",
  },
  mythical: {
    frameInner: "#FDE68A",
    frameOuter: "#B45309",
    backgroundCenter: "#F59E0B",
    backgroundEdge: "#7C2D12",
    aura: "#FBBF24",
    shinyGlow: "#FFFFFF",
  },
  shiny: {
    frameInner: "#D8B4FE",
    frameOuter: "#7E22CE",
    backgroundCenter: "#8A2BE2",
    backgroundEdge: "#4B0082",
    aura: "#B026FF",
    shinyGlow: "#B026FF",
  },
});

function getPokemonVisualTheme({ rarity = null, shiny = false } = {}) {
  if (shiny) return POKEMON_VISUAL_THEME.shiny;

  const safeRarity = String(rarity || "").toLowerCase();
  if (safeRarity === "legendary") return POKEMON_VISUAL_THEME.legendary;
  if (safeRarity === "mythical") return POKEMON_VISUAL_THEME.mythical;
  return POKEMON_VISUAL_THEME.default;
}

module.exports = {
  POKEMON_VISUAL_THEME,
  getPokemonVisualTheme,
};
