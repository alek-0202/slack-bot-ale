const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculatePokemonSellPrice,
  getBaseSellPriceByRarity,
  sumFragmentBonuses,
} = require("../services/sellService");

test("getBaseSellPriceByRarity retorna fallback para raridade inválida", () => {
  assert.equal(getBaseSellPriceByRarity("epic"), 10000n);
  assert.equal(getBaseSellPriceByRarity("invalid"), 300n);
});

test("calculatePokemonSellPrice usa valor base do pokémon somado a todo o investimento em upgrade", () => {
  const level1 = calculatePokemonSellPrice({ baseValue: 300, rarity: "common", upgradeSpentGold: 0 });
  const upgraded = calculatePokemonSellPrice({ baseValue: 300, rarity: "common", upgradeSpentGold: 1050 });

  assert.equal(level1.finalPrice, "300");
  assert.equal(upgraded.basePrice, "300");
  assert.equal(upgraded.totalUpgradeCost, "1050");
  assert.equal(upgraded.upgradeReturn, "1050");
  assert.equal(upgraded.finalPrice, "1350");
});

test("sumFragmentBonuses aplica regras de fragmento por raridade e shiny", () => {
  const bonus = sumFragmentBonuses([
    { shiny: false, pokemon_species: { rarity: "epic" } },
    { shiny: true, pokemon_species: { rarity: "epic" } },
    { shiny: true, pokemon_species: { rarity: "rare" } },
  ]);

  assert.deepEqual(bonus, {
    commonFragment: 43,
    epicFragment: 2,
    legendaryFragment: 0,
    mythicalFragment: 0,
    prismaticFragment: 2,
  });
});

test("sumFragmentBonuses concede fragmento prismático para shiny prime épico", () => {
  const bonus = sumFragmentBonuses([
    { shiny: true, shiny_type: "prime", pokemon_species: { rarity: "epic" } },
  ]);

  assert.deepEqual(bonus, {
    commonFragment: 20,
    epicFragment: 1,
    legendaryFragment: 0,
    mythicalFragment: 0,
    prismaticFragment: 20,
  });
});

test("sumFragmentBonuses aplica regra prismática para shiny prime comum/incomum/raro", () => {
  const bonus = sumFragmentBonuses([
    { shiny: true, shiny_type: "prime", pokemon_species: { rarity: "common" } },
    { shiny: true, shiny_type: "prime", pokemon_species: { rarity: "uncommon" } },
    { shiny: true, shiny_type: "prime", pokemon_species: { rarity: "rare" } },
  ]);

  assert.deepEqual(bonus, {
    commonFragment: 5,
    epicFragment: 0,
    legendaryFragment: 0,
    mythicalFragment: 0,
    prismaticFragment: 4,
  });
});
