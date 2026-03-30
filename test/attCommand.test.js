const test = require('node:test');
const assert = require('node:assert/strict');

const attCommand = require('../commands/att');

test('!att envia changelog da versão atual com blocos e melhorias recentes', async () => {
  const calls = [];
  await attCommand.execute({
    say: async (payload) => calls.push(payload),
  });

  assert.equal(calls.length, 1);

  const payload = calls[0];
  const text = payload.text;

  assert.match(text, /Atualização de Produção/);
  assert.match(text, /⚔️ Combate \/ PvP/);
  assert.match(text, /3 Pokémons/);
  assert.match(text, /!surrender/);
  assert.match(text, /2000 gold/);
  assert.match(text, /4000 gold/);
  assert.match(text, /Dungeon 60/i);
  assert.match(text, /mítico/i);
  assert.match(text, /Essência Pokémon/);
  assert.match(text, /!sellall/);
  assert.match(text, /!prarity/);
  assert.match(text, /!pelement/);
  assert.doesNotMatch(text, /fogo\/água/i);
});
