const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BATTLE_TURN_ACTION_ID,
  BATTLE_MAGIC_ACTION_ID,
  MAGIC_REGISTER_REMOVE_ACTION_ID,
  renderBattleState,
  renderMagicOptions,
  renderMagicRegisterElementPrompt,
} = require("../adapters/slack/renderers/battleRenderer");

test("renderBattleState gera action_ids únicos para ataque, magia e poção", () => {
  const payload = renderBattleState(createBattleStub());
  const actionBlock = payload.blocks.find((block) => block.type === "actions");

  assert.ok(actionBlock);
  assert.equal(actionBlock.elements.length, 3);
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.deepEqual(actionIds, [
    `${BATTLE_TURN_ACTION_ID}_attack`,
    `${BATTLE_TURN_ACTION_ID}_magic`,
    `${BATTLE_TURN_ACTION_ID}_potion`,
  ]);
  assert.equal(new Set(actionIds).size, actionIds.length);
});

test("renderMagicOptions gera um action_id único por slot de magia", () => {
  const payload = renderMagicOptions({
    battle: { channelId: "C1" },
    actorUserId: "U1",
    magicSlots: [
      { slot: 1, name: "Raio", icon: "⚡" },
      { slot: 2, name: "Choque", icon: "✨" },
    ],
  });

  const actionBlock = payload.blocks.find((block) => block.type === "actions");
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.deepEqual(actionIds, [`${BATTLE_MAGIC_ACTION_ID}_1`, `${BATTLE_MAGIC_ACTION_ID}_2`]);
  assert.equal(new Set(actionIds).size, actionIds.length);
});

test("renderMagicRegisterElementPrompt gera action_id único por elemento removível", () => {
  const payload = renderMagicRegisterElementPrompt({
    pokemon: { id: 25, pokemon_species: { name: "Pikachu" } },
    elements: ["Electric", "Fairy", "Water"],
    maxSlots: 3,
  });

  const actionBlock = payload.blocks.find((block) => block.type === "actions");
  const actionIds = actionBlock.elements.map((element) => element.action_id);

  assert.deepEqual(actionIds, [
    `${MAGIC_REGISTER_REMOVE_ACTION_ID}_electric`,
    `${MAGIC_REGISTER_REMOVE_ACTION_ID}_fairy`,
    `${MAGIC_REGISTER_REMOVE_ACTION_ID}_water`,
  ]);
  assert.equal(new Set(actionIds).size, actionIds.length);
});

function createBattleStub() {
  return {
    channelId: "C-battle",
    status: "active",
    round: 1,
    currentTurnUserId: "U1",
    challengerId: "U1",
    challengedId: "U2",
    players: {
      U1: createPlayerStub({ userId: "U1", pokemonId: 25, name: "Pikachu", types: ["electric"] }),
      U2: createPlayerStub({ userId: "U2", pokemonId: 4, name: "Charmander", types: ["fire"] }),
    },
  };
}

function createPlayerStub({ userId, pokemonId, name, types }) {
  return {
    userId,
    selectedPokemon: {
      id: pokemonId,
      speciesId: pokemonId,
      name,
      level: 12,
      spriteUrl: null,
      elementTypes: types,
    },
    battleHp: { current: 120, max: 150 },
    stats: { attack: 40, defense: 25, speed: 18 },
    potionsUsed: 1,
    magicSlots: [{ slot: 1, name: `${name} Spell`, icon: "✦", element: types[0] }],
    initiativeGauge: 50,
    initiativeThreshold: 100,
  };
}
