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

function getPokemonElementsReference() {
  logger.info('Consulta de referência de elementos executada', {
    count: ELEMENT_WEAKNESS_MAP.length,
  });

  return ELEMENT_WEAKNESS_MAP.map(([name, weaknesses]) => ({
    name,
    weaknesses: [...weaknesses],
  }));
}

module.exports = {
  ELEMENT_WEAKNESS_MAP,
  getPokemonElementsReference,
};
