const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPokemonVisualBlocks } = require('../adapters/slack/renderers/pokemonVisualBlocks');
const { buildPokedexMessage } = require('../services/pokedexViewService');

test('buildPokemonVisualBlocks expõe accessory à direita e não inclui texto de moldura', () => {
  const species = {
    id: 25,
    name: 'Pikachu',
    sprite_url: 'https://example.com/pikachu.png',
    rarity: 'rare',
    element_types: ['electric'],
    evolves_to: null,
  };

  const visual = buildPokemonVisualBlocks({ species, level: 20 });

  assert.equal(visual.accessory?.type, 'image');
  assert.equal(visual.accessory?.image_url, species.sprite_url);
  assert.match(visual.accessory?.alt_text || '', /Pikachu/);
  assert.equal(visual.blocks.length, 1);
  assert.equal(visual.blocks[0].type, 'context');
  assert.ok(visual.blocks[0].elements.every((element) => !element.text.includes('Moldura:')));
});

test('buildPokedexMessage usa accessory no section principal e remove linha textual de moldura', () => {
  const message = buildPokedexMessage({
    slackUserId: 'U123',
    index: 0,
    total: 1,
    mode: 'pokedex',
    entry: {
      id: 77,
      species_id: 25,
      level: 20,
      shiny: false,
      source: 'capture',
      attack: 10,
      defense: 11,
      hp: 12,
      speed: 13,
      quantity: 1,
      pokemonIds: [77],
      pokemon_species: {
        id: 25,
        name: 'Pikachu',
        sprite_url: 'https://example.com/pikachu.png',
        rarity: 'rare',
        element_types: ['electric'],
        evolves_to: null,
      },
    },
  });

  assert.equal(message.blocks[0].type, 'section');
  assert.equal(message.blocks[0].accessory?.type, 'image');
  assert.ok(!message.blocks[0].text.text.includes('Moldura:'));
});
