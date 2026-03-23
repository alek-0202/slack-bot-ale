const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const sellServicePath = path.join(__dirname, "..", "services", "sellService.js");
const supabasePath = path.join(__dirname, "..", "database", "supabase.js");
const pokemonServicePath = path.join(__dirname, "..", "services", "pokemonService.js");

function loadSellServiceWithMocks({ rpcResult, pokemons }) {
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
      pokemon_species: { name: "Pikachu", rarity: "common" },
    },
    {
      id: 45,
      level: 4,
      upgrade_spent_gold: 1050,
      pokemon_species: { name: "Charmander", rarity: "common" },
    },
  ];

  const context = loadSellServiceWithMocks({
    pokemons,
    rpcResult: {
      ok: true,
      reason: null,
      sale_price: 840,
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
    assert.equal(result.totalSellPrice, "840");
    assert.equal(result.goldReceived, "840");
    assert.deepEqual(context.rpcCalls, [
      {
        name: "sell_user_pokemons_batch",
        payload: {
          p_slack_user_id: "U123",
          p_pokemon_ids: [23, 45],
          p_expected_sale_price: 840,
        },
      },
    ]);
  } finally {
    context.cleanup();
  }
});

