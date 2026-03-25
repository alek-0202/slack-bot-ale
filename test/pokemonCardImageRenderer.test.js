const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPokemonLayeredImageUrl } = require('../adapters/slack/renderers/pokemonCardImageRenderer');

test('buildPokemonLayeredImageUrl inclui aura roxa para nível 50', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/mew.png',
    level: 50,
    shiny: false,
    speciesName: 'Mew',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#8A2BE2/);
  assert.match(svg, /opacity="0\.22"/);
  assert.match(svg, /frameGradient/);
});

test('buildPokemonLayeredImageUrl inclui sparkles para shiny sem overlay branco', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/pikachu.png',
    level: 40,
    shiny: true,
    speciesName: 'Pikachu',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /sparkleGlow/);
  assert.doesNotMatch(svg, /fill="#FFFFFF" opacity="0\.8"/);
  assert.match(svg, /feDropShadow dx="0" dy="3"/);
});
