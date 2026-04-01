const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFragmentBonusLine } = require('../handlers/pokemonActions');

test('buildFragmentBonusLine inclui fragmento comum no resumo de venda', () => {
  const line = buildFragmentBonusLine({
    commonFragment: 20,
    epicFragment: 1,
    legendaryFragment: 0,
    mythicalFragment: 0,
    prismaticFragment: 0,
  });

  assert.match(line, /\+20 comum/);
  assert.match(line, /\+1 épico/);
  assert.match(line, /\+0 prismático/);
});

test('buildFragmentBonusLine oculta linha quando não há fragmentos', () => {
  const line = buildFragmentBonusLine({
    commonFragment: 0,
    epicFragment: 0,
    legendaryFragment: 0,
    mythicalFragment: 0,
    prismaticFragment: 0,
  });

  assert.equal(line, '');
});
