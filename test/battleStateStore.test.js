const test = require('node:test');
const assert = require('node:assert/strict');

const {
  setBattle,
  getBattle,
  isUserInActiveBattle,
  clearAllActiveBattles,
} = require('../services/battleStateStore');

test('clearAllActiveBattles encerra somente batalhas ativas/seleção', () => {
  const activeBattle = {
    challengerId: 'U1',
    challengedId: 'U2',
    status: 'active',
  };

  const selectingBattle = {
    challengerId: 'U3',
    challengedId: 'U4',
    status: 'selecting',
  };

  const finishedBattle = {
    challengerId: 'U5',
    challengedId: 'U6',
    status: 'finished',
  };

  setBattle('channel-active', activeBattle);
  setBattle('channel-selecting', selectingBattle);
  setBattle('channel-finished', finishedBattle);

  const result = clearAllActiveBattles();

  assert.equal(result.clearedCount, 2);

  assert.equal(getBattle('channel-active'), null);
  assert.equal(getBattle('channel-selecting'), null);
  assert.notEqual(getBattle('channel-finished'), null);

  assert.equal(isUserInActiveBattle('U1'), false);
  assert.equal(isUserInActiveBattle('U2'), false);
  assert.equal(isUserInActiveBattle('U3'), false);
  assert.equal(isUserInActiveBattle('U4'), false);

  clearAllActiveBattles();
});
