const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSearchText,
  normalizeTag,
  resolveCatalogSpeciesByName,
  resolveCatalogSpeciesByTag,
} = require('../application/useCases/pokemon/catalogLookup');
const { getPokemonElementsReference } = require('../services/pokemonElementsService');

const speciesList = [
  { id: 1, name: 'Bulbasaur', evolves_from: null, evolves_to: 2 },
  { id: 2, name: 'Ivysaur', evolves_from: 1, evolves_to: 3 },
  { id: 3, name: 'Venusaur', evolves_from: 2, evolves_to: null },
  { id: 25, name: 'Pikachu', evolves_from: 172, evolves_to: 26 },
  { id: 26, name: 'Raichu', evolves_from: 25, evolves_to: null },
];

test('normalizeSearchText trata caixa, acento e espaços extras', () => {
  assert.equal(normalizeSearchText('   PókéMON   '), 'pokemon');
});

test('resolveCatalogSpeciesByName exige match exato normalizado', () => {
  const result = resolveCatalogSpeciesByName('  pikaCHU ', speciesList);
  assert.equal(result.ok, true);
  assert.equal(result.species.id, 25);
  assert.deepEqual(result.speciesIds, [172, 25, 26].filter((id) => speciesList.some((species) => species.id === id)));
  assert.equal(result.index, 0);
});

test('resolveCatalogSpeciesByName evita falso positivo em busca parcial', () => {
  const result = resolveCatalogSpeciesByName('saur', speciesList);
  assert.deepEqual(result, { ok: false, reason: 'not_found' });
});

test('resolveCatalogSpeciesByTag aceita prefixo # e encontra a espécie correta', () => {
  const result = resolveCatalogSpeciesByTag('#25', speciesList);
  assert.equal(result.ok, true);
  assert.equal(result.species.name, 'Pikachu');
});

test('resolveCatalogSpeciesByTag rejeita tags inválidas', () => {
  assert.deepEqual(resolveCatalogSpeciesByTag('abc', speciesList), { ok: false, reason: 'invalid_tag' });
  assert.equal(normalizeTag(' #025 '), '025');
});

test('getPokemonElementsReference retorna os 18 tipos modernos', () => {
  const entries = getPokemonElementsReference();
  assert.equal(entries.length, 18);
  assert.deepEqual(entries.find((entry) => entry.name === 'Fire').weaknesses, ['Water', 'Ground', 'Rock']);
  assert.deepEqual(entries.find((entry) => entry.name === 'Fairy').weaknesses, ['Poison', 'Steel']);
});
