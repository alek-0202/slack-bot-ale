const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePositiveInt } = require("../utils/number");

test("parsePositiveInt aceita inteiros positivos válidos", () => {
  assert.equal(parsePositiveInt("10"), 10);
  assert.equal(parsePositiveInt(" 42 "), 42);
});

test("parsePositiveInt rejeita zero, negativos e strings inválidas", () => {
  assert.equal(parsePositiveInt("0"), null);
  assert.equal(parsePositiveInt("-3"), null);
  assert.equal(parsePositiveInt("abc"), null);
  assert.equal(parsePositiveInt(""), null);
});
