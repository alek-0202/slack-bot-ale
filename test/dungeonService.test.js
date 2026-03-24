const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getFarmReward,
  decideAiAction,
  processEnemyTurnIfNeeded,
  DUNGEON_ENEMY_USER_ID,
  FARM_LEVELS,
  getDungeonEnemyStatModifier,
  balanceDungeonEnemyStats,
} = require('../services/dungeonService');
const { BATTLE_ACTION } = require('../application/battle/domain/actionResolver');
const { createBattle, assignSelectedPokemon, startBattle } = require('../application/battle/domain/battleState');

test('farm reward scales with dungeon level', () => {
  assert.deepEqual(getFarmReward(5), { gold: 1500, accountXp: 500, ancientBookQty: 1 });
  assert.deepEqual(getFarmReward(25), { gold: 7500, accountXp: 2500, ancientBookQty: 2 });
  assert.ok(FARM_LEVELS.includes(50));
});

test('ai uses attack without magic', () => {
  const action = decideAiAction({ magicSlots: [] });
  assert.equal(action.actionType, BATTLE_ACTION.ATTACK);
});

test('dungeon enemy balance buffs only common and uncommon rarities', () => {
  assert.equal(getDungeonEnemyStatModifier('common'), 1.2);
  assert.equal(getDungeonEnemyStatModifier('uncommon'), 1.2);
  assert.equal(getDungeonEnemyStatModifier('rare'), 1);
  assert.equal(getDungeonEnemyStatModifier('epic'), 1);

  const balancedCommon = balanceDungeonEnemyStats({ attack: 100, magic: 50, defense: 40, hp: 200, speed: 30, luck: 7 }, 'common');
  assert.deepEqual(balancedCommon.stats, { attack: 120, magic: 60, defense: 48, hp: 240, speed: 36, luck: 7 });

  const balancedRare = balanceDungeonEnemyStats({ attack: 100, magic: 50, defense: 40, hp: 200, speed: 30 }, 'rare');
  assert.deepEqual(balancedRare.stats, { attack: 100, magic: 50, defense: 40, hp: 200, speed: 30 });
});

test('auto-turn inimigo também resolve quando batalha começa no turno do bot', () => {
  const playerId = 'U_PLAYER';
  const battle = createBattle({
    battleId: 'battle-auto-enemy-start',
    channelId: 'dungeon:U_PLAYER',
    challengerId: playerId,
    challengedId: DUNGEON_ENEMY_USER_ID,
    metadata: { mode: 'dungeon', dungeonType: 'farm', slackUserId: playerId },
  });

  assignSelectedPokemon(battle, playerId, {
    id: 1,
    species_id: 1,
    level: 10,
    attack: 40,
    magic: 35,
    defense: 20,
    hp: 120,
    current_hp: 120,
    speed: 25,
    pokemon_species: { id: 1, name: 'PlayerMon', element_types: ['normal'] },
    magicSlots: [],
  });
  assignSelectedPokemon(battle, DUNGEON_ENEMY_USER_ID, {
    id: 2,
    species_id: 2,
    level: 10,
    attack: 30,
    magic: 30,
    defense: 15,
    hp: 120,
    current_hp: 120,
    speed: 25,
    pokemon_species: { id: 2, name: 'EnemyMon', element_types: ['normal'] },
    magicSlots: [],
  });
  startBattle(battle);
  battle.currentTurnUserId = DUNGEON_ENEMY_USER_ID;

  const { enemyTurns } = processEnemyTurnIfNeeded({ battle, trigger: 'test_initial_enemy_turn' });

  assert.equal(enemyTurns.length, 1);
  assert.equal(enemyTurns[0].action.actionType, BATTLE_ACTION.ATTACK);
  assert.notEqual(battle.currentTurnUserId, DUNGEON_ENEMY_USER_ID);
});
