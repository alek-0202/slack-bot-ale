const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTshinyResultMessage } = require('../commands/pokemon/tshiny');

test('buildTshinyResultMessage mostra erro de target inválido', () => {
  const text = buildTshinyResultMessage({
    sourcePokemonId: 1,
    targetPokemonId: 2,
    result: { ok: false, reason: 'target_invalid_rarity' },
  });

  assert.match(text, /épico para baixo/);
});

test('buildTshinyResultMessage mostra custo dinâmico em saldo insuficiente e sucesso', () => {
  const insufficient = buildTshinyResultMessage({
    sourcePokemonId: 1,
    targetPokemonId: 2,
    result: { ok: false, reason: 'insufficient_gold', costGold: 15000000 },
  });
  assert.match(insufficient, /15\.000\.000/);

  const success = buildTshinyResultMessage({
    sourcePokemonId: 1,
    targetPokemonId: 2,
    result: { ok: true, cost_gold: 10000000 },
  });
  assert.match(success, /10\.000\.000/);
});
