const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPokemonLayeredImageUrl } = require('../adapters/slack/renderers/pokemonCardImageRenderer');

test('buildPokemonLayeredImageUrl não usa mais roxo por nível 50 sem shiny', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/mew.png',
    level: 50,
    shiny: false,
    speciesName: 'Mew',
  });

  const svg = decodeURIComponent(url || '');
  assert.doesNotMatch(svg, /#8A2BE2/);
  assert.match(svg, /opacity="0"/);
  assert.match(svg, /frameGradient/);
});

test('buildPokemonLayeredImageUrl usa fundo roxo para shiny sem sparkles legados', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/pikachu.png',
    level: 40,
    shiny: true,
    speciesName: 'Pikachu',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#8A2BE2/);
  assert.doesNotMatch(svg, /sparkleGlow/);
  assert.match(svg, /feDropShadow dx="0" dy="3"/);
});
