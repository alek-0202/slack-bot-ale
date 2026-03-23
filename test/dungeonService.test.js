const test = require('node:test');
const assert = require('node:assert/strict');

const { getFarmReward, decideAiAction, FARM_LEVELS } = require('../services/dungeonService');
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
