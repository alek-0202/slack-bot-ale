const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ELEMENT_TYPES,
  normalizeElement,
  normalizeElementList,
  isValidElement,
  matchesElement,
} = require('../services/elementType');

test('normalizeElement converte aliases e case para formato canônico', () => {
  assert.equal(normalizeElement('ICE'), 'ice');
  assert.equal(normalizeElement('gelo'), 'ice');
  assert.equal(normalizeElement('Água'), 'water');
});

test('normalizeElementList parseia lista composta e remove duplicados', () => {
  assert.deepEqual(normalizeElementList('Normal / Fairy, ICE | gelo'), ['normal', 'fairy', 'ice']);
  assert.deepEqual(normalizeElementList(['fire', 'Fogo', 'unknown'], { includeUnknown: false }), ['fire']);
  assert.deepEqual(normalizeElementList('{"Psychic","Fairy"}', { includeUnknown: false }), ['psychic', 'fairy']);
  assert.deepEqual(normalizeElementList('["Fire","Ice"]', { includeUnknown: false }), ['fire', 'ice']);
});

test('isValidElement e matchesElement validam/comparam com segurança', () => {
  assert.equal(isValidElement('ice'), true);
  assert.equal(isValidElement('gelo'), true);
  assert.equal(isValidElement('shadow'), false);
  assert.equal(matchesElement('ICE', 'gelo'), true);
  assert.equal(matchesElement('fire', 'water'), false);
  assert.equal(ELEMENT_TYPES.includes('ice'), true);
});
