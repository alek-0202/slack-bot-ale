const { extractMentionedUser } = require('../../utils/helpers');
const {
  openGlobalMarketWithCart,
  addItemListing,
  addPokemonListing,
  removeListing,
  GLOBAL_MARKET_SCOPE,
} = require('../../services/globalMarketService');
const { upsertMarketSession } = require('../../services/marketSessionService');

function parseAddArgs(rawArgs = '') {
  const normalized = String(rawArgs || '').trim();
  const itemMatch = normalized.match(/^add\s+item\s+(.+)$/i);
  if (itemMatch) {
    const [itemKey, qty, price] = itemMatch[1].split(',').map((entry) => String(entry || '').trim());
    return { mode: 'add_item', itemKey, quantity: Number(qty), price: Number(price) };
  }
  const pokemonMatch = normalized.match(/^add\s+pokemon\s+(.+)$/i);
  if (pokemonMatch) {
    const [pokemonId, price] = pokemonMatch[1].split(',').map((entry) => String(entry || '').trim());
    return { mode: 'add_pokemon', pokemonId: Number(pokemonId), price: Number(price) };
  }
  const removeMatch = normalized.match(/^remove\s+(\d+)$/i);
  if (removeMatch) return { mode: 'remove', listingId: Number(removeMatch[1]) };
  return { mode: 'list' };
}

module.exports = {
  name: 'mg',
  async execute({ event, args, say }) {
    const parsed = parseAddArgs(args);

    if (parsed.mode === 'add_item') {
      const result = await addItemListing({ slackUserId: event.user, itemKey: parsed.itemKey, quantity: parsed.quantity, price: parsed.price });
      await say(result.ok ? `✅ Anúncio criado no !mg (#${result.listing.id}).` : '❌ Não foi possível criar anúncio de item. Verifique posse/quantidade.');
      return;
    }

    if (parsed.mode === 'add_pokemon') {
      const result = await addPokemonListing({ slackUserId: event.user, pokemonId: parsed.pokemonId, price: parsed.price });
      await say(result.ok ? `✅ Pokémon anunciado no !mg (#${result.listing.id}).` : '❌ Não foi possível anunciar esse Pokémon.');
      return;
    }

    if (parsed.mode === 'remove') {
      const result = await removeListing({ slackUserId: event.user, listingId: parsed.listingId });
      await say(result.ok ? `🗑️ Anúncio #${parsed.listingId} removido.` : '❌ Não encontrei esse anúncio na sua lista.');
      return;
    }

    const sellerFilter = extractMentionedUser(args || '');
    const payload = await openGlobalMarketWithCart({
      slackUserId: event.user,
      channelId: event.channel,
      ownerFilter: sellerFilter || null,
    });
    const marketMessage = await say(payload.marketMessage);
    const cartMessage = await say(payload.cartMessage);

    upsertMarketSession({
      scope: GLOBAL_MARKET_SCOPE,
      context: 'mg',
      userId: event.user,
      channelId: event.channel,
      marketMessageTs: marketMessage?.ts,
      cartMessageTs: cartMessage?.ts,
      cart: payload.cart,
    });
  },
};
