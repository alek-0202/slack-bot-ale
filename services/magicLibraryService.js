const path = require("path");

const magicNames = require(path.join("..", "data", "magic", "magic-names.json"));
const elementIcons = require(path.join("..", "data", "magic", "element-icons.json"));
const { TYPE_LABELS } = require("./pokemonTypeService");

function getMagicNameLibrary() {
  return { ...magicNames };
}

function getElementIconLibrary() {
  return { ...elementIcons };
}

function getElementLabel(element) {
  const normalized = String(element || "").trim().toLowerCase();
  return TYPE_LABELS[normalized] || (normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Unknown");
}

function getMagicNamesForElement(element) {
  const normalized = String(element || "").trim().toLowerCase();
  const library = getMagicNameLibrary();
  return Array.isArray(library[normalized]) ? library[normalized] : [];
}

function getElementIcon(element) {
  const normalized = String(element || "").trim().toLowerCase();
  const library = getElementIconLibrary();
  return typeof library[normalized] === "string" ? library[normalized] : "✦";
}

function buildDefaultMagicName(element, index = 0) {
  const names = getMagicNamesForElement(element);
  if (names[index]) return names[index];
  return `Magia de ${getElementLabel(element)}`;
}

module.exports = {
  getMagicNameLibrary,
  getElementIconLibrary,
  getElementLabel,
  getMagicNamesForElement,
  getElementIcon,
  buildDefaultMagicName,
};
