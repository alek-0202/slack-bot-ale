const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPokemonVisualBlocks,
  buildSlackImageAccessory,
  publishRenderedImageUrl,
  getLevelBorderStyle,
  isSlackCompatibleImageUrl,
  resolveSlackCompatibleImageUrl,
} = require('../adapters/slack/renderers/pokemonVisualBlocks');
const { buildPokedexMessage } = require('../services/pokedexViewService');

test('getLevelBorderStyle mantém as mesmas faixas visuais existentes', () => {
  assert.equal(getLevelBorderStyle(10).hex, '#D1D5DB');
  assert.equal(getLevelBorderStyle(20).hex, '#1E3A8A');
  assert.equal(getLevelBorderStyle(30).hex, '#7B1FA2');
  assert.equal(getLevelBorderStyle(40).hex, '#C62828');
  assert.equal(getLevelBorderStyle(50).hex, '#D4AF37');
});

test('buildPokemonVisualBlocks expõe accessory à direita e não inclui texto de moldura', async () => {
  const species = {
    id: 25,
    name: 'Pikachu',
    sprite_url: 'https://example.com/pikachu.png',
    rarity: 'rare',
    element_types: ['electric'],
    evolves_to: null,
  };

  const visual = await buildPokemonVisualBlocks({ species, level: 20, shiny: true });

  assert.equal(visual.accessory?.type, 'image');
  assert.ok(typeof visual.accessory?.image_url === 'string');
  assert.match(visual.accessory?.alt_text || '', /Pikachu/);
  assert.ok(!Object.hasOwn(visual.accessory, 'title'));
  assert.equal(visual.blocks.length, 1);
  assert.equal(visual.blocks[0].type, 'context');
  assert.ok(visual.blocks[0].elements.every((element) => !element.text.includes('Moldura:')));
});

test('buildPokedexMessage usa accessory no section principal e remove linha textual de moldura', async () => {
  const message = await buildPokedexMessage({
    slackUserId: 'U123',
    index: 0,
    total: 1,
    mode: 'pokedex',
    entry: {
      id: 77,
      species_id: 25,
      level: 50,
      shiny: true,
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
  assert.match(message.blocks[0].accessory?.image_url || '', /^data:image\/svg\+xml/);
  assert.ok(!Object.hasOwn(message.blocks[0].accessory, 'title'));
  assert.ok(!message.blocks[0].text.text.includes('Moldura:'));
});

test('isSlackCompatibleImageUrl rejeita referências inválidas para image_url', () => {
  assert.equal(isSlackCompatibleImageUrl('data:image/png;base64,abc123'), false);
  assert.equal(isSlackCompatibleImageUrl('C:\\\\Users\\\\bot\\\\render.png'), false);
  assert.equal(isSlackCompatibleImageUrl('/tmp/render.png'), false);
  assert.equal(isSlackCompatibleImageUrl('https://example.com/pikachu.png'), true);
});

test('resolveSlackCompatibleImageUrl usa fallback quando render em camadas gera data URI', () => {
  const resolved = resolveSlackCompatibleImageUrl({
    layeredImageUrl: 'data:image/png;base64,abc123',
    fallbackImageUrl: 'https://example.com/fallback.png',
    context: { test: true },
  });

  assert.equal(resolved.source, 'species_sprite_url');
  assert.equal(resolved.imageUrl, 'https://example.com/fallback.png');
});

test('buildSlackImageAccessory usa image_url quando referência final é URL pública válida', () => {
  const accessory = buildSlackImageAccessory({
    finalImage: { type: 'http_url', url: 'https://example.com/render.png' },
    altText: 'pokemon',
    context: { test: true },
  });

  assert.deepEqual(accessory, {
    type: 'image',
    image_url: 'https://example.com/render.png',
    alt_text: 'pokemon',
  });
});

test('publishRenderedImageUrl cria URL pública curta quando base URL está configurada', () => {
  const previousBaseUrl = process.env.RENDERED_IMAGE_PUBLIC_BASE_URL;
  process.env.RENDERED_IMAGE_PUBLIC_BASE_URL = 'https://img.example.com';

  const published = publishRenderedImageUrl({
    pngBuffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
    species: { id: 25, name: 'Pikachu' },
    level: 10,
    shiny: false,
    commandName: 'test',
  });

  if (previousBaseUrl === undefined) {
    delete process.env.RENDERED_IMAGE_PUBLIC_BASE_URL;
  } else {
    process.env.RENDERED_IMAGE_PUBLIC_BASE_URL = previousBaseUrl;
  }

  assert.equal(published.ok, true);
  assert.equal(published.format, 'public_url');
  assert.match(published.imageUrl, /^https:\/\/img\.example\.com\/rendered-images\/[A-Za-z0-9_-]+$/);
});

test('publishRenderedImageUrl falha sem base URL pública configurada', () => {
  const previousBaseUrl = process.env.RENDERED_IMAGE_PUBLIC_BASE_URL;
  const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  delete process.env.RENDERED_IMAGE_PUBLIC_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;

  const published = publishRenderedImageUrl({
    pngBuffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
  });

  if (previousBaseUrl === undefined) {
    delete process.env.RENDERED_IMAGE_PUBLIC_BASE_URL;
  } else {
    process.env.RENDERED_IMAGE_PUBLIC_BASE_URL = previousBaseUrl;
  }

  if (previousPublicBaseUrl === undefined) {
    delete process.env.PUBLIC_BASE_URL;
  } else {
    process.env.PUBLIC_BASE_URL = previousPublicBaseUrl;
  }

  assert.equal(published.ok, false);
  assert.equal(published.reason, 'missing_public_base_url');
});
