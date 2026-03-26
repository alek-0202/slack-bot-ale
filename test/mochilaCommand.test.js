const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMochilaPayload } = require('../commands/pokemon/mochila');

test('buildMochilaPayload inclui essência Pokémon e itens', () => {
  const payload = buildMochilaPayload('U123', [
    { item_name: 'Pokebola (!c)', quantity: 3, description: 'Captura rápida' },
  ], '1500');

  assert.match(payload.text, /Essência Pokémon:\* x1\.500/);
  assert.match(payload.text, /Pokebola \(!c\)\* x3/);
});

test('buildMochilaPayload mostra fallback quando não há itens', () => {
  const payload = buildMochilaPayload('U123', [], '0');

  assert.match(payload.text, /Essência Pokémon:\* x0/);
  assert.match(payload.text, /Sem itens no momento/);
});
