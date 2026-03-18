const { getSupabaseClient } = require("../database/supabase");
const { getBaseGoldByRarity } = require("./economyService");
const { createLogger } = require("../utils/logger");

const DAILY_MARKET_SIZE = 3;
const MANUAL_MARKET_CHANGE_REQUIRED_CONFIRMATIONS = 3;
const logger = createLogger("market-service");

function getMarketDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getPriceByRarity(rarity) {
  const price = getBaseGoldByRarity(rarity);
  logger.info("Preço base do market calculado", { rarity, price });
  return price;
}

async function fetchDailyMarket(supabase, marketDate) {
  const { data, error } = await supabase
    .from("daily_market")
    .select("slot, species_id, price, pokemon_species(id, name, rarity, sprite_url, element_types)")
    .eq("market_date", marketDate)
    .order("slot", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function buildDailyMarketRows({ supabase, marketDate }) {
  const { data: speciesRows, error: speciesError } = await supabase
    .from("pokemon_species")
    .select("id, name, rarity, sprite_url, element_types")
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

  return selected.map((species, i) => ({
    market_date: marketDate,
    slot: i + 1,
    species_id: species.id,
    price: getPriceByRarity(species.rarity),
  }));
}

async function replaceDailyMarket({ supabase, marketDate }) {
  const rowsToInsert = await buildDailyMarketRows({ supabase, marketDate });
  if (!rowsToInsert.length) return [];

  const { error: deleteError } = await supabase.from("daily_market").delete().eq("market_date", marketDate);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("daily_market").insert(rowsToInsert);
  if (insertError) throw insertError;

  logger.info("Loja diária do market atualizada", { marketDate, slots: rowsToInsert.length });
  return fetchDailyMarket(supabase, marketDate);
}

async function ensureDailyMarket(marketDate = getMarketDateKey()) {
  const supabase = getSupabaseClient();
  const existing = await fetchDailyMarket(supabase, marketDate);

  if (existing.length === DAILY_MARKET_SIZE) {
    return existing;
  }

  return replaceDailyMarket({ supabase, marketDate });
}

async function getManualMarketChangeStatus({ channelId, marketDate = getMarketDateKey() }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("market_change_requests")
    .select("*")
    .eq("market_date", marketDate)
    .eq("channel_id", channelId)
    .in("status", ["pending", "completed"])
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function ensureManualMarketChangeRequest({ initiatedBy, channelId, platform, marketDate = getMarketDateKey() }) {
  const supabase = getSupabaseClient();
  const existing = await getManualMarketChangeStatus({ channelId, marketDate });

  if (existing?.status === "completed") {
    logger.warn("Tentativa de criar market change após uso diário", { channelId, initiatedBy, marketDate });
    return { status: "already_used_today", request: existing };
  }

  if (existing?.status === "pending") {
    logger.info("Pedido de market change reutilizado", { channelId, initiatedBy, marketDate, requestId: existing.id });
    return { status: "existing_request", request: existing };
  }

  const { data, error } = await supabase
    .from("market_change_requests")
    .insert({
      market_date: marketDate,
      channel_id: channelId,
      platform,
      initiated_by: initiatedBy,
      required_confirmations: MANUAL_MARKET_CHANGE_REQUIRED_CONFIRMATIONS,
      confirmation_count: 0,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;

  logger.info("Pedido de market change criado", { requestId: data.id, channelId, initiatedBy, platform, marketDate });
  return { status: "created", request: data };
}

async function confirmManualMarketChange({ userId, channelId, marketDate = getMarketDateKey() }) {
  const supabase = getSupabaseClient();
  const request = await getManualMarketChangeStatus({ channelId, marketDate });

  if (!request) {
    logger.warn("Confirmação sem pedido ativo de market change", { channelId, userId, marketDate });
    return { status: "no_active_request" };
  }

  if (request.status === "completed") {
    return { status: "already_used_today", request };
  }

  const { data: existingConfirmation, error: existingError } = await supabase
    .from("market_change_confirmations")
    .select("id")
    .eq("request_id", request.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existingConfirmation) {
    logger.warn("Confirmação duplicada de market change", { requestId: request.id, userId });
    return { status: "already_confirmed", request };
  }

  const { error: insertError } = await supabase.from("market_change_confirmations").insert({
    request_id: request.id,
    user_id: userId,
  });
  if (insertError) throw insertError;

  const { count: actualCount, error: countError } = await supabase
    .from("market_change_confirmations")
    .select("id", { count: "exact", head: true })
    .eq("request_id", request.id);
  if (countError) throw countError;

  const nextCount = actualCount || 0;
  const { data: updatedRequest, error: updateError } = await supabase
    .from("market_change_requests")
    .update({ confirmation_count: nextCount })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (updateError) throw updateError;

  logger.info("Confirmação de market change registrada", { requestId: request.id, userId, confirmationCount: nextCount });

  if (nextCount < updatedRequest.required_confirmations) {
    return { status: "confirmed", request: updatedRequest };
  }

  const market = await replaceDailyMarket({ supabase, marketDate });
  const { data: completedRequest, error: completeError } = await supabase
    .from("market_change_requests")
    .update({ status: "completed", completed_at: new Date().toISOString(), confirmation_count: nextCount })
    .eq("id", request.id)
    .select("*")
    .single();
  if (completeError) throw completeError;

  logger.info("Market change concluído", { requestId: request.id, channelId, marketDate, confirmationCount: nextCount });
  return { status: "completed", request: completedRequest, market };
}

async function buyMarketSlot({ slackUserId, slot, marketDate = getMarketDateKey() }) {
  const supabase = getSupabaseClient();
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
    .select("id, name, rarity, sprite_url, element_types")
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
  MANUAL_MARKET_CHANGE_REQUIRED_CONFIRMATIONS,
  getMarketDateKey,
  getPriceByRarity,
  ensureDailyMarket,
  replaceDailyMarket,
  getManualMarketChangeStatus,
  ensureManualMarketChangeRequest,
  confirmManualMarketChange,
  buyMarketSlot,
};
