const { extractMentionedUser } = require('../../utils/helpers');
const {
  buildGlobalMarketHud,
  listGlobalMarket,
  addItemListing,
  addPokemonListing,
  removeListing,
} = require('../../services/globalMarketService');
const { getCart } = require('../../services/cartService');

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
    const listings = await listGlobalMarket({ sellerUserId: sellerFilter || null });
    const cart = getCart({ scope: 'global_market', userId: event.user, channelId: event.channel });
    await say(buildGlobalMarketHud({ listings, ownerFilter: sellerFilter, cart }));
  },
};
