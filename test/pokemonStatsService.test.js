const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MIN_EVOLUTION_GROWTH,
  getLevelStatMultiplier,
  calculatePokemonStats,
} = require("../services/pokemonStatsService");
const { deriveBaseStats } = require("../services/pokedexImportService");

test("deriveBaseStats cresce por raridade e garante +35% por estágio", () => {
  const commonStage1 = deriveBaseStats({ rarity: "common", evolutionStage: 1 });
  const rareStage1 = deriveBaseStats({ rarity: "rare", evolutionStage: 1 });
  const commonStage2 = deriveBaseStats({ rarity: "common", evolutionStage: 2 });

  assert.ok(rareStage1.base_attack > commonStage1.base_attack);
  assert.ok(rareStage1.base_hp > commonStage1.base_hp);
  assert.ok(commonStage2.base_attack >= Math.ceil(commonStage1.base_attack * MIN_EVOLUTION_GROWTH));
  assert.ok(commonStage2.base_defense >= Math.ceil(commonStage1.base_defense * MIN_EVOLUTION_GROWTH));
  assert.ok(commonStage2.base_hp >= Math.ceil(commonStage1.base_hp * MIN_EVOLUTION_GROWTH));
  assert.ok(commonStage2.base_speed >= Math.ceil(commonStage1.base_speed * MIN_EVOLUTION_GROWTH));
});

test("calculatePokemonStats usa stats base da espécie e multiplicador do nível", () => {
  const species = {
    id: 25,
    name: "pikachu",
    base_attack: 20,
    base_defense: 18,
    base_hp: 24,
    base_speed: 22,
  };

  const level1 = calculatePokemonStats({ species, level: 1 });
  const level5 = calculatePokemonStats({ species, level: 5 });

  assert.deepEqual(level1, { attack: 20, defense: 18, hp: 24, speed: 22 });
  assert.equal(level5.attack, Math.ceil(20 * getLevelStatMultiplier(5)));
  assert.equal(level5.defense, Math.ceil(18 * getLevelStatMultiplier(5)));
  assert.equal(level5.hp, Math.ceil(24 * getLevelStatMultiplier(5)));
  assert.equal(level5.speed, Math.ceil(22 * getLevelStatMultiplier(5)));
});
