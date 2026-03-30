const {
  ELEMENT_LABELS,
  ELEMENT_ALIASES,
  normalizeElement,
  normalizeElementList,
} = require("./elementType");

const TYPE_LABELS = ELEMENT_LABELS;
const TYPE_ALIASES = ELEMENT_ALIASES;

function normalizePokemonType(type) {
  return normalizeElement(type);
}

function normalizePokemonTypes(types) {
  return normalizeElementList(types);
}

function formatPokemonTypes(types) {
  const normalized = normalizePokemonTypes(types);
  if (!normalized.length) return null;

  return normalized.map((type) => TYPE_LABELS[type] || type[0].toUpperCase() + type.slice(1)).join(" / ");
}

function buildPokemonTypesLabel(types) {
  const normalized = normalizePokemonTypes(types);
  if (!normalized.length) return null;

  const label = normalized.length > 1 ? "Tipos" : "Tipo";
  return `${label}: ${formatPokemonTypes(normalized)}`;
}

module.exports = {
  TYPE_LABELS,
  TYPE_ALIASES,
  normalizePokemonType,
  normalizePokemonTypes,
  formatPokemonTypes,
  buildPokemonTypesLabel,
};
