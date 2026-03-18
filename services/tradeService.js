const { getSupabaseClient } = require("../database/supabase");
const { getUser } = require("./userService");
const { formatGold, isGoldGte, toDatabaseGold, toGoldBigInt } = require("../utils/gold");

function isTradeParticipant(trade, slackUserId) {
  return trade.initiator_user_id === slackUserId || trade.target_user_id === slackUserId;
}

function getRoleInTrade(trade, slackUserId) {
  if (trade.initiator_user_id === slackUserId) return "initiator";
  if (trade.target_user_id === slackUserId) return "target";
  return null;
}

async function getPendingTradeForUserInChannel(channelId, slackUserId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("trades")
    .select(
      "id, channel_id, initiator_user_id, target_user_id, status, initiator_gold_offer, target_gold_offer, created_at, updated_at, accepted_at, declined_at, cancelled_at",
    )
    .eq("channel_id", channelId)
    .eq("status", "pending")
    .or(`initiator_user_id.eq.${slackUserId},target_user_id.eq.${slackUserId}`)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? { ...data, initiator_gold_offer: formatGold(data.initiator_gold_offer || 0), target_gold_offer: formatGold(data.target_gold_offer || 0) } : data;
}

async function createTrade({ channelId, initiatorUserId, targetUserId }) {
  const supabase = getSupabaseClient();

  const initiator = await getUser(initiatorUserId);
  const target = await getUser(targetUserId);

  if (!initiator) {
    return { ok: false, reason: "initiator_not_started" };
  }

  if (!target) {
    return { ok: false, reason: "target_not_started" };
  }

  const { data, error } = await supabase.rpc("create_trade", {
    p_channel_id: channelId,
    p_initiator_user_id: initiatorUserId,
    p_target_user_id: targetUserId,
  });

  if (error) {
    if ((error.message || "").includes("Já existe um trade pendente")) {
      return { ok: false, reason: "existing_pending_trade" };
    }

    if ((error.message || "").includes("consigo mesmo")) {
      return { ok: false, reason: "self_trade" };
    }

    throw error;
  }

  return { ok: true, trade: data };
}

async function getTradeDetails(tradeId) {
  const supabase = getSupabaseClient();

  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .select(
      "id, channel_id, initiator_user_id, target_user_id, status, initiator_gold_offer, target_gold_offer, created_at, updated_at, accepted_at, declined_at, cancelled_at",
    )
    .eq("id", tradeId)
    .single();

  if (tradeError) throw tradeError;

  const { data: items, error: itemsError } = await supabase
    .from("trade_items")
    .select(
      "id, owner_user_id, user_pokemon_id, user_pokemons(id, species_id, level, shiny, pokemon_species(id, name, rarity))",
    )
    .eq("trade_id", tradeId)
    .order("id", { ascending: true });

  if (itemsError) throw itemsError;

  return {
    ...trade,
    initiator_gold_offer: formatGold(trade.initiator_gold_offer || 0),
    target_gold_offer: formatGold(trade.target_gold_offer || 0),
    items: items || [],
  };
}

async function addPokemonToTrade({ trade, actorUserId, pokemonId }) {
  const supabase = getSupabaseClient();

  if (trade.status !== "pending") return { ok: false, reason: "trade_not_pending" };
  if (!isTradeParticipant(trade, actorUserId)) return { ok: false, reason: "not_trade_participant" };

  const { data: pokemon, error: pokemonError } = await supabase
    .from("user_pokemons")
    .select("id, slack_user_id")
    .eq("id", pokemonId)
    .maybeSingle();

  if (pokemonError) throw pokemonError;
  if (!pokemon || pokemon.slack_user_id !== actorUserId) {
    return { ok: false, reason: "pokemon_not_owned" };
  }

  const { data: existingInPending, error: existingError } = await supabase
    .from("trade_items")
    .select("id, trade_id, trades!inner(status)")
    .eq("user_pokemon_id", pokemonId)
    .eq("trades.status", "pending")
    .neq("trade_id", trade.id)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingInPending) {
    return { ok: false, reason: "pokemon_in_other_pending_trade" };
  }

  const { data: alreadyInTrade, error: alreadyError } = await supabase
    .from("trade_items")
    .select("id")
    .eq("trade_id", trade.id)
    .eq("user_pokemon_id", pokemonId)
    .maybeSingle();

  if (alreadyError) throw alreadyError;
  if (alreadyInTrade) return { ok: false, reason: "pokemon_already_added" };

  const { error: insertError } = await supabase.from("trade_items").insert({
    trade_id: trade.id,
    owner_user_id: actorUserId,
    user_pokemon_id: pokemonId,
  });

  if (insertError) throw insertError;
  return { ok: true };
}

async function removePokemonFromTrade({ trade, actorUserId, pokemonId }) {
  const supabase = getSupabaseClient();

  if (trade.status !== "pending") return { ok: false, reason: "trade_not_pending" };
  if (!isTradeParticipant(trade, actorUserId)) return { ok: false, reason: "not_trade_participant" };

  const { data: row, error: rowError } = await supabase
    .from("trade_items")
    .select("id")
    .eq("trade_id", trade.id)
    .eq("owner_user_id", actorUserId)
    .eq("user_pokemon_id", pokemonId)
    .maybeSingle();

  if (rowError) throw rowError;
  if (!row) return { ok: false, reason: "pokemon_not_in_offer" };

  const { error: deleteError } = await supabase.from("trade_items").delete().eq("id", row.id);
  if (deleteError) throw deleteError;

  return { ok: true };
}

async function setGoldOffer({ trade, actorUserId, amount }) {
  const supabase = getSupabaseClient();

  if (trade.status !== "pending") return { ok: false, reason: "trade_not_pending" };
  if (!isTradeParticipant(trade, actorUserId)) return { ok: false, reason: "not_trade_participant" };
  const normalizedAmount = toGoldBigInt(amount);
  if (normalizedAmount < 0n) return { ok: false, reason: "invalid_gold_amount" };

  const user = await getUser(actorUserId);
  if (!user) return { ok: false, reason: "user_not_started" };
  if (!isGoldGte(user.gold || 0, normalizedAmount)) return { ok: false, reason: "insufficient_gold" };

  const role = getRoleInTrade(trade, actorUserId);
  const field = role === "initiator" ? "initiator_gold_offer" : "target_gold_offer";

  const { error } = await supabase.from("trades").update({ [field]: toDatabaseGold(normalizedAmount) }).eq("id", trade.id);
  if (error) throw error;

  return { ok: true };
}

async function declineOrCancelTrade({ trade, actorUserId }) {
  const supabase = getSupabaseClient();

  if (trade.status !== "pending") return { ok: false, reason: "trade_not_pending" };
  if (!isTradeParticipant(trade, actorUserId)) return { ok: false, reason: "not_trade_participant" };

  const isTarget = trade.target_user_id === actorUserId;

  const updateData = isTarget
    ? { status: "declined", declined_at: new Date().toISOString() }
    : { status: "cancelled", cancelled_at: new Date().toISOString() };

  const { error } = await supabase.from("trades").update(updateData).eq("id", trade.id);
  if (error) throw error;

  return { ok: true, status: updateData.status };
}

async function acceptTrade({ trade, actorUserId }) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("accept_trade", {
    p_trade_id: trade.id,
    p_accepting_user_id: actorUserId,
  });

  if (error) {
    const message = error.message || "";
    if (message.includes("Apenas o usuário alvo")) return { ok: false, reason: "only_target_can_accept" };
    if (message.includes("não está mais pendente")) return { ok: false, reason: "trade_not_pending" };
    if (message.includes("Saldo insuficiente")) return { ok: false, reason: "insufficient_gold_on_accept" };
    if (message.includes("não pertencem mais")) return { ok: false, reason: "pokemon_ownership_changed" };
    throw error;
  }

  return { ok: true, trade: data };
}

function formatTradeStateMessage(tradeDetails) {
  const initiatorItems = tradeDetails.items.filter((item) => item.owner_user_id === tradeDetails.initiator_user_id);
  const targetItems = tradeDetails.items.filter((item) => item.owner_user_id === tradeDetails.target_user_id);

  const formatItem = (item) => {
    const species = item.user_pokemons?.pokemon_species;
    const speciesName = species?.name || "Pokémon";
    const shiny = item.user_pokemons?.shiny ? "✨ " : "";
    const level = item.user_pokemons?.level || 1;
    return `• #${item.user_pokemon_id} ${shiny}${speciesName} (Lv ${level})`;
  };

  const initiatorList = initiatorItems.length ? initiatorItems.map(formatItem).join("\n") : "• Nenhum Pokémon";
  const targetList = targetItems.length ? targetItems.map(formatItem).join("\n") : "• Nenhum Pokémon";

  return (
    `🤝 *Trade #${tradeDetails.id}* (${tradeDetails.status})\n` +
    `Canal: <#${tradeDetails.channel_id}>\n\n` +
    `*Iniciador:* <@${tradeDetails.initiator_user_id}>\n` +
    `💰 Gold oferecido: *${tradeDetails.initiator_gold_offer}*\n` +
    `${initiatorList}\n\n` +
    `*Alvo:* <@${tradeDetails.target_user_id}>\n` +
    `💰 Gold oferecido: *${tradeDetails.target_gold_offer}*\n` +
    `${targetList}`
  );
}

module.exports = {
  getPendingTradeForUserInChannel,
  createTrade,
  getTradeDetails,
  addPokemonToTrade,
  removePokemonFromTrade,
  setGoldOffer,
  declineOrCancelTrade,
  acceptTrade,
  formatTradeStateMessage,
};
