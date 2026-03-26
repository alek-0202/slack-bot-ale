const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/captureService.js');
const rarityPath = path.resolve(__dirname, '../pokemon/rarity.js');
const dbPath = path.resolve(__dirname, '../database/supabase.js');
const userServicePath = path.resolve(__dirname, '../services/userService.js');
const pokemonServicePath = path.resolve(__dirname, '../services/pokemonService.js');
const statsServicePath = path.resolve(__dirname, '../services/pokemonStatsService.js');
const economyServicePath = path.resolve(__dirname, '../services/economyService.js');

function loadCaptureService({
  pickByRarityImpl,
  getSupabaseClientImpl,
  getUserImpl,
  createUserIfMissingImpl,
  getAllSpeciesImpl,
  insertUserPokemonImpl,
  calculatePokemonStatsImpl,
  rollPokemonIvOffsetsImpl,
  getGoldValueByRarityAndLevelImpl,
}) {
  [
    servicePath,
    rarityPath,
    dbPath,
    userServicePath,
    pokemonServicePath,
    statsServicePath,
    economyServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  require.cache[rarityPath] = {
    id: rarityPath,
    filename: rarityPath,
    loaded: true,
    exports: { pickByRarity: pickByRarityImpl },
  };
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { getSupabaseClient: getSupabaseClientImpl },
  };
  require.cache[userServicePath] = {
    id: userServicePath,
    filename: userServicePath,
    loaded: true,
    exports: {
      getUser: getUserImpl,
      createUserIfMissing: createUserIfMissingImpl,
    },
  };
  require.cache[pokemonServicePath] = {
    id: pokemonServicePath,
    filename: pokemonServicePath,
    loaded: true,
    exports: {
      getAllSpecies: getAllSpeciesImpl,
      insertUserPokemon: insertUserPokemonImpl,
    },
  };
  require.cache[statsServicePath] = {
    id: statsServicePath,
    filename: statsServicePath,
    loaded: true,
    exports: { calculatePokemonStats: calculatePokemonStatsImpl, rollPokemonIvOffsets: rollPokemonIvOffsetsImpl || (() => ({ attack_iv: 0, magic_iv: 0, defense_iv: 0, hp_iv: 0, speed_iv: 0 })), SHINY_TYPE: { PRIME: 'prime', NORMAL: 'normal' } },
  };
  require.cache[economyServicePath] = {
    id: economyServicePath,
    filename: economyServicePath,
    loaded: true,
    exports: { getGoldValueByRarityAndLevel: getGoldValueByRarityAndLevelImpl },
  };

  const service = require(servicePath);

  [
    servicePath,
    rarityPath,
    dbPath,
    userServicePath,
    pokemonServicePath,
    statsServicePath,
    economyServicePath,
  ].forEach((modulePath) => delete require.cache[modulePath]);

  return service;
}

test('capturePokemon conclui captura com retorno mínimo do insertUserPokemon', async () => {
  const userUpdates = [];
  const transactions = [];
  const supabase = {
    from(table) {
      if (table === 'users') {
        return {
          update(payload) {
            return {
              eq(column, value) {
                userUpdates.push({ payload, column, value });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === 'transactions') {
        return {
          insert(payload) {
            transactions.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  const selectedSpecies = {
    id: 25,
    name: 'Pikachu',
    rarity: 'rare',
    element_types: ['electric'],
  };

  const { capturePokemon } = loadCaptureService({
    pickByRarityImpl: () => selectedSpecies,
    getSupabaseClientImpl: () => supabase,
    getUserImpl: async () => ({ slack_user_id: 'U123', gold: 100, last_capture_at: null }),
    createUserIfMissingImpl: async () => { throw new Error('should not create user'); },
    getAllSpeciesImpl: async () => [selectedSpecies],
    insertUserPokemonImpl: async (payload) => ({ id: 77, species_id: payload.speciesId, level: payload.level, shiny: payload.shiny, source: payload.source }),
    calculatePokemonStatsImpl: () => ({ attack: 15, defense: 10, hp: 20, speed: 30 }),
    rollPokemonIvOffsetsImpl: () => ({ attack_iv: 0, magic_iv: 0, defense_iv: 0, hp_iv: 0, speed_iv: 0 }),
    getGoldValueByRarityAndLevelImpl: () => 250,
  });

  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const result = await capturePokemon('U123', { channelId: 'C1', platform: 'slack', rawText: '!capture' });

    assert.equal(result.ok, true);
    assert.deepEqual(result.species, selectedSpecies);
    assert.deepEqual(result.captured, { id: 77, species_id: 25, level: 1, shiny: false, source: 'capture' });
    assert.equal(result.goldReward, "250");
    assert.equal(userUpdates.length, 1);
    assert.equal(userUpdates[0].column, 'slack_user_id');
    assert.equal(userUpdates[0].value, 'U123');
    assert.equal(userUpdates[0].payload.gold, "350");
    assert.ok(userUpdates[0].payload.last_capture_at);
    assert.deepEqual(transactions, [{ slack_user_id: 'U123', type: 'capture_reward', amount: '250' }]);
  } finally {
    Math.random = originalRandom;
  }
});
