const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMagicEntriesFromElements, buildMagicSummary, buildCharacteristicSkillEntriesFromElements, canRegisterCharacteristicSkills, MAX_MAGIC_SLOTS } = require("../services/pokemonMagicService");
const { getRandomMagicName, getElementIcon, DEFAULT_MAGIC_NAME, DEFAULT_MAGIC_ICON } = require("../services/magicLibraryService");

test("getRandomMagicName usa fallback quando elemento não existe", () => {
  assert.equal(getRandomMagicName("void"), DEFAULT_MAGIC_NAME);
});

test("getElementIcon usa fallback quando elemento não existe", () => {
  assert.equal(getElementIcon("void"), DEFAULT_MAGIC_ICON);
});

test("buildMagicEntriesFromElements respeita limite configurado e evita nomes repetidos quando possível", () => {
  const originalRandom = Math.random;
  const sequence = [0, 0, 0.75];
  let index = 0;
  Math.random = () => sequence[index++] ?? 0;

  const spells = buildMagicEntriesFromElements(["fire", "fire", "water", "grass"]);

  Math.random = originalRandom;

  assert.ok(spells.length <= MAX_MAGIC_SLOTS);
  assert.deepEqual(spells.map((spell) => spell.element), ["fire", "water", "grass"]);
  assert.equal(spells[0].icon, "🔥");
  assert.equal(spells[1].icon, "💧");
  assert.notEqual(spells[0].name, spells[1].name);
});

test("buildMagicSummary exibe emoji antes do nome", () => {
  const summary = buildMagicSummary([
    { slot: 1, name: "Meteoro Flamejante", element: "fire", icon: "🔥" },
    { slot: 2, name: "Almas Torturadas", element: "ghost", icon: "👻" },
  ]);

  assert.match(summary, /1: 🔥 \*Meteoro Flamejante\*/);
  assert.match(summary, /2: 👻 \*Almas Torturadas\*/);
});


test("magias características só são geradas a partir do nível 50", () => {
  const lowLevel = buildCharacteristicSkillEntriesFromElements(["fire", "water"], 49);
  const highLevel = buildCharacteristicSkillEntriesFromElements(["fire", "water"], 50);

  assert.equal(lowLevel.length, 0);
  assert.ok(highLevel.length > 0);
  assert.equal(canRegisterCharacteristicSkills({ level: 50 }), true);
  assert.equal(canRegisterCharacteristicSkills({ level: 49 }), false);
});
