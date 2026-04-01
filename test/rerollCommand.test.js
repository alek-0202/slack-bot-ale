const test = require('node:test');
const assert = require('node:assert/strict');

test('reroll command shows pokemon name, level and IV comparison old -> new', async () => {
  const fusionServicePath = require.resolve('../services/fusionService');
  const rerollCommandPath = require.resolve('../commands/pokemon/reroll');

  const originalFusionModule = require.cache[fusionServicePath];
  const originalRerollModule = require.cache[rerollCommandPath];

  require.cache[fusionServicePath] = {
    exports: {
      useReroll: async () => ({
        ok: true,
        pokemon: { level: 50, pokemon_species: { name: 'Mew' } },
        previousIvOffsets: { attack_iv: 3, defense_iv: 5, magic_iv: 1, speed_iv: 7, hp_iv: 4 },
        nextIvOffsets: { attack_iv: 8, defense_iv: 2, magic_iv: 10, speed_iv: 4, hp_iv: 6 },
      }),
    },
  };
  delete require.cache[rerollCommandPath];
  const command = require('../commands/pokemon/reroll');

  const messages = [];
  await command.execute({
    event: { user: 'U123' },
    args: '10',
    say: async (text) => { messages.push(text); },
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0], /Mew Nvl 50/);
  assert.match(messages[0], /Attack: \+3 -> \+8/);
  assert.match(messages[0], /Defense: \+5 -> \+2/);
  assert.match(messages[0], /Magic: \+1 -> \+10/);
  assert.match(messages[0], /Speed: \+7 -> \+4/);
  assert.match(messages[0], /HP: \+4 -> \+6/);

  if (originalFusionModule) require.cache[fusionServicePath] = originalFusionModule;
  else delete require.cache[fusionServicePath];
  if (originalRerollModule) require.cache[rerollCommandPath] = originalRerollModule;
  else delete require.cache[rerollCommandPath];
});
