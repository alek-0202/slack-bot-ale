const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const useCasePath = path.resolve(__dirname, '../application/useCases/pokemon/captureForUser.js');
const servicePath = path.resolve(__dirname, '../services/captureService.js');

function loadUseCase(capturePokemonImpl) {
  delete require.cache[useCasePath];
  delete require.cache[servicePath];

  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: { capturePokemon: capturePokemonImpl },
  };

  const useCase = require(useCasePath);

  delete require.cache[useCasePath];
  delete require.cache[servicePath];

  return useCase;
}

test('captureForUser repassa contexto opcional para o serviço de captura', async () => {
  const calls = [];
  const { captureForUser } = loadUseCase(async (userId, context) => {
    calls.push({ userId, context });
    return { ok: true };
  });

  const result = await captureForUser({
    userId: 'U777',
    channelId: 'C222',
    platform: 'slack',
    rawText: '!capture',
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{
    userId: 'U777',
    context: {
      channelId: 'C222',
      platform: 'slack',
      rawText: '!capture',
    },
  }]);
});
