const test = require('node:test');
const assert = require('node:assert/strict');

const { renderSlackUpgradeResult } = require('../adapters/slack/renderers/sharedPokemonRenderer');
const { renderDiscordUpgradeResult } = require('../adapters/discord/renderers/sharedPokemonRenderer');

test('renderSlackUpgradeResult preserva mensagem de sucesso com próximo custo', () => {
  const message = renderSlackUpgradeResult({
    result: {
      ok: true,
      pokemon: { id: 123, pokemon_species: { name: 'Pikachu' } },
      previousLevel: 4,
      newLevel: 5,
      cost: 132,
      remainingGold: 888,
    },
    slackUserId: 'U123',
    maxLevel: 50,
    getNextUpgradeCost: () => 150,
  });

  assert.match(message, /Pikachu/);
  assert.match(message, /#123/);
  assert.match(message, /\*132\* gold/);
  assert.match(message, /\*150 gold\*/);
});

test('renderSlackUpgradeResult preserva mensagem de gold insuficiente', () => {
  const message = renderSlackUpgradeResult({
    result: { ok: false, reason: 'insufficient_gold', cost: 400, currentGold: 25 },
    slackUserId: 'U123',
    maxLevel: 50,
    getNextUpgradeCost: () => 0,
  });

  assert.equal(message, 'Gold insuficiente. Custo para próximo upgrade: *400*. Seu saldo atual: *25*.');
});

test('renderDiscordUpgradeResult preserva mensagem de sucesso', () => {
  const message = renderDiscordUpgradeResult({
    result: {
      ok: true,
      pokemon: { id: 321, pokemon_species: { name: 'Charizard' } },
      previousLevel: 10,
      newLevel: 11,
    },
    maxLevel: 50,
    getNextUpgradeCost: () => 999,
  });

  assert.equal(message, '🛠️ **Charizard** (#321) subiu 10 → 11. Próximo custo: 999 gold.');
});

test('renderDiscordUpgradeResult preserva mensagem de erro por gold insuficiente', () => {
  const message = renderDiscordUpgradeResult({
    result: { ok: false, reason: 'insufficient_gold', cost: 700, currentGold: 100 },
    maxLevel: 50,
    getNextUpgradeCost: () => 0,
  });

  assert.equal(message, 'Gold insuficiente. Custo: 700. Seu gold: 100.');
});
