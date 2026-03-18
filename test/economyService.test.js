const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getBaseGoldByRarity,
  getLevelBonus,
  getGoldValueByRarityAndLevel,
} = require("../services/economyService");

test("economia usa nova tabela base por raridade", () => {
  assert.equal(getBaseGoldByRarity("common"), 300);
  assert.equal(getBaseGoldByRarity("uncommon"), 800);
  assert.equal(getBaseGoldByRarity("rare"), 2500);
  assert.equal(getBaseGoldByRarity("epic"), 10000);
  assert.equal(getBaseGoldByRarity("legendary"), 35000);
  assert.equal(getBaseGoldByRarity("mythical"), 50000);
});

test("bônus por nível soma +10 por nível acima do 1", () => {
  assert.equal(getLevelBonus(1), 0);
  assert.equal(getLevelBonus(5), 40);
  assert.equal(getGoldValueByRarityAndLevel({ rarity: "rare", level: 5 }), 2540);
});
