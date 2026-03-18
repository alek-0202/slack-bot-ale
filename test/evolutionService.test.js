const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getBaseEvolutionCostByRarity,
  getEvolutionCost,
} = require("../services/evolutionService");

test("custo base de evolução por raridade", () => {
  assert.equal(getBaseEvolutionCostByRarity("common"), 4000n);
  assert.equal(getBaseEvolutionCostByRarity("uncommon"), 5000n);
  assert.equal(getBaseEvolutionCostByRarity("rare"), 6000n);
  assert.equal(getBaseEvolutionCostByRarity("epic"), 7000n);
  assert.equal(getBaseEvolutionCostByRarity("legendary"), 8000n);
  assert.equal(getBaseEvolutionCostByRarity("mythical"), 9000n);
});

test("custo de evolução dobra por estágio atual", () => {
  assert.equal(getEvolutionCost({ rarity: "common", evolutionStage: 1 }), 4000n);
  assert.equal(getEvolutionCost({ rarity: "common", evolutionStage: 2 }), 8000n);
  assert.equal(getEvolutionCost({ rarity: "rare", evolutionStage: 2 }), 12000n);
});
