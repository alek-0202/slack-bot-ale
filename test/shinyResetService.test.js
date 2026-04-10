const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/shinyResetService.js');
const dbPath = path.resolve(__dirname, '../database/supabase.js');
const inventoryPath = path.resolve(__dirname, '../services/inventoryService.js');
const lookupPath = path.resolve(__dirname, '../services/pokemonLookupService.js');
const sellPath = path.resolve(__dirname, '../services/sellService.js');
const statsPath = path.resolve(__dirname, '../services/pokemonStatsService.js');

function loadService({ supabaseClient, pokemon, reward, stats }) {
  [servicePath, dbPath, inventoryPath, lookupPath, sellPath, statsPath].forEach((modulePath) => delete require.cache[modulePath]);

  const addItemCalls = [];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { getSupabaseClient: () => supabaseClient },
  };
  require.cache[inventoryPath] = {
    id: inventoryPath,
    filename: inventoryPath,
    loaded: true,
    exports: {
      addItem: async (...args) => {
        addItemCalls.push(args);
        return { ok: true };
      },
    },
  };
  require.cache[lookupPath] = {
    id: lookupPath,
    filename: lookupPath,
    loaded: true,
    exports: { getOwnedPokemonById: async () => pokemon },
  };
  require.cache[sellPath] = {
    id: sellPath,
    filename: sellPath,
    loaded: true,
    exports: { resolveShinyPrismaticReward: () => reward },
  };
  require.cache[statsPath] = {
    id: statsPath,
    filename: statsPath,
    loaded: true,
    exports: { calculatePokemonStats: () => stats },
  };

  const service = require(servicePath);
  [servicePath, dbPath, inventoryPath, lookupPath, sellPath, statsPath].forEach((modulePath) => delete require.cache[modulePath]);

  return { service, addItemCalls };
}

test('resetPokemonShiny remove shiny, zera IV e concede prismático', async () => {
  const calls = [];
  const supabaseClient = {
    from() {
      return {
        update(payload) {
          calls.push(payload);
          return {
            eq() { return this; },
            select() {
              return {
                maybeSingle: async () => ({
                  data: { id: 10, shiny: false, shiny_type: null, attack_iv: 0, magic_iv: 0, defense_iv: 0, hp_iv: 0, speed_iv: 0 },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  const pokemon = {
    id: 10,
    slack_user_id: 'U1',
    level: 50,
    shiny: true,
    shiny_type: 'prime',
    hp: 200,
    current_hp: 100,
    pokemon_species: { name: 'Mewtwo', rarity: 'mythical' },
  };

  const { service, addItemCalls } = loadService({
    supabaseClient,
    pokemon,
    reward: 500,
    stats: { attack: 10, magic: 10, defense: 10, hp: 120, speed: 10 },
  });

  const result = await service.resetPokemonShiny({ slackUserId: 'U1', pokemonId: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.prismaticReward, 500);
  assert.equal(calls[0].attack_iv, 0);
  assert.equal(calls[0].hp_iv, 0);
  assert.equal(calls[0].current_hp, 60);
  assert.deepEqual(addItemCalls[0], ['U1', 'prismatic_fragment', 500]);
});

test('resetPokemonShiny bloqueia pokemon sem shiny', async () => {
  const { service } = loadService({
    supabaseClient: {},
    pokemon: {
      id: 10,
      slack_user_id: 'U1',
      shiny: false,
      pokemon_species: { rarity: 'legendary' },
    },
    reward: 100,
    stats: { attack: 1, magic: 1, defense: 1, hp: 1, speed: 1 },
  });

  const result = await service.resetPokemonShiny({ slackUserId: 'U1', pokemonId: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'pokemon_not_shiny');
});
