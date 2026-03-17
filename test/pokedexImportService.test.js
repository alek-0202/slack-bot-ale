const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeGeneration,
  parsePokemonIdFromUrl,
} = require("../services/pokedexImportService");

test("normalizeGeneration converte gerações romanas", () => {
  assert.equal(normalizeGeneration("generation-i"), 1);
  assert.equal(normalizeGeneration("generation-vi"), 6);
  assert.equal(normalizeGeneration("generation-ix"), 9);
  assert.equal(normalizeGeneration("unknown"), null);
});

test("parsePokemonIdFromUrl extrai id corretamente", () => {
  assert.equal(parsePokemonIdFromUrl("https://pokeapi.co/api/v2/pokemon-species/25/"), 25);
  assert.equal(parsePokemonIdFromUrl(null), null);
});
