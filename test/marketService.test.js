const test = require("node:test");
const assert = require("node:assert/strict");

const { getMarketDateKey, getPriceByRarity } = require("../services/marketService");

test("getMarketDateKey gera chave ISO yyyy-mm-dd", () => {
  const key = getMarketDateKey(new Date("2026-03-16T12:30:00.000Z"));
  assert.equal(key, "2026-03-16");
});

test("getPriceByRarity respeita tiers e fallback", () => {
  assert.equal(getPriceByRarity("common"), 250);
  assert.equal(getPriceByRarity("uncommon"), 500);
  assert.equal(getPriceByRarity("rare"), 1000);
  assert.equal(getPriceByRarity("invalid"), 250);
});
