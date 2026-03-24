const { normalizeLevel } = require("../../../services/pokemonProgressionService");

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

module.exports = {
  LEVEL_BORDER_TIERS,
  getLevelBorderStyle,
};
