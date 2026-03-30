const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const sellServicePath = path.join(__dirname, "..", "services", "sellService.js");
const supabasePath = path.join(__dirname, "..", "database", "supabase.js");
const pokemonServicePath = path.join(__dirname, "..", "services", "pokemonService.js");

function loadSellServiceWithMocks({ rpcResult, pokemons, rpcImpl }) {
  const rpcCalls = [];

  delete require.cache[sellServicePath];
  delete require.cache[supabasePath];
  delete require.cache[pokemonServicePath];

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      getSupabaseClient() {
        return {
          rpc(name, payload) {
            rpcCalls.push({ name, payload });
            if (rpcImpl) {
              return Promise.resolve(rpcImpl(name, payload, rpcCalls));
            }
            return Promise.resolve({ data: [rpcResult], error: null });
          },
        };
      },
    },
  };

  require.cache[pokemonServicePath] = {
    id: pokemonServicePath,
    filename: pokemonServicePath,
    loaded: true,
    exports: {
      async getUserPokemonById() {
        return pokemons[0] || null;
      },
      async getUserPokemonsByIds() {
        return pokemons;
      },
    },
  };

  const sellService = require(sellServicePath);

  return {
    sellService,
    rpcCalls,
    cleanup() {
      delete require.cache[sellServicePath];
      delete require.cache[supabasePath];
      delete require.cache[pokemonServicePath];
    },
  };
}

test("sellPokemonBatch envia o total esperado para a RPC e mantém o valor recebido consistente", async () => {
  const pokemons = [
    {
      id: 23,
      level: 1,
      upgrade_spent_gold: 0,
      pokemon_species: { name: "Pikachu", rarity: "common", base_value: 300 },
    },
    {
      id: 45,
      level: 4,
      upgrade_spent_gold: 1050,
      pokemon_species: { name: "Charmander", rarity: "common", base_value: 300 },
    },
  ];

  const context = loadSellServiceWithMocks({
    pokemons,
    rpcResult: {
      ok: true,
      reason: null,
      sale_price: 1650,
      remaining_gold: 1840,
      deleted_trade_items: 0,
      deleted_market_purchases: 0,
    },
  });

  try {
    const result = await context.sellService.sellPokemonBatch({
      slackUserId: "U123",
      pokemonIds: [23, 45],
    });

    assert.equal(result.ok, true);
    assert.equal(result.totalSellPrice, "1650");
    assert.equal(result.goldReceived, "1650");
    assert.deepEqual(context.rpcCalls, [
      {
        name: "sell_user_pokemons_batch",
        payload: {
          p_slack_user_id: "U123",
          p_pokemon_ids: [23, 45],
          p_expected_sale_price: 1650,
        },
      },
    ]);
  } finally {
    context.cleanup();
  }
});



test("sellPokemonBatch faz fallback para a RPC legada quando a RPC em lote não existe no schema cache", async () => {
  const pokemons = [
    {
      id: 23,
      level: 1,
      upgrade_spent_gold: 0,
      pokemon_species: { name: "Pikachu", rarity: "common", base_value: 300 },
    },
    {
      id: 45,
      level: 4,
      upgrade_spent_gold: 1050,
      pokemon_species: { name: "Charmander", rarity: "common", base_value: 300 },
    },
  ];

  const legacyResults = {
    23: {
      ok: true,
      reason: null,
      sale_price: 300,
      remaining_gold: 1210,
      deleted_trade_items: 0,
      deleted_market_purchases: 0,
    },
    45: {
      ok: true,
      reason: null,
      sale_price: 1350,
      remaining_gold: 1840,
      deleted_trade_items: 0,
      deleted_market_purchases: 0,
    },
  };

  const context = loadSellServiceWithMocks({
    pokemons,
    rpcImpl(name, payload) {
      if (name === "sell_user_pokemons_batch") {
        return {
          data: null,
          error: {
            message: "Could not find the function public.sell_user_pokemons_batch(p_expected_sale_price, p_pokemon_ids, p_slack_user_id) in the schema cache",
          },
        };
      }

      return { data: [legacyResults[payload.p_pokemon_id]], error: null };
    },
  });

  try {
    const result = await context.sellService.sellPokemonBatch({
      slackUserId: "U123",
      pokemonIds: [23, 45],
    });

    assert.equal(result.ok, true);
    assert.equal(result.totalSellPrice, "1650");
    assert.equal(result.goldReceived, "1650");
    assert.equal(result.currentGold, "1840");
    assert.equal(result.usedLegacyFallback, true);
    assert.deepEqual(context.rpcCalls, [
      {
        name: "sell_user_pokemons_batch",
        payload: {
          p_slack_user_id: "U123",
          p_pokemon_ids: [23, 45],
          p_expected_sale_price: 1650,
        },
      },
      {
        name: "sell_user_pokemon",
        payload: {
          p_slack_user_id: "U123",
          p_pokemon_id: 23,
        },
      },
      {
        name: "sell_user_pokemon",
        payload: {
          p_slack_user_id: "U123",
          p_pokemon_id: 45,
        },
      },
    ]);
  } finally {
    context.cleanup();
  }
});

test("sellPokemonBatch bloqueia venda de favorito antes da RPC", async () => {
  const pokemons = [
    {
      id: 23,
      level: 1,
      upgrade_spent_gold: 0,
      is_favorite: true,
      pokemon_species: { name: "Pikachu", rarity: "common", base_value: 300 },
    },
  ];

  const context = loadSellServiceWithMocks({
    pokemons,
    rpcResult: { ok: true },
  });

  try {
    const result = await context.sellService.sellPokemonBatch({
      slackUserId: "U123",
      pokemonIds: [23],
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "favorite_pokemon_blocked");
    assert.deepEqual(result.favoriteIds, [23]);
    assert.equal(context.rpcCalls.length, 0);
  } finally {
    context.cleanup();
  }
});
