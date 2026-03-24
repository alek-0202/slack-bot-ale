const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPokemonVisualBlocks,
  extractSlackFileId,
  buildSlackImageAccessory,
  getLevelBorderStyle,
  isSlackCompatibleImageUrl,
  isSupportedSlackImageFile,
  isPngBuffer,
  resolveSlackCompatibleImageUrl,
  summarizeUploadedSlackFile,
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

test('extractSlackFileId suporta shape real do uploadV2 com resposta aninhada', () => {
  const uploadResponse = {
    ok: true,
    files: [
      {
        ok: true,
        files: [
          {
            id: 'F_RENDER_123',
          },
        ],
      },
    ],
  };

  const extracted = extractSlackFileId(uploadResponse);

  assert.equal(extracted.slackFileId, 'F_RENDER_123');
  assert.equal(extracted.extractedFrom, 'files[0].files[0].id');
});

test('buildSlackImageAccessory converte tipo interno slack_file_id para schema oficial do Block Kit', () => {
  const accessory = buildSlackImageAccessory({
    finalImage: { type: 'slack_file_id', id: 'F0ANQ48DZC4' },
    altText: 'pokemon',
    context: { test: true },
  });

  assert.deepEqual(accessory, {
    type: 'image',
    alt_text: 'pokemon',
    slack_file: {
      id: 'F0ANQ48DZC4',
    },
  });
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

test('isPngBuffer detecta assinatura binária PNG', () => {
  const pngLike = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const jpegLike = Buffer.from('ffd8ffe000104a4649460001', 'hex');

  assert.equal(isPngBuffer(pngLike), true);
  assert.equal(isPngBuffer(jpegLike), false);
});

test('isSupportedSlackImageFile aceita apenas tipos de imagem compatíveis com slack_file no Block Kit', () => {
  assert.equal(isSupportedSlackImageFile({ mimetype: 'image/png', filetype: 'png' }), true);
  assert.equal(isSupportedSlackImageFile({ mimetype: 'image/jpeg', filetype: 'jpg' }), true);
  assert.equal(isSupportedSlackImageFile({ mimetype: 'image/webp', filetype: 'webp' }), false);
  assert.equal(isSupportedSlackImageFile({ mimetype: 'application/octet-stream', filetype: 'binary' }), false);
});

test('summarizeUploadedSlackFile lê metadados principais retornados no upload V2', () => {
  const summary = summarizeUploadedSlackFile({
    ok: true,
    files: [
      {
        files: [
          {
            id: 'F123',
            name: 'pokemon-card.png',
            mimetype: 'image/png',
            filetype: 'png',
            pretty_type: 'PNG',
            url_private: 'https://files.slack.com/files-pri/T1-F123/image.png',
            permalink: 'https://workspace.slack.com/files/U1/F123',
          },
        ],
      },
    ],
  });

  assert.deepEqual(summary, {
    id: 'F123',
    name: 'pokemon-card.png',
    mimetype: 'image/png',
    filetype: 'png',
    prettyType: 'PNG',
    urlPrivate: 'https://files.slack.com/files-pri/T1-F123/image.png',
    permalink: 'https://workspace.slack.com/files/U1/F123',
    isImageEligible: true,
  });
});
