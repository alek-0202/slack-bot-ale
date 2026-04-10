const test = require('node:test');
const assert = require('node:assert/strict');

const { buildShinyConsistencyPatch } = require('../commands/pokemon/pokeid');

test('buildShinyConsistencyPatch corrige shiny_type e IV para shiny prime', () => {
  const patch = buildShinyConsistencyPatch({
    shiny: true,
    shiny_type: 'PRIME',
    attack_iv: 1,
    magic_iv: 2,
    defense_iv: 3,
    hp_iv: 4,
    speed_iv: 5,
  });

  assert.deepEqual(patch, {
    shiny_type: 'prime',
    attack_iv: 12,
    magic_iv: 18,
    defense_iv: 12,
    hp_iv: 20,
    speed_iv: 15,
  });
});

test('buildShinyConsistencyPatch limpa shiny_type quando pokemon não é shiny', () => {
  const patch = buildShinyConsistencyPatch({
    shiny: false,
    shiny_type: 'prime',
    attack_iv: 7,
    magic_iv: -8,
    defense_iv: 11,
    hp_iv: -2,
    speed_iv: 1,
  });

  assert.deepEqual(patch, {
    shiny_type: null,
  });
});

test('buildShinyConsistencyPatch corrige IV para shiny normal', () => {
  const patch = buildShinyConsistencyPatch({
    shiny: true,
    shiny_type: 'normal',
    attack_iv: 7,
    magic_iv: -8,
    defense_iv: 11,
    hp_iv: -2,
    speed_iv: 1,
  });

  assert.deepEqual(patch, {
    attack_iv: 12,
    magic_iv: 18,
    defense_iv: 12,
    hp_iv: 20,
    speed_iv: 15,
  });
});
