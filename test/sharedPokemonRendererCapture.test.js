const test = require('node:test');
const assert = require('node:assert/strict');

const { renderSlackCaptureResult } = require('../adapters/slack/renderers/sharedPokemonRenderer');

test('renderSlackCaptureResult aplica bônus lendário na base exibida e mantém IV separado', () => {
  const message = renderSlackCaptureResult({
    slackUserId: 'U1',
    result: {
      ok: true,
      shiny: false,
      goldReward: '1000',
      accountXpReward: 20,
      captured: {
        id: 99,
        level: 1,
        attack_iv: 2,
        defense_iv: -1,
        magic_iv: 3,
        hp_iv: 4,
        speed_iv: 0,
      },
      species: {
        name: 'Mewtwo',
        rarity: 'legendary',
        element_types: [],
        base_attack: 40,
        base_defense: 30,
        base_magic: 50,
        base_hp: 60,
        base_speed: 35,
      },
    },
  });

  assert.match(message.text, /ATK: 55 \(\+2\)/);
  assert.match(message.text, /DEF: 45 \(-1\)/);
  assert.match(message.text, /MAG: 65 \(\+3\)/);
  assert.match(message.text, /HP: 75 \(\+4\)/);
  assert.match(message.text, /SPD: 50 \(\+0\)/);
});
