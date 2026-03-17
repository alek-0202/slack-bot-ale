const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getBaseGoldByRarity,
  getLevelBonus,
  getGoldValueByRarityAndLevel,
} = require("../services/economyService");

test("economia dobra por raridade", () => {
  assert.equal(getBaseGoldByRarity("common"), 50);
  assert.equal(getBaseGoldByRarity("uncommon"), 100);
  assert.equal(getBaseGoldByRarity("rare"), 200);
  assert.equal(getBaseGoldByRarity("epic"), 400);
  assert.equal(getBaseGoldByRarity("legendary"), 800);
  assert.equal(getBaseGoldByRarity("mythical"), 1600);
});

test("bônus por nível soma +10 por nível acima do 1", () => {
  assert.equal(getLevelBonus(1), 0);
  assert.equal(getLevelBonus(5), 40);
  assert.equal(getGoldValueByRarityAndLevel({ rarity: "rare", level: 5 }), 240);
});
