const path = require("path");

const magicNames = require(path.join("..", "data", "magic", "magic-names.json"));
const elementIcons = require(path.join("..", "data", "magic", "element-icons.json"));
const { TYPE_LABELS } = require("./pokemonTypeService");

const DEFAULT_MAGIC_NAME = "Ataque Elemental";
const DEFAULT_MAGIC_ICON = "✨";

function normalizeElement(element) {
  return String(element || "").trim().toLowerCase();
}

function getMagicNameLibrary() {
  return { ...(magicNames._meta?.format || magicNames) };
}

function getElementIconLibrary() {
  return { ...(elementIcons._meta?.format || elementIcons) };
}

function getElementLabel(element) {
  const normalized = normalizeElement(element);
  return TYPE_LABELS[normalized] || (normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Unknown");
}

function getMagicNamesForElement(element) {
  const normalized = normalizeElement(element);
  const library = getMagicNameLibrary();
  return Array.isArray(library[normalized]) ? [...library[normalized]] : [];
}

function getElementIcon(element) {
  const normalized = normalizeElement(element);
  const library = getElementIconLibrary();
  return typeof library[normalized] === "string" ? library[normalized] : DEFAULT_MAGIC_ICON;
}

function buildDefaultMagicName(element, index = 0) {
  const names = getMagicNamesForElement(element);
  if (names[index]) return names[index];
  return `Magia de ${getElementLabel(element)}`;
}

function getRandomMagicName(element, usedNames = []) {
  const names = getMagicNamesForElement(element);
  if (!names.length) return DEFAULT_MAGIC_NAME;

  const usedNameSet = new Set((Array.isArray(usedNames) ? usedNames : []).map((name) => String(name || "").trim()));
  const availableNames = names.filter((name) => !usedNameSet.has(name));
  const pool = availableNames.length ? availableNames : names;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex] || DEFAULT_MAGIC_NAME;
}

module.exports = {
  DEFAULT_MAGIC_NAME,
  DEFAULT_MAGIC_ICON,
  getMagicNameLibrary,
  getElementIconLibrary,
  getElementLabel,
  getMagicNamesForElement,
  getRandomMagicName,
  getElementIcon,
  buildDefaultMagicName,
};
