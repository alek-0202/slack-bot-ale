const test = require('node:test');
const assert = require('node:assert/strict');

const { getPokemonVisualTheme } = require('../adapters/slack/renderers/pokemonRarityVisualTheme');

test('getPokemonVisualTheme aplica tema lendário', () => {
  const theme = getPokemonVisualTheme({ rarity: 'legendary', shiny: false });
  assert.equal(theme.backgroundCenter, '#7C3AED');
  assert.equal(theme.backgroundEdge, '#2E1065');
});

test('getPokemonVisualTheme aplica tema mítico', () => {
  const theme = getPokemonVisualTheme({ rarity: 'mythical', shiny: false });
  assert.equal(theme.backgroundCenter, '#F59E0B');
  assert.equal(theme.backgroundEdge, '#7C2D12');
});

test('getPokemonVisualTheme prioriza shiny sobre raridade', () => {
  const theme = getPokemonVisualTheme({ rarity: 'mythical', shiny: true });
  assert.equal(theme.backgroundCenter, '#8A2BE2');
  assert.equal(theme.backgroundEdge, '#4B0082');
});
