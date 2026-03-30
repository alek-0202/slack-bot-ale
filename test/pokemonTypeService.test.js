const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePokemonTypes,
  formatPokemonTypes,
  buildPokemonTypesLabel,
} = require("../services/pokemonTypeService");

test("normalizePokemonTypes remove duplicados e normaliza formatos", () => {
  assert.deepEqual(normalizePokemonTypes(["Fire", "water", "fire", ""]), ["fire", "water"]);
  assert.deepEqual(normalizePokemonTypes("grass, poison"), ["grass", "poison"]);
  assert.deepEqual(normalizePokemonTypes(["Ice", "gelo", "Água", "agua"]), ["ice", "water"]);
});

test("formatPokemonTypes e buildPokemonTypesLabel formatam um ou dois tipos", () => {
  assert.equal(formatPokemonTypes(["fire"]), "Fire");
  assert.equal(formatPokemonTypes(["water", "ice"]), "Water / Ice");
  assert.equal(buildPokemonTypesLabel(["electric"]), "Tipo: Electric");
  assert.equal(buildPokemonTypesLabel(["water", "ice"]), "Tipos: Water / Ice");
  assert.equal(buildPokemonTypesLabel([]), null);
});
