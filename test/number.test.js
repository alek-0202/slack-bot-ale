const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePositiveInt, parsePositiveIntList } = require("../utils/number");

test("parsePositiveInt retorna inteiro positivo ou null", () => {
  assert.equal(parsePositiveInt("25"), 25);
  assert.equal(parsePositiveInt("0"), null);
  assert.equal(parsePositiveInt("abc"), null);
});

test("parsePositiveIntList aceita vírgulas, espaços, ignora vazios e remove duplicados", () => {
  assert.deepEqual(parsePositiveIntList("23,45,534,565,33"), [23, 45, 534, 565, 33]);
  assert.deepEqual(parsePositiveIntList("23, 45, , 534, 23, 565, foo, 33"), [23, 45, 534, 565, 33]);
  assert.deepEqual(parsePositiveIntList(" , , "), []);
});
