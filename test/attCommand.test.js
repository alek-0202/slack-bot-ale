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
  assert.match(text, /⚔️ Combate/);
  assert.match(text, /🐉 Características e Passivas/);
  assert.match(text, /🧩 Magias Características/);
  assert.match(text, /!codex/);
  assert.match(text, /!applycodex/);
  assert.match(text, /Tomo Lendário/);
  assert.match(text, /!mrskill/);
  assert.match(text, /dracônico/i);
  assert.match(text, /fragmentos/i);
  assert.match(text, /shiny\/prime/i);
  assert.match(text, /Details/);
  assert.doesNotMatch(text, /Dungeon 60/i);
});
