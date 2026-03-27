const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getBackgroundByRarity,
  getBorderByState,
  getPokemonVisualTheme,
} = require('../adapters/slack/renderers/pokemonRarityVisualTheme');

test('getBackgroundByRarity aplica tema lendário', () => {
  const theme = getBackgroundByRarity({ rarity: 'legendary' });
  assert.equal(theme.backgroundCenter, '#7C3AED');
  assert.equal(theme.backgroundEdge, '#2E1065');
});

test('getBackgroundByRarity aplica tema mítico', () => {
  const theme = getBackgroundByRarity({ rarity: 'mythical' });
  assert.equal(theme.backgroundCenter, '#EA9A2A');
  assert.equal(theme.backgroundEdge, '#7A3E00');
});

test('getBorderByState usa borda shiny prime quando necessário', () => {
  const border = getBorderByState({ shiny: true, shinyType: 'prime' });
  assert.equal(border.isPrime, true);
  assert.equal(border.frameStart, '#0B0B0B');
  assert.equal(border.innerStroke, '#EF4444');
});

test('getBorderByState mantém borda normal para shiny não-prime', () => {
  const border = getBorderByState({ shiny: true, shinyType: 'normal' });
  assert.equal(border.isPrime, false);
  assert.equal(border.frameStart, null);
  assert.equal(border.innerStroke, '#FFF8CC');
});

test('getPokemonVisualTheme mantém fundo por raridade e borda por estado', () => {
  const theme = getPokemonVisualTheme({ rarity: 'mythical', shiny: true, shinyType: 'prime' });
  assert.equal(theme.backgroundCenter, '#EA9A2A');
  assert.equal(theme.backgroundEdge, '#7A3E00');
  assert.equal(theme.border.isPrime, true);
  assert.equal(theme.border.frameStart, '#0B0B0B');
});
