const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const useCasePath = path.resolve(__dirname, '../application/useCases/pokemon/captureForUser.js');
const servicePath = path.resolve(__dirname, '../services/captureService.js');

test('captureForUser encaminha opções de captura avançada', async () => {
  delete require.cache[useCasePath];
  delete require.cache[servicePath];

  const calls = [];
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      capturePokemon: async (...args) => {
        calls.push(args);
        return { ok: true };
      },
    },
  };

  const { captureForUser } = require(useCasePath);
  await captureForUser({ userId: 'U1', source: 'pokeball_c', bypassCooldown: true, skipCooldownWrite: true });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'U1');
  assert.equal(calls[0][1].source, 'pokeball_c');
  assert.equal(calls[0][1].bypassCooldown, true);
  assert.equal(calls[0][1].skipCooldownWrite, true);

  delete require.cache[useCasePath];
  delete require.cache[servicePath];
});
