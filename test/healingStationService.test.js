const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getHealingRatePerMinute,
  getHealingStationUpgradeCost,
} = require('../services/healingStationService');
const { assignSelectedPokemon, createBattle } = require('../application/battle/domain/battleState');
const { calculateBattleHp } = require('../application/battle/domain/battleEngine');

test('healing station progression helpers are deterministic', () => {
  assert.equal(getHealingRatePerMinute(1), 0.5);
  assert.equal(getHealingRatePerMinute(2), 0.7);
  assert.equal(getHealingRatePerMinute(10), 2.3);
  assert.equal(getHealingRatePerMinute(11), 2.7);
  assert.equal(getHealingRatePerMinute(20), 6.3);
  assert.equal(getHealingRatePerMinute(21), 6.9);
  assert.equal(getHealingRatePerMinute(30), 12.3);
  assert.equal(getHealingStationUpgradeCost(1), 7000n);
  assert.equal(getHealingStationUpgradeCost(2), 10000n);
  assert.equal(getHealingStationUpgradeCost(3), 13000n);
});

test('battle selection uses persisted current hp as the starting ratio', () => {
  const battle = createBattle({ channelId: 'C1', challengerId: 'U1', challengedId: 'U2' });
  const player = assignSelectedPokemon(battle, 'U1', {
    id: 10,
    species_id: 25,
    level: 12,
    attack: 20,
    magic: 18,
    defense: 15,
    hp: 40,
    current_hp: 10,
    speed: 16,
    pokemon_species: { name: 'Pikachu', element_types: ['electric'] },
  });
  assert.equal(player.battleHp.max, calculateBattleHp(40));
  assert.equal(player.battleHp.current, Math.round(calculateBattleHp(40) * 0.25));
});
