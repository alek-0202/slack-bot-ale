const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MIN_EVOLUTION_GROWTH,
  calculatePokemonStats,
  getPokemonProgressionSnapshot,
  getPokemonStars,
  rollPokemonIvOffsets,
  SHINY_TYPE,
  IV_STAT_RANGES,
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

test("calculatePokemonStats aplica progressão forte, marcos e bônus do nível 50", () => {
  const species = {
    id: 25,
    name: "pikachu",
    base_attack: 20,
    base_magic: 21,
    base_defense: 18,
    base_hp: 24,
    base_speed: 22,
  };

  const level1 = calculatePokemonStats({ species, level: 1 });
  const level10 = calculatePokemonStats({ species, level: 10 });
  const level50 = calculatePokemonStats({ species, level: 50 });

  assert.deepEqual(level1, { attack: 20, magic: 21, defense: 18, hp: 24, speed: 22 });
  assert.deepEqual(level10, { attack: 57, magic: 62, defense: 52, hp: 84, speed: 45 });
  assert.deepEqual(level50, { attack: 226, magic: 250, defense: 204, hp: 363, speed: 151 });
});

test("snapshot de progressão expõe estrelas e marcos corretamente", () => {
  const species = {
    id: 6,
    name: "charizard",
    base_attack: 30,
    base_defense: 20,
    base_hp: 25,
    base_speed: 28,
  };

  const snapshot = getPokemonProgressionSnapshot({ species, level: 20 });

  assert.equal(snapshot.stars, 2);
  assert.equal(snapshot.starText, "★★");
  assert.deepEqual(snapshot.milestonesApplied, [10, 20]);
  assert.equal(getPokemonStars(9), 0);
  assert.equal(getPokemonStars(10), 1);
  assert.equal(getPokemonStars(50), 5);
});

test("IV passa a escalar com o nível por ser somado na base antes da progressão", () => {
  const species = {
    base_attack: 20,
    base_magic: 20,
    base_defense: 20,
    base_hp: 20,
    base_speed: 20,
  };
  const ivOffsets = { attack_iv: 10, magic_iv: 10, defense_iv: 10, hp_iv: 10, speed_iv: 10 };

  const level1Base = calculatePokemonStats({ species, level: 1 });
  const level1WithIv = calculatePokemonStats({ species, level: 1, ivOffsets });
  const level10Base = calculatePokemonStats({ species, level: 10 });
  const level10WithIv = calculatePokemonStats({ species, level: 10, ivOffsets });

  assert.equal(level1WithIv.attack - level1Base.attack, 10);
  assert.ok(level10WithIv.attack - level10Base.attack > 10);
});

test("shiny prime aplica cap de IV com +10 sobre o máximo normal", () => {
  const iv = rollPokemonIvOffsets({ shiny: true, shinyType: SHINY_TYPE.PRIME, rarity: "epic" });

  assert.equal(iv.attack_iv, IV_STAT_RANGES.attack.max + 10);
  assert.equal(iv.defense_iv, IV_STAT_RANGES.defense.max + 10);
  assert.equal(iv.magic_iv, IV_STAT_RANGES.magic.max + 10);
  assert.equal(iv.hp_iv, IV_STAT_RANGES.hp.max + 10);
  assert.equal(iv.speed_iv, IV_STAT_RANGES.speed.max + 10);
});

test("shiny prime comum não recebe cap extra de IV", () => {
  const iv = rollPokemonIvOffsets({ shiny: true, shinyType: SHINY_TYPE.PRIME, rarity: "common" });

  assert.equal(iv.attack_iv, IV_STAT_RANGES.attack.max);
  assert.equal(iv.defense_iv, IV_STAT_RANGES.defense.max);
  assert.equal(iv.magic_iv, IV_STAT_RANGES.magic.max);
  assert.equal(iv.hp_iv, IV_STAT_RANGES.hp.max);
  assert.equal(iv.speed_iv, IV_STAT_RANGES.speed.max);
});

test("bônus de shiny varia por raridade (common 7%, legendary 18%, mythical 20%)", () => {
  const baseSpecies = { base_attack: 100, base_magic: 100, base_defense: 100, base_hp: 100, base_speed: 100 };
  const common = calculatePokemonStats({ species: { ...baseSpecies, rarity: "common" }, level: 1, shiny: true });
  const legendary = calculatePokemonStats({ species: { ...baseSpecies, rarity: "legendary" }, level: 1, shiny: true });
  const mythical = calculatePokemonStats({ species: { ...baseSpecies, rarity: "mythical" }, level: 1, shiny: true });

  assert.equal(common.attack, 107);
  assert.equal(legendary.attack, 136);
  assert.equal(mythical.attack, 144);
});
