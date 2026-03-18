const TYPE_LABELS = {
  normal: "Normal",
  fire: "Fire",
  water: "Water",
  electric: "Electric",
  grass: "Grass",
  ice: "Ice",
  fighting: "Fighting",
  poison: "Poison",
  ground: "Ground",
  flying: "Flying",
  psychic: "Psychic",
  bug: "Bug",
  rock: "Rock",
  ghost: "Ghost",
  dragon: "Dragon",
  dark: "Dark",
  steel: "Steel",
  fairy: "Fairy",
};

function normalizePokemonTypes(types) {
  if (!types) return [];

  const source = Array.isArray(types)
    ? types
    : String(types)
        .split(",")
        .map((item) => item.trim());

  const seen = new Set();
  const normalized = [];

  for (const rawType of source) {
    const type = String(rawType || "").trim().toLowerCase();
    if (!type || seen.has(type)) continue;
    seen.add(type);
    normalized.push(type);
  }

  return normalized;
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
  normalizePokemonTypes,
  formatPokemonTypes,
  buildPokemonTypesLabel,
};
