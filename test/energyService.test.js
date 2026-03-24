const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateEnergyState } = require('../services/energyService');

test('calculateEnergyState aplica reset diário para energia máxima', () => {
  const state = calculateEnergyState({
    currentEnergy: 1,
    maxEnergy: 5,
    lastEnergyUpdate: '2026-03-23T10:00:00.000Z',
    now: new Date('2026-03-24T01:00:00.000Z'),
  });

  assert.equal(state.currentEnergy, 5);
  assert.equal(state.resetApplied, true);
});

test('calculateEnergyState regenera +1 a cada 2 horas sem ultrapassar máximo', () => {
  const state = calculateEnergyState({
    currentEnergy: 2,
    maxEnergy: 5,
    lastEnergyUpdate: '2026-03-24T00:00:00.000Z',
    now: new Date('2026-03-24T06:30:00.000Z'),
  });

  assert.equal(state.currentEnergy, 5);
  assert.equal(state.regenerated, 3);
});
