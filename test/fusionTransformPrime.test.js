const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/fusionService.js');
const dbPath = path.resolve(__dirname, '../database/supabase.js');
const lookupPath = path.resolve(__dirname, '../services/pokemonLookupService.js');
const inventoryPath = path.resolve(__dirname, '../services/inventoryService.js');
const catalogPath = path.resolve(__dirname, '../services/fusionCatalogService.js');
const healingPath = path.resolve(__dirname, '../services/healingStationService.js');
const statsPath = path.resolve(__dirname, '../services/pokemonStatsService.js');
const userServicePath = path.resolve(__dirname, '../services/userService.js');

function loadFusionService({
  getSupabaseClientImpl,
  getOwnedPokemonByIdImpl,
  removeItemImpl,
  assertPokemonAvailableForActionImpl,
  calculatePokemonStatsImpl,
  ivRanges,
}) {
  [
    servicePath,
    dbPath,
    lookupPath,
    inventoryPath,
    catalogPath,
    healingPath,
    statsPath,
    userServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { getSupabaseClient: getSupabaseClientImpl },
  };
  require.cache[lookupPath] = {
    id: lookupPath,
    filename: lookupPath,
    loaded: true,
    exports: { getOwnedPokemonById: getOwnedPokemonByIdImpl },
  };
  require.cache[inventoryPath] = {
    id: inventoryPath,
    filename: inventoryPath,
    loaded: true,
    exports: {
      getUserItemQuantity: async () => 0,
      removeItem: removeItemImpl,
      addItem: async () => ({ ok: true }),
    },
  };
  require.cache[catalogPath] = {
    id: catalogPath,
    filename: catalogPath,
    loaded: true,
    exports: {
      getFusionItem: () => null,
      listFusionItems: () => [],
    },
  };
  require.cache[healingPath] = {
    id: healingPath,
    filename: healingPath,
    loaded: true,
    exports: { assertPokemonAvailableForAction: assertPokemonAvailableForActionImpl },
  };
  require.cache[statsPath] = {
    id: statsPath,
    filename: statsPath,
    loaded: true,
    exports: {
      rollPokemonIvOffsets: () => ({ attack_iv: 0, magic_iv: 0, defense_iv: 0, hp_iv: 0, speed_iv: 0 }),
      calculatePokemonStats: calculatePokemonStatsImpl,
      IV_STAT_RANGES: ivRanges,
    },
  };
  require.cache[userServicePath] = {
    id: userServicePath,
    filename: userServicePath,
    loaded: true,
    exports: { getUser: async () => null },
  };

  const service = require(servicePath);

  [
    servicePath,
    dbPath,
    lookupPath,
    inventoryPath,
    catalogPath,
    healingPath,
    statsPath,
    userServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  return service;
}

test('useTransform com prime aplica IV máximo em todos os atributos', async () => {
  let updatePayload = null;
  const pokemon = {
    id: 5493,
    slack_user_id: 'U123',
    level: 1,
    attack: 80,
    magic: 62,
    defense: 83,
    hp: 80,
    current_hp: 80,
    speed: 68,
    attack_iv: 7,
    magic_iv: -8,
    defense_iv: 11,
    hp_iv: -2,
    speed_iv: 1,
    shiny: false,
    shiny_type: null,
    pokemon_species: { rarity: 'mythical' },
  };
  const ivRanges = {
    attack: { min: -6, max: 12 },
    defense: { min: -6, max: 12 },
    magic: { min: -8, max: 18 },
    hp: { min: -10, max: 20 },
    speed: { min: -5, max: 15 },
  };

  const { useTransform } = loadFusionService({
    getSupabaseClientImpl: () => ({
      from() {
        return {
          update(payload) {
            updatePayload = payload;
            return {
              eq() { return this; },
              select() { return this; },
              single: async () => ({ data: { id: pokemon.id }, error: null }),
            };
          },
        };
      },
    }),
    getOwnedPokemonByIdImpl: async () => pokemon,
    removeItemImpl: async () => ({ ok: true }),
    assertPokemonAvailableForActionImpl: async () => ({ ok: true }),
    calculatePokemonStatsImpl: ({ ivOffsets }) => ({
      attack: 100 + Number(ivOffsets.attack_iv || 0),
      magic: 100 + Number(ivOffsets.magic_iv || 0),
      defense: 100 + Number(ivOffsets.defense_iv || 0),
      hp: 100 + Number(ivOffsets.hp_iv || 0),
      speed: 100 + Number(ivOffsets.speed_iv || 0),
    }),
    ivRanges,
  });

  const result = await useTransform({ slackUserId: 'U123', pokemonId: pokemon.id, prime: true });

  assert.equal(result.ok, true);
  assert.equal(updatePayload.attack_iv, ivRanges.attack.max);
  assert.equal(updatePayload.magic_iv, ivRanges.magic.max);
  assert.equal(updatePayload.defense_iv, ivRanges.defense.max);
  assert.equal(updatePayload.hp_iv, ivRanges.hp.max);
  assert.equal(updatePayload.speed_iv, ivRanges.speed.max);
  assert.equal(updatePayload.shiny, true);
  assert.equal(updatePayload.shiny_type, 'prime');
});

test('useTransform com shiny normal também aplica IV máximo em todos os atributos', async () => {
  let updatePayload = null;
  const pokemon = {
    id: 8891,
    slack_user_id: 'U999',
    level: 1,
    attack: 80,
    magic: 62,
    defense: 83,
    hp: 80,
    current_hp: 80,
    speed: 68,
    attack_iv: -1,
    magic_iv: -2,
    defense_iv: -3,
    hp_iv: -4,
    speed_iv: -5,
    shiny: false,
    shiny_type: null,
    pokemon_species: { rarity: 'rare' },
  };
  const ivRanges = {
    attack: { min: -6, max: 12 },
    defense: { min: -6, max: 12 },
    magic: { min: -8, max: 18 },
    hp: { min: -10, max: 20 },
    speed: { min: -5, max: 15 },
  };

  const { useTransform } = loadFusionService({
    getSupabaseClientImpl: () => ({
      from() {
        return {
          update(payload) {
            updatePayload = payload;
            return {
              eq() { return this; },
              select() { return this; },
              single: async () => ({ data: { id: pokemon.id }, error: null }),
            };
          },
        };
      },
    }),
    getOwnedPokemonByIdImpl: async () => pokemon,
    removeItemImpl: async () => ({ ok: true }),
    assertPokemonAvailableForActionImpl: async () => ({ ok: true }),
    calculatePokemonStatsImpl: ({ ivOffsets }) => ({
      attack: 100 + Number(ivOffsets.attack_iv || 0),
      magic: 100 + Number(ivOffsets.magic_iv || 0),
      defense: 100 + Number(ivOffsets.defense_iv || 0),
      hp: 100 + Number(ivOffsets.hp_iv || 0),
      speed: 100 + Number(ivOffsets.speed_iv || 0),
    }),
    ivRanges,
  });

  const result = await useTransform({ slackUserId: 'U999', pokemonId: pokemon.id, prime: false });

  assert.equal(result.ok, true);
  assert.equal(updatePayload.attack_iv, ivRanges.attack.max);
  assert.equal(updatePayload.magic_iv, ivRanges.magic.max);
  assert.equal(updatePayload.defense_iv, ivRanges.defense.max);
  assert.equal(updatePayload.hp_iv, ivRanges.hp.max);
  assert.equal(updatePayload.speed_iv, ivRanges.speed.max);
  assert.equal(updatePayload.shiny, true);
  assert.equal(updatePayload.shiny_type, 'normal');
});
