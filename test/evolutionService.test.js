const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getBaseEvolutionCostByRarity,
  getEvolutionCost,
} = require("../services/evolutionService");

test("custo base de evolução por raridade", () => {
  assert.equal(getBaseEvolutionCostByRarity("common"), 4000);
  assert.equal(getBaseEvolutionCostByRarity("uncommon"), 5000);
  assert.equal(getBaseEvolutionCostByRarity("rare"), 6000);
  assert.equal(getBaseEvolutionCostByRarity("epic"), 7000);
  assert.equal(getBaseEvolutionCostByRarity("legendary"), 8000);
  assert.equal(getBaseEvolutionCostByRarity("mythical"), 9000);
});

test("custo de evolução dobra por estágio atual", () => {
  assert.equal(getEvolutionCost({ rarity: "common", evolutionStage: 1 }), 4000);
  assert.equal(getEvolutionCost({ rarity: "common", evolutionStage: 2 }), 8000);
  assert.equal(getEvolutionCost({ rarity: "rare", evolutionStage: 2 }), 12000);
});
