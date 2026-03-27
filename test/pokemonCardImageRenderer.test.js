const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPokemonLayeredImageUrl } = require('../adapters/slack/renderers/pokemonCardImageRenderer');

test('buildPokemonLayeredImageUrl mantém borda dourada de nível 50 mesmo sem shiny', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/mew.png',
    level: 50,
    shiny: false,
    speciesName: 'Mew',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#D4AF37/);
  assert.match(svg, /opacity="0"/);
  assert.match(svg, /frameGradient/);
});

test('buildPokemonLayeredImageUrl mantém fundo por raridade mesmo em shiny normal', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/pikachu.png',
    level: 40,
    shiny: true,
    shinyType: 'normal',
    rarity: 'legendary',
    speciesName: 'Pikachu',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#7C3AED/);
  assert.doesNotMatch(svg, /sparkleGlow/);
  assert.match(svg, /feDropShadow dx="0" dy="3"/);
});


test('buildPokemonLayeredImageUrl usa fundo roxo para lendário não shiny', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/moltres.png',
    level: 10,
    shiny: false,
    rarity: 'legendary',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#7C3AED/);
  assert.match(svg, /#2E1065/);
});

test('buildPokemonLayeredImageUrl usa fundo alaranjado/dourado para mítico não shiny', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/mew.png',
    level: 10,
    shiny: false,
    rarity: 'mythical',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#EA9A2A/);
  assert.match(svg, /#7A3E00/);
});

test('buildPokemonLayeredImageUrl mantém fundo de raridade e aplica borda prime no shiny prime', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/mew.png',
    level: 50,
    shiny: true,
    shinyType: 'prime',
    rarity: 'mythical',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#EA9A2A/);
  assert.match(svg, /#7A3E00/);
  assert.match(svg, /#0B0B0B/);
  assert.match(svg, /#EF4444/);
  assert.doesNotMatch(svg, /M18 34 L238 34/);
});

test('buildPokemonLayeredImageUrl mantém fundo lendário com borda shiny prime', () => {
  const url = buildPokemonLayeredImageUrl({
    spriteUrl: 'https://example.com/mewtwo.png',
    level: 45,
    shiny: true,
    shinyType: 'prime',
    rarity: 'legendary',
  });

  const svg = decodeURIComponent(url || '');
  assert.match(svg, /#7C3AED/);
  assert.match(svg, /#2E1065/);
  assert.match(svg, /#0B0B0B/);
  assert.match(svg, /#EF4444/);
});
