const test = require('node:test');
const assert = require('node:assert/strict');

const attCommand = require('../commands/att');

test('!att envia changelog da versão atual com novidades principais', async () => {
  const calls = [];
  await attCommand.execute({
    say: async (payload) => calls.push(payload),
  });

  assert.equal(calls.length, 1);

  const payload = calls[0];
  const text = payload.text;

  assert.match(text, /Atualização de Produção/);
  assert.match(text, /Essência Pokémon/);
  assert.match(text, /!sell/);
  assert.match(text, /!daily/);
  assert.match(text, /!tshiny/);
  assert.match(text, /shiny normal/i);
  assert.match(text, /shiny prime/i);
  assert.match(text, /botão \*Stats\*/i);
  assert.match(text, /!mochila/);
  assert.match(text, /fundo roxo/i);
});
