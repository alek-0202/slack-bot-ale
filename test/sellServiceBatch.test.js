const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const sellServicePath = path.join(__dirname, "..", "services", "sellService.js");
const supabasePath = path.join(__dirname, "..", "database", "supabase.js");
const pokemonServicePath = path.join(__dirname, "..", "services", "pokemonService.js");
const inventoryServicePath = path.join(__dirname, "..", "services", "inventoryService.js");

function loadSellServiceWithMocks({ rpcResult, pokemons, rpcImpl, tradeLockedIds = [] }) {
  const rpcCalls = [];
  const fromCalls = [];

  delete require.cache[sellServicePath];
  delete require.cache[supabasePath];
  delete require.cache[pokemonServicePath];
  delete require.cache[inventoryServicePath];

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      getSupabaseClient() {
        return {
          from(table) {
            fromCalls.push({ table });
            return {
              select() {
                return this;
              },
              in(column, values) {
                this._column = column;
                this._values = values;
                return this;
              },
              eq(column, value) {
                const lockedRows = (tradeLockedIds || [])
                  .filter((id) => (this._values || []).includes(id))
                  .map((id) => ({ user_pokemon_id: id, trades: { status: "pending" } }));
                return Promise.resolve({ data: column === "trades.status" && value === "pending" ? lockedRows : [], error: null });
              },
            };
          },
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
      async getUserPokemons() {
        return pokemons;
      },
    },
  };

  require.cache[inventoryServicePath] = {
    id: inventoryServicePath,
    filename: inventoryServicePath,
    loaded: true,
    exports: {
      async addItem() {
        return { ok: true };
      },
    },
  };

  const sellService = require(sellServicePath);

  return {
    sellService,
    rpcCalls,
    fromCalls,
    cleanup() {
      delete require.cache[sellServicePath];
      delete require.cache[supabasePath];
      delete require.cache[pokemonServicePath];
      delete require.cache[inventoryServicePath];
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

test("sellAllPokemonBatch processa em chunks para alto volume e retorna resumo agregado", async () => {
  const pokemons = Array.from({ length: 260 }, (_, index) => ({
    id: index + 1,
    level: 1,
    upgrade_spent_gold: 0,
    is_favorite: index < 10,
    pokemon_species: { name: `Poke${index + 1}`, rarity: "common", base_value: 300 },
  }));

  const context = loadSellServiceWithMocks({
    pokemons,
    tradeLockedIds: [11, 12, 13, 14, 15],
    rpcImpl(name, payload, rpcCalls) {
      if (name !== "sell_user_pokemons_batch") return { data: [{ ok: false, reason: "unknown" }], error: null };
      const salePrice = payload.p_pokemon_ids.length * 300;
      return {
        data: [{
          ok: true,
          reason: null,
          sale_price: salePrice,
          essence_gained: payload.p_pokemon_ids.length * 100,
          remaining_gold: 1000 + rpcCalls.filter((call) => call.name === "sell_user_pokemons_batch").length * salePrice,
          remaining_essence: payload.p_pokemon_ids.length * 100,
          deleted_trade_items: 0,
          deleted_market_purchases: 0,
        }],
        error: null,
      };
    },
  });

  try {
    const result = await context.sellService.sellAllPokemonBatch({ slackUserId: "U123" });

    assert.equal(result.ok, true);
    assert.equal(result.soldCount, 245);
    assert.equal(result.ignoredCount, 15);
    assert.equal(result.favoriteIgnoredCount, 10);
    assert.equal(result.blockedCount, 5);
    assert.equal(result.goldReceived, String(245 * 300));
    assert.equal(result.essenceReceived, String(245 * 100));

    const batchRpcCalls = context.rpcCalls.filter((call) => call.name === "sell_user_pokemons_batch");
    assert.equal(batchRpcCalls.length, 3);
    assert.deepEqual(batchRpcCalls.map((call) => call.payload.p_pokemon_ids.length), [120, 120, 5]);
  } finally {
    context.cleanup();
  }
});

test("buildSellAllPreview filtra favoritos e pokémons bloqueados em trade antes da confirmação", async () => {
  const pokemons = [
    {
      id: 10,
      level: 1,
      upgrade_spent_gold: 0,
      is_favorite: false,
      pokemon_species: { name: "Pikachu", rarity: "common", base_value: 300 },
    },
    {
      id: 11,
      level: 1,
      upgrade_spent_gold: 200,
      is_favorite: true,
      pokemon_species: { name: "Bulbasaur", rarity: "rare", base_value: 500 },
    },
    {
      id: 12,
      level: 2,
      upgrade_spent_gold: 100,
      is_favorite: false,
      pokemon_species: { name: "Squirtle", rarity: "uncommon", base_value: 400 },
    },
  ];

  const context = loadSellServiceWithMocks({
    pokemons,
    tradeLockedIds: [12],
    rpcResult: { ok: true },
  });

  try {
    const preview = await context.sellService.buildSellAllPreview({ slackUserId: "U123" });

    assert.equal(preview.ok, true);
    assert.deepEqual(preview.pokemonIds, [10]);
    assert.equal(preview.totalCount, 1);
    assert.equal(preview.favoriteIgnoredCount, 1);
    assert.equal(preview.blockedCount, 1);
    assert.equal(preview.ignoredCount, 2);
    assert.equal(preview.totalSellPrice, "300");
    assert.equal(preview.totalEssenceReceived, "100");
    assert.equal(context.rpcCalls.length, 0);
  } finally {
    context.cleanup();
  }
});

test("buildSellAllPreview retorna no_sellable_pokemon quando todos são ignorados ou bloqueados", async () => {
  const pokemons = [
    {
      id: 20,
      level: 1,
      upgrade_spent_gold: 0,
      is_favorite: true,
      pokemon_species: { name: "Pikachu", rarity: "common", base_value: 300 },
    },
    {
      id: 21,
      level: 1,
      upgrade_spent_gold: 0,
      is_favorite: false,
      pokemon_species: { name: "Charmander", rarity: "common", base_value: 300 },
    },
  ];

  const context = loadSellServiceWithMocks({
    pokemons,
    tradeLockedIds: [21],
    rpcResult: { ok: true },
  });

  try {
    const preview = await context.sellService.buildSellAllPreview({ slackUserId: "U123" });

    assert.equal(preview.ok, false);
    assert.equal(preview.reason, "no_sellable_pokemon");
    assert.equal(preview.favoriteIgnoredCount, 1);
    assert.equal(preview.blockedCount, 1);
    assert.equal(preview.ignoredCount, 2);
    assert.equal(context.rpcCalls.length, 0);
  } finally {
    context.cleanup();
  }
});
