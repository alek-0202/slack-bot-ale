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
  assert.equal(theme.backgroundCenter, '#EA9A2A');
  assert.equal(theme.backgroundEdge, '#7A3E00');
});

test('getPokemonVisualTheme prioriza shiny prime sobre raridade', () => {
  const theme = getPokemonVisualTheme({ rarity: 'mythical', shiny: true, shinyType: 'prime' });
  assert.equal(theme.backgroundCenter, '#5B0000');
  assert.equal(theme.backgroundEdge, '#1A0000');
});

test('getPokemonVisualTheme mantém raridade quando shiny não é prime', () => {
  const theme = getPokemonVisualTheme({ rarity: 'legendary', shiny: true, shinyType: 'normal' });
  assert.equal(theme.backgroundCenter, '#7C3AED');
  assert.equal(theme.backgroundEdge, '#2E1065');
});
