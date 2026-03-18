const test = require("node:test");
const assert = require("node:assert/strict");

const { getMarketDateKey, getPriceByRarity, MANUAL_MARKET_CHANGE_REQUIRED_CONFIRMATIONS } = require("../services/marketService");

test("getMarketDateKey gera chave ISO yyyy-mm-dd", () => {
  const key = getMarketDateKey(new Date("2026-03-16T12:30:00.000Z"));
  assert.equal(key, "2026-03-16");
});

test("getPriceByRarity usa nova tabela econômica base", () => {
  assert.equal(getPriceByRarity("common"), 300n);
  assert.equal(getPriceByRarity("uncommon"), 800n);
  assert.equal(getPriceByRarity("rare"), 2500n);
  assert.equal(getPriceByRarity("epic"), 10000n);
  assert.equal(getPriceByRarity("legendary"), 35000n);
  assert.equal(getPriceByRarity("mythical"), 50000n);
  assert.equal(getPriceByRarity("invalid"), 300n);
});

test("market change mantém exigência de três confirmações", () => {
  assert.equal(MANUAL_MARKET_CHANGE_REQUIRED_CONFIRMATIONS, 3);
});
