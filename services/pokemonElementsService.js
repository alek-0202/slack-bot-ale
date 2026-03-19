const { createLogger } = require('../utils/logger');

const logger = createLogger('pokemon-elements');

const ELEMENT_WEAKNESS_MAP = [
  ['Normal', ['Fighting']],
  ['Fire', ['Water', 'Ground', 'Rock']],
  ['Water', ['Electric', 'Grass']],
  ['Electric', ['Ground']],
  ['Grass', ['Fire', 'Ice', 'Poison', 'Flying', 'Bug']],
  ['Ice', ['Fire', 'Fighting', 'Rock', 'Steel']],
  ['Fighting', ['Flying', 'Psychic', 'Fairy']],
  ['Poison', ['Ground', 'Psychic']],
  ['Ground', ['Water', 'Grass', 'Ice']],
  ['Flying', ['Electric', 'Ice', 'Rock']],
  ['Psychic', ['Bug', 'Ghost', 'Dark']],
  ['Bug', ['Fire', 'Flying', 'Rock']],
  ['Rock', ['Water', 'Grass', 'Fighting', 'Ground', 'Steel']],
  ['Ghost', ['Ghost', 'Dark']],
  ['Dragon', ['Ice', 'Dragon', 'Fairy']],
  ['Dark', ['Fighting', 'Bug', 'Fairy']],
  ['Steel', ['Fire', 'Fighting', 'Ground']],
  ['Fairy', ['Poison', 'Steel']],
];

function normalizeElementName(element) {
  return String(element || '').trim().toLowerCase();
}

function getPokemonElementsReference() {
  logger.info('Consulta de referência de elementos executada', {
    count: ELEMENT_WEAKNESS_MAP.length,
  });

  return ELEMENT_WEAKNESS_MAP.map(([name, weaknesses]) => ({
    name,
    weaknesses: [...weaknesses],
  }));
}

function getElementWeaknessMap() {
  return Object.fromEntries(
    ELEMENT_WEAKNESS_MAP.map(([name, weaknesses]) => [
      normalizeElementName(name),
      weaknesses.map((item) => normalizeElementName(item)),
    ]),
  );
}

function resolveElementalRelation({ attackElement, defenderElements = [] }) {
  const normalizedAttack = normalizeElementName(attackElement);
  const normalizedDefenderElements = defenderElements.map((item) => normalizeElementName(item)).filter(Boolean);
  const weaknessMap = getElementWeaknessMap();

  const advantageAgainst = normalizedDefenderElements.filter((element) => (weaknessMap[element] || []).includes(normalizedAttack));
  const disadvantagedAgainst = normalizedDefenderElements.filter((element) => (weaknessMap[normalizedAttack] || []).includes(element));

  let relation = 'neutral';
  if (advantageAgainst.length) {
    relation = 'advantage';
  } else if (disadvantagedAgainst.length) {
    relation = 'disadvantage';
  }

  return {
    relation,
    advantageAgainst,
    disadvantagedAgainst,
    hasAdvantage: relation === 'advantage',
    hasDisadvantage: relation === 'disadvantage',
  };
}

module.exports = {
  ELEMENT_WEAKNESS_MAP,
  normalizeElementName,
  getPokemonElementsReference,
  getElementWeaknessMap,
  resolveElementalRelation,
};
