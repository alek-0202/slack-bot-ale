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
  assert.match(text, /🧠 Magias/);
  assert.match(text, /!magicregister/);
  assert.match(text, /!mrskill/);
  assert.match(text, /x1, x10, x50 e x100/);
  assert.match(text, /Roleta Mágica/);
  assert.match(text, /Prisma PRIME/);
  assert.match(text, /!fusão/);
  assert.match(text, /Fragmento Épico/);
  assert.match(text, /Fragmento Prismático/);
  assert.match(text, /!pa/);
  assert.match(text, /!pokeid/);
  assert.doesNotMatch(text, /Dungeon 60/i);
});
