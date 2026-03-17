const test = require("node:test");
const assert = require("node:assert/strict");

const { getMarketDateKey, getPriceByRarity } = require("../services/marketService");

test("getMarketDateKey gera chave ISO yyyy-mm-dd", () => {
  const key = getMarketDateKey(new Date("2026-03-16T12:30:00.000Z"));
  assert.equal(key, "2026-03-16");
});

test("getPriceByRarity usa economia base por raridade", () => {
  assert.equal(getPriceByRarity("common"), 50);
  assert.equal(getPriceByRarity("uncommon"), 100);
  assert.equal(getPriceByRarity("rare"), 200);
  assert.equal(getPriceByRarity("epic"), 400);
  assert.equal(getPriceByRarity("legendary"), 800);
  assert.equal(getPriceByRarity("mythical"), 1600);
  assert.equal(getPriceByRarity("invalid"), 50);
});
