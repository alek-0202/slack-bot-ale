const { getSupabaseClient } = require('../database/supabase');
const { addToCart, clearCart, getCart } = require('./cartService');
const { getUserItems, removeItem, addItem } = require('./inventoryService');
const { getOwnedPokemonById } = require('./pokemonLookupService');

const GLOBAL_MARKET_SCOPE = 'global_market';
const GLOBAL_MARKET_ACTION_ADD_PREFIX = 'mg_add';
const GLOBAL_MARKET_ACTION_BUY = 'mg_cart_buy';
const GLOBAL_MARKET_ACTION_CANCEL = 'mg_cart_cancel';

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

function buildGlobalMarketHud({ listings = [], ownerFilter = null, cart = null }) {
  const rows = listings.length
    ? listings.map((entry) => `#${entry.id} • *${entry.title}* • x${entry.quantity} • 💰 ${Number(entry.price).toLocaleString('pt-BR')} • vendedor <@${entry.seller_slack_user_id}>`).join('\n')
    : 'Sem anúncios ativos.';
  const cartRows = cart?.items?.length
    ? cart.items.map((entry) => `• anúncio #${entry.itemKey} x${entry.quantity}`).join('\n')
    : '• Carrinho vazio';

  return {
    text: 'Market global',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🌐 Market Global (!mg)', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: ownerFilter ? `Filtro vendedor: <@${ownerFilter}>` : 'Lista global de anúncios de itens e pokémons.' } },
      { type: 'section', text: { type: 'mrkdwn', text: rows } },
      ...listings.slice(0, 20).map((entry) => ({
        type: 'actions',
        elements: [1, 10, 50, 100, 1000].map((qty) => ({
          type: 'button',
          action_id: `${GLOBAL_MARKET_ACTION_ADD_PREFIX}_${entry.id}_${qty}`,
          text: { type: 'plain_text', text: `x${qty}` },
          value: JSON.stringify({ listingId: entry.id, quantity: qty }),
        })),
      })),
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `🛒 *Carrinho do global*\n${cartRows}` } },
      {
        type: 'actions',
        elements: [
          { type: 'button', action_id: GLOBAL_MARKET_ACTION_BUY, style: 'primary', text: { type: 'plain_text', text: 'Comprar' } },
          { type: 'button', action_id: GLOBAL_MARKET_ACTION_CANCEL, style: 'danger', text: { type: 'plain_text', text: 'Cancelar' } },
        ],
      },
    ],
  };
}

async function listGlobalMarket({ sellerUserId = null, filters = {} } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('global_market_listings')
    .select('*')
    .eq('status', 'active')
    .gt('quantity', 0)
    .order('id', { ascending: false })
    .limit(20);

  if (sellerUserId) query = query.eq('seller_slack_user_id', sellerUserId);
  if (filters.category) query = query.eq('listing_type', filters.category);
  if (filters.minPrice) query = query.gte('price', Number(filters.minPrice) || 0);
  if (filters.maxPrice) query = query.lte('price', Number(filters.maxPrice) || 0);
  if (filters.pokemonRarity) query = query.ilike('metadata->>rarity', String(filters.pokemonRarity));
  if (filters.pokemonName) query = query.ilike('title', `%${filters.pokemonName}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function addItemListing({ slackUserId, itemKey, quantity, price }) {
  const safeQty = Math.max(1, Number(quantity) || 1);
  const safePrice = Math.max(1, Number(price) || 0);
  const inventory = await getUserItems(slackUserId);
  const owned = inventory.find((entry) => entry.item_key === String(itemKey || '').trim().toLowerCase());
  if (!owned || Number(owned.quantity || 0) < safeQty) return { ok: false, reason: 'insufficient_item' };

  const locked = await removeItem(slackUserId, owned.item_key, safeQty);
  if (!locked.ok) return { ok: false, reason: locked.reason || 'lock_failed' };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('global_market_listings')
    .insert({
      seller_slack_user_id: slackUserId,
      listing_type: 'item',
      item_key: owned.item_key,
      title: owned.item_name,
      quantity: safeQty,
      price: safePrice,
      metadata: parseJson(JSON.stringify(owned.extra_data || {})),
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw error;
  return { ok: true, listing: data };
}

async function addPokemonListing({ slackUserId, pokemonId, price }) {
  const safePrice = Math.max(1, Number(price) || 0);
  const pokemon = await getOwnedPokemonById(pokemonId);
  if (!pokemon || pokemon.slack_user_id !== slackUserId) return { ok: false, reason: 'pokemon_not_owned' };

  const supabase = getSupabaseClient();
  const { error: lockError } = await supabase
    .from('user_pokemons')
    .update({ is_battle_available: false })
    .eq('id', pokemonId)
    .eq('slack_user_id', slackUserId);
  if (lockError) throw lockError;

  const { data, error } = await supabase
    .from('global_market_listings')
    .insert({
      seller_slack_user_id: slackUserId,
      listing_type: 'pokemon',
      pokemon_id: pokemonId,
      item_key: null,
      title: pokemon.pokemon_species?.name || `Pokémon #${pokemonId}`,
      quantity: 1,
      price: safePrice,
      metadata: { rarity: pokemon.pokemon_species?.rarity || null },
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw error;
  return { ok: true, listing: data };
}

async function removeListing({ slackUserId, listingId }) {
  const supabase = getSupabaseClient();
  const { data: listing, error } = await supabase
    .from('global_market_listings')
    .select('*')
    .eq('id', listingId)
    .eq('seller_slack_user_id', slackUserId)
    .maybeSingle();
  if (error) throw error;
  if (!listing) return { ok: false, reason: 'not_found' };

  if (listing.listing_type === 'item' && listing.item_key) await addItem(slackUserId, listing.item_key, Number(listing.quantity || 0));
  if (listing.listing_type === 'pokemon' && listing.pokemon_id) {
    await supabase.from('user_pokemons').update({ is_battle_available: true }).eq('id', listing.pokemon_id).eq('slack_user_id', slackUserId);
  }

  await supabase.from('global_market_listings').update({ status: 'cancelled', quantity: 0 }).eq('id', listingId);
  return { ok: true, listing };
}

function addToGlobalCart({ slackUserId, channelId, listingId, quantity }) {
  const cart = addToCart({ scope: GLOBAL_MARKET_SCOPE, userId: slackUserId, channelId, itemKey: String(listingId), quantity });
  return { ok: true, cart };
}

async function checkoutGlobalCart({ slackUserId, channelId }) {
  const supabase = getSupabaseClient();
  const cart = getCart({ scope: GLOBAL_MARKET_SCOPE, userId: slackUserId, channelId });
  if (!cart.items.length) return { ok: false, reason: 'empty_cart' };

  for (const entry of cart.items) {
    const listingId = Number(entry.itemKey);
    const requested = Math.max(1, Number(entry.quantity || 0));
    const { data: listing, error } = await supabase.from('global_market_listings').select('*').eq('id', listingId).maybeSingle();
    if (error) throw error;
    if (!listing || listing.status !== 'active' || Number(listing.quantity || 0) <= 0) return { ok: false, reason: 'listing_unavailable', listingId };
    const purchasedQty = Math.min(requested, Number(listing.quantity || 0));
    const total = purchasedQty * Number(listing.price || 0);

    const { data: buyer, error: buyerError } = await supabase.from('users').select('gold').eq('slack_user_id', slackUserId).single();
    if (buyerError) throw buyerError;
    if (Number(buyer.gold || 0) < total) return { ok: false, reason: 'insufficient_gold', listingId };

    await supabase.rpc('apply_gold_transaction', { p_slack_user_id: slackUserId, p_amount: -total, p_transaction_type: 'global_market_buy' });
    await supabase.rpc('apply_gold_transaction', { p_slack_user_id: listing.seller_slack_user_id, p_amount: total, p_transaction_type: 'global_market_sell' });

    if (listing.listing_type === 'item') {
      await addItem(slackUserId, listing.item_key, purchasedQty);
    } else if (listing.listing_type === 'pokemon' && listing.pokemon_id) {
      await supabase.from('user_pokemons').update({ slack_user_id: slackUserId, is_battle_available: true }).eq('id', listing.pokemon_id);
    }

    const nextQty = Number(listing.quantity || 0) - purchasedQty;
    await supabase.from('global_market_listings').update({ quantity: nextQty, status: nextQty > 0 ? 'active' : 'sold' }).eq('id', listing.id);
  }

  clearCart({ scope: GLOBAL_MARKET_SCOPE, userId: slackUserId, channelId });
  return { ok: true };
}

function cancelGlobalCart({ slackUserId, channelId }) {
  clearCart({ scope: GLOBAL_MARKET_SCOPE, userId: slackUserId, channelId });
  return { ok: true };
}

module.exports = {
  GLOBAL_MARKET_SCOPE,
  GLOBAL_MARKET_ACTION_ADD_PREFIX,
  GLOBAL_MARKET_ACTION_BUY,
  GLOBAL_MARKET_ACTION_CANCEL,
  buildGlobalMarketHud,
  listGlobalMarket,
  addItemListing,
  addPokemonListing,
  removeListing,
  addToGlobalCart,
  checkoutGlobalCart,
  cancelGlobalCart,
};
