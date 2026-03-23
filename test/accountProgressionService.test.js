const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAPTURE_ACCOUNT_XP,
  getXpRequiredForLevel,
  getAccountLevelSnapshot,
  renderProgressBar,
} = require('../services/accountProgressionService');

test('getXpRequiredForLevel follows +50 curve', () => {
  assert.equal(getXpRequiredForLevel(1), 100);
  assert.equal(getXpRequiredForLevel(2), 150);
  assert.equal(getXpRequiredForLevel(3), 200);
});

test('getAccountLevelSnapshot computes carried xp correctly', () => {
  const snapshot = getAccountLevelSnapshot(260);
  assert.equal(snapshot.level, 3);
  assert.equal(snapshot.currentLevelXp, 10);
  assert.equal(snapshot.xpToNextLevel, 200);
});

test('renderProgressBar fills proportionally', () => {
  assert.equal(renderProgressBar(50, 100, 10), '█████░░░░░');
});

test('capture xp table includes mythical reward', () => {
  assert.equal(CAPTURE_ACCOUNT_XP.mythical, 1000);
});
