const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DUNGEON_BATTLE_MAGIC_ACTION_ID,
  DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID,
  DUNGEON_BATTLE_TURN_ACTION_ID,
  renderDungeonBattleState,
  renderDungeonMagicOptions,
} = require('../adapters/slack/renderers/dungeonRenderer');

test('renderDungeonBattleState reutiliza o layout de batalha com action_ids próprios da dungeon', () => {
  const payload = renderDungeonBattleState(createBattleStub());
  const actionBlock = payload.blocks.find((block) => block.type === 'actions');

  assert.ok(actionBlock);
  assert.deepEqual(actionBlock.elements.map((element) => element.action_id), [
    `${DUNGEON_BATTLE_TURN_ACTION_ID}_attack`,
    `${DUNGEON_BATTLE_TURN_ACTION_ID}_defense`,
    `${DUNGEON_BATTLE_TURN_ACTION_ID}_magic`,
    `${DUNGEON_BATTLE_TURN_ACTION_ID}_potion`,
  ]);
});

test('renderDungeonMagicOptions usa action_ids de magia da dungeon e inclui botão de voltar', () => {
  const payload = renderDungeonMagicOptions({
    battle: createBattleStub(),
    actorUserId: 'U1',
    magicSlots: [{ slot: 1, name: 'Raio', icon: '⚡' }],
  });

  const actionBlocks = payload.blocks.filter((block) => block.type === 'actions');
  assert.equal(actionBlocks[0].elements[0].action_id, `${DUNGEON_BATTLE_MAGIC_ACTION_ID}_1`);
  assert.equal(actionBlocks[1].elements[0].action_id, DUNGEON_BATTLE_MAGIC_CANCEL_ACTION_ID);
});

function createBattleStub() {
  return {
    id: 'dungeon:U1:1',
    channelId: 'dungeon:U1',
    status: 'active',
    round: 1,
    currentTurnUserId: 'U1',
    challengerId: 'U1',
    challengedId: '__dungeon_enemy__',
    metadata: {
      mode: 'dungeon',
      dungeonType: 'daily',
      dailyMode: 'normal',
      slackUserId: 'U1',
    },
    players: {
      U1: createPlayerStub({ userId: 'U1', pokemonId: 25, name: 'Pikachu', types: ['electric'] }),
      __dungeon_enemy__: createPlayerStub({ userId: '__dungeon_enemy__', pokemonId: 4, name: 'Charmander', types: ['fire'] }),
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
    magicSlots: [{ slot: 1, name: `${name} Spell`, icon: '✦', element: types[0] }],
    initiativeGauge: 50,
    initiativeThreshold: 100,
    magicCooldown: { blockedOwnTurnsRemaining: 0 },
  };
}
