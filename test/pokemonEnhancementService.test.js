const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/pokemonEnhancementService.js');
const dbPath = path.resolve(__dirname, '../database/supabase.js');
const economyPath = path.resolve(__dirname, '../services/economyService.js');
const loggerPath = path.resolve(__dirname, '../utils/logger.js');

function loadService({ supabaseClient, getRarityTierImpl }) {
  [servicePath, dbPath, economyPath, loggerPath].forEach((modulePath) => delete require.cache[modulePath]);

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { getSupabaseClient: () => supabaseClient },
  };
  require.cache[economyPath] = {
    id: economyPath,
    filename: economyPath,
    loaded: true,
    exports: { getRarityTier: getRarityTierImpl },
  };
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { createLogger: () => ({ info: () => {} }) },
  };

  const service = require(servicePath);
  [servicePath, dbPath, economyPath, loggerPath].forEach((modulePath) => delete require.cache[modulePath]);
  return service;
}

const rarityTier = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythical: 5,
};

function getRarityTierImpl(rarity) {
  return rarityTier[String(rarity || '').toLowerCase()] ?? 0;
}

test('calculateShinyTransferGoldCost escala por diferença positiva de raridade', () => {
  const service = loadService({ supabaseClient: {}, getRarityTierImpl });

  assert.equal(service.calculateShinyTransferGoldCost({ sourceRarity: 'common', targetRarity: 'uncommon' }), 5000000);
  assert.equal(service.calculateShinyTransferGoldCost({ sourceRarity: 'common', targetRarity: 'rare' }), 10000000);
  assert.equal(service.calculateShinyTransferGoldCost({ sourceRarity: 'common', targetRarity: 'epic' }), 15000000);
  assert.equal(service.calculateShinyTransferGoldCost({ sourceRarity: 'uncommon', targetRarity: 'rare' }), 5000000);
  assert.equal(service.calculateShinyTransferGoldCost({ sourceRarity: 'uncommon', targetRarity: 'epic' }), 10000000);
  assert.equal(service.calculateShinyTransferGoldCost({ sourceRarity: 'rare', targetRarity: 'epic' }), 5000000);
});

test('isShinyTransferTargetRarityAllowed bloqueia lendário/mítico e permite épico para baixo', () => {
  const service = loadService({ supabaseClient: {}, getRarityTierImpl });

  assert.equal(service.isShinyTransferTargetRarityAllowed('epic'), true);
  assert.equal(service.isShinyTransferTargetRarityAllowed('rare'), true);
  assert.equal(service.isShinyTransferTargetRarityAllowed('legendary'), false);
  assert.equal(service.isShinyTransferTargetRarityAllowed('mythical'), false);
});

test('getShinyTransferPreview retorna target_invalid_rarity para lendário/mítico', async () => {
  const supabaseClient = {
    from(table) {
      if (table === 'users') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { gold: 999999999 }, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === 'user_pokemons') {
        return {
          select() {
            return {
              in: async () => ({
                data: [
                  { id: 1, slack_user_id: 'U1', shiny: true, pokemon_species: { name: 'A', rarity: 'rare' } },
                  { id: 2, slack_user_id: 'U1', shiny: false, pokemon_species: { name: 'B', rarity: 'legendary' } },
                ],
                error: null,
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const service = loadService({ supabaseClient, getRarityTierImpl });
  const result = await service.getShinyTransferPreview({ slackUserId: 'U1', sourcePokemonId: 1, targetPokemonId: 2 });
  assert.deepEqual(result, { ok: false, reason: 'target_invalid_rarity' });
});

test('getShinyTransferPreview calcula custo e valida saldo insuficiente com custo correto', async () => {
  const supabaseClient = {
    from(table) {
      if (table === 'users') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { gold: 9000000 }, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === 'user_pokemons') {
        return {
          select() {
            return {
              in: async () => ({
                data: [
                  { id: 10, slack_user_id: 'U1', shiny: true, pokemon_species: { name: 'A', rarity: 'common' } },
                  { id: 20, slack_user_id: 'U1', shiny: false, pokemon_species: { name: 'B', rarity: 'rare' } },
                ],
                error: null,
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const service = loadService({ supabaseClient, getRarityTierImpl });
  const result = await service.getShinyTransferPreview({ slackUserId: 'U1', sourcePokemonId: 10, targetPokemonId: 20 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_gold');
  assert.equal(result.costGold, 10000000);
});

test('getShinyTransferPreview sucesso para target raro/épico com custo esperado', async () => {
  const supabaseClient = {
    from(table) {
      if (table === 'users') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { gold: 50000000 }, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === 'user_pokemons') {
        return {
          select() {
            return {
              in: async () => ({
                data: [
                  { id: 11, slack_user_id: 'U1', shiny: true, pokemon_species: { name: 'A', rarity: 'rare' } },
                  { id: 22, slack_user_id: 'U1', shiny: false, pokemon_species: { name: 'B', rarity: 'epic' } },
                ],
                error: null,
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const service = loadService({ supabaseClient, getRarityTierImpl });
  const result = await service.getShinyTransferPreview({ slackUserId: 'U1', sourcePokemonId: 11, targetPokemonId: 22 });

  assert.equal(result.ok, true);
  assert.equal(result.costGold, 5000000);
  assert.equal(result.targetRarity, 'epic');
});

test('getShinyTransferPreview bloqueia transferência para raridade inferior', async () => {
  const supabaseClient = {
    from(table) {
      if (table === 'users') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: { gold: 50000000 }, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === 'user_pokemons') {
        return {
          select() {
            return {
              in: async () => ({
                data: [
                  { id: 11, slack_user_id: 'U1', shiny: true, pokemon_species: { name: 'A', rarity: 'epic' } },
                  { id: 22, slack_user_id: 'U1', shiny: false, pokemon_species: { name: 'B', rarity: 'rare' } },
                ],
                error: null,
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const service = loadService({ supabaseClient, getRarityTierImpl });
  const result = await service.getShinyTransferPreview({ slackUserId: 'U1', sourcePokemonId: 11, targetPokemonId: 22 });
  assert.deepEqual(result, { ok: false, reason: 'target_lower_rarity' });
});
