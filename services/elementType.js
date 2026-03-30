const ELEMENT_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

const ELEMENT_LABELS = {
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

const ELEMENT_ALIASES = {
  eletrico: "electric",
  elétrico: "electric",
  fogo: "fire",
  agua: "water",
  água: "water",
  grama: "grass",
  planta: "grass",
  gelo: "ice",
  lutador: "fighting",
  luta: "fighting",
  veneno: "poison",
  terra: "ground",
  voador: "flying",
  psiquico: "psychic",
  psíquico: "psychic",
  inseto: "bug",
  pedra: "rock",
  fantasma: "ghost",
  dragao: "dragon",
  dragão: "dragon",
  sombrio: "dark",
  noturno: "dark",
  metal: "steel",
  fada: "fairy",
};

const ELEMENT_TYPE_SET = new Set(ELEMENT_TYPES);

function splitElementInput(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => splitElementInput(entry));
  return String(value)
    .split(/[\/,;|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeElement(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return ELEMENT_ALIASES[raw] || raw;
}

function isValidElement(value) {
  const normalized = normalizeElement(value);
  return Boolean(normalized) && ELEMENT_TYPE_SET.has(normalized);
}

function normalizeElementList(value, { includeUnknown = true } = {}) {
  const seen = new Set();
  const out = [];
  for (const entry of splitElementInput(value)) {
    const normalized = normalizeElement(entry);
    if (!normalized) continue;
    if (!includeUnknown && !isValidElement(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function matchesElement(a, b) {
  const left = normalizeElement(a);
  const right = normalizeElement(b);
  return Boolean(left) && left === right;
}

function getElementLabel(value) {
  const normalized = normalizeElement(value);
  if (!normalized) return "Unknown";
  return ELEMENT_LABELS[normalized] || `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

module.exports = {
  ELEMENT_TYPES,
  ELEMENT_LABELS,
  ELEMENT_ALIASES,
  normalizeElement,
  normalizeElementList,
  isValidElement,
  matchesElement,
  splitElementInput,
  getElementLabel,
};
