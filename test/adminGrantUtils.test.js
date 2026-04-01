const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTargetAndQuantity } = require('../commands/adminGrantUtils');
const { buildOpenBagMessage } = require('../commands/openbag');
const { getFarmReward, pickFarmDungeonLevel60CapturedSpecies } = require('../services/dungeonService');

test('parseTargetAndQuantity valida menção e quantidade positiva', () => {
  assert.deepEqual(parseTargetAndQuantity('<@U123> 10'), {
    ok: true,
    targetUserId: 'U123',
    quantity: 10,
  });

  assert.equal(parseTargetAndQuantity('10').ok, false);
  assert.equal(parseTargetAndQuantity('<@U123> 0').ok, false);
  assert.equal(parseTargetAndQuantity('<@U123> -1').ok, false);
});

test('openbag renderiza resumo da recompensa com snapshot da dungeon 60', () => {
  const text = buildOpenBagMessage('U123', {
    rewards: {
      capturedSpecies: { name: 'Gengar' },
      rewards: {
        xpResult: { grantedXp: 6000 },
        goldReward: '50000',
        rewardSnapshot: { ancientBookQty: 50, pokeballCQty: 10 },
      },
    },
  });

  assert.match(text, /XP: \+6000/);
  assert.match(text, /Gold: \+50000/);
  assert.match(text, /Livro Ancião: \+50/);
  assert.match(text, /Pokebola \(!c\): \+10/);
  assert.match(text, /Gengar/);
});

test('helper de recompensa da dungeon 60 mantém configuração esperada', () => {
  const reward = getFarmReward(60);
  assert.equal(reward.gold, 50000);
  assert.equal(reward.accountXp, 6000);
  assert.equal(reward.ancientBookQty, 50);
  assert.equal(reward.pokeballCQty, 10);

  const sample = pickFarmDungeonLevel60CapturedSpecies([
    { id: 1, rarity: 'epic' },
    { id: 2, rarity: 'legendary' },
    { id: 3, rarity: 'mythical' },
  ]);
  assert.ok([1, 2, 3].includes(sample.id));
});
