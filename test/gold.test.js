const test = require("node:test");
const assert = require("node:assert/strict");

const {
  toGoldBigInt,
  toDatabaseGold,
  formatGold,
  addGold,
  subtractGold,
  isGoldGte,
  assertNonNegativeGold,
} = require("../utils/gold");

test("helpers de gold normalizam bigint/string com segurança", () => {
  assert.equal(toGoldBigInt("9223372036854775807"), 9223372036854775807n);
  assert.equal(toDatabaseGold(15n), "15");
  assert.equal(formatGold("42"), "42");
});

test("operações com gold evitam overflow silencioso e negativo", () => {
  assert.equal(addGold("10", 5n, 2), 17n);
  assert.equal(subtractGold("10", 3), 7n);
  assert.equal(isGoldGte("999999999999", "5"), true);
  assert.throws(() => assertNonNegativeGold(-1n), /não pode ser negativo/);
});
