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
  assert.match(text, /!dungeon/);
  assert.match(text, /Dungeon diária.*manutenção/i);
  assert.match(text, /1 dungeon = 1 energia/);
  assert.match(text, /recarga de 1 energia a cada 2h/i);
  assert.match(text, /!mochila/);
  assert.match(text, /!c/);
  assert.match(text, /!profile/);
  assert.match(text, /Pokebola/);
});
