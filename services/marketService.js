const { getSupabaseClient } = require("../database/supabase");

const DAILY_MARKET_SIZE = 3;
const BASE_PRICE = 250;
const RARITY_TIERS = ["common", "uncommon", "rare", "epic", "legendary"];

function getMarketDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getPriceByRarity(rarity) {
  const tier = RARITY_TIERS.indexOf(rarity);
  const safeTier = tier < 0 ? 0 : tier;
  return BASE_PRICE * 2 ** safeTier;
}

async function ensureDailyMarket(marketDate = getMarketDateKey()) {
  const supabase = getSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("daily_market")
    .select("slot, species_id, price, pokemon_species(id, name, rarity, sprite_url)")
    .eq("market_date", marketDate)
    .order("slot", { ascending: true });
  if (existingError) throw existingError;

  if ((existing || []).length === DAILY_MARKET_SIZE) {
    return existing;
  }

  const { data: speciesRows, error: speciesError } = await supabase
    .from("pokemon_species")
    .select("id, name, rarity, sprite_url")
    .order("id", { ascending: true });
  if (speciesError) throw speciesError;

  const allSpecies = speciesRows || [];
  if (!allSpecies.length) return [];

  const seed = Number(marketDate.split("-").join(""));
  const selected = [];
  const usedSpeciesIds = new Set();

  for (let i = 0; i < DAILY_MARKET_SIZE; i += 1) {
    let idx = (seed + i * 17) % allSpecies.length;
    let guard = 0;

    while (usedSpeciesIds.has(allSpecies[idx].id) && guard < allSpecies.length) {
      idx = (idx + 1) % allSpecies.length;
      guard += 1;
    }

    selected.push(allSpecies[idx]);
    usedSpeciesIds.add(allSpecies[idx].id);
  }

  const rowsToInsert = selected.map((species, i) => ({
    market_date: marketDate,
    slot: i + 1,
    species_id: species.id,
    price: getPriceByRarity(species.rarity),
  }));

  const { error: insertError } = await supabase
    .from("daily_market")
    .upsert(rowsToInsert, { onConflict: "market_date,slot" });
  if (insertError) throw insertError;

  const { data: marketRows, error: marketRowsError } = await supabase
    .from("daily_market")
    .select("slot, species_id, price, pokemon_species(id, name, rarity, sprite_url)")
    .eq("market_date", marketDate)
    .order("slot", { ascending: true });
  if (marketRowsError) throw marketRowsError;

  return marketRows || [];
}

async function buyMarketSlot({ slackUserId, slot, marketDate = getMarketDateKey() }) {
  const supabase = getSupabaseClient();

  // Garantimos a vitrine diária antes da compra, mantendo UX atual.
  await ensureDailyMarket(marketDate);

  const { data, error } = await supabase.rpc("market_buy_slot", {
    p_slack_user_id: slackUserId,
    p_market_date: marketDate,
    p_slot: slot,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) return { ok: false, reason: "unknown" };

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      price: result.price || 0,
      currentGold: result.remaining_gold || 0,
    };
  }

  const { data: species, error: speciesError } = await supabase
    .from("pokemon_species")
    .select("id, name, rarity, sprite_url")
    .eq("id", result.species_id)
    .single();
  if (speciesError) throw speciesError;

  return {
    ok: true,
    marketDate,
    slot,
    species,
    price: result.price,
    remainingGold: result.remaining_gold,
    captured: { id: result.user_pokemon_id },
  };
}

module.exports = {
  DAILY_MARKET_SIZE,
  getMarketDateKey,
  getPriceByRarity,
  ensureDailyMarket,
  buyMarketSlot,
};
