const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getFarmReward,
  decideAiAction,
  FARM_LEVELS,
  getDungeonEnemyStatModifier,
  balanceDungeonEnemyStats,
} = require('../services/dungeonService');
const { BATTLE_ACTION } = require('../application/battle/domain/actionResolver');

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
