const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const commandPath = path.resolve(__dirname, '../commands/pokemon/capture.js');
const useCasePath = path.resolve(__dirname, '../application/useCases/pokemon/captureForUser.js');
const rendererPath = path.resolve(__dirname, '../adapters/slack/renderers/sharedPokemonRenderer.js');

function loadCaptureCommand({ captureForUserImpl, renderImpl }) {
  delete require.cache[commandPath];
  delete require.cache[useCasePath];
  delete require.cache[rendererPath];

  require.cache[useCasePath] = {
    id: useCasePath,
    filename: useCasePath,
    loaded: true,
    exports: { captureForUser: captureForUserImpl },
  };

  require.cache[rendererPath] = {
    id: rendererPath,
    filename: rendererPath,
    loaded: true,
    exports: { renderSlackCaptureResult: renderImpl },
  };

  const command = require(commandPath);

  delete require.cache[commandPath];
  delete require.cache[useCasePath];
  delete require.cache[rendererPath];

  return command;
}

test('!capture encaminha contexto para o use case e envia payload renderizado', async () => {
  const calls = [];
  const command = loadCaptureCommand({
    captureForUserImpl: async (payload) => {
      calls.push(payload);
      return { ok: true, captured: { id: 77, level: 1 }, species: { name: 'Pikachu', rarity: 'rare', element_types: [] }, shiny: false, goldReward: 250 };
    },
    renderImpl: ({ slackUserId, result }) => ({ text: `capturado ${slackUserId} ${result.captured.id}` }),
  });

  const sent = [];
  await command.execute({
    event: { user: 'U123', channel: 'C999', text: '!capture agora' },
    args: 'agora',
    say: async (payload) => sent.push(payload),
  });

  assert.deepEqual(calls, [{ userId: 'U123', channelId: 'C999', platform: 'slack', rawText: '!capture agora' }]);
  assert.deepEqual(sent, [{ text: 'capturado U123 77' }]);
});

test('!capture faz fallback para texto simples se o payload rico falhar no Slack', async () => {
  const command = loadCaptureCommand({
    captureForUserImpl: async () => ({ ok: true, captured: { id: 10, level: 1 }, species: { name: 'Eevee', rarity: 'common', element_types: [] }, shiny: false, goldReward: 100 }),
    renderImpl: () => ({ text: 'fallback-texto', blocks: [{ type: 'section' }] }),
  });

  const sent = [];
  let callCount = 0;
  await command.execute({
    event: { user: 'U1', channel: 'C1', text: '!capture' },
    args: '',
    say: async (payload) => {
      callCount += 1;
      if (callCount === 1) {
        const error = new Error('invalid_blocks');
        error.code = 'slack_webapi_platform_error';
        throw error;
      }
      sent.push(payload);
    },
  });

  assert.equal(callCount, 2);
  assert.deepEqual(sent, ['fallback-texto']);
});
