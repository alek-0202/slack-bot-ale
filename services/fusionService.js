const { getSupabaseClient } = require('../database/supabase');
const { getOwnedPokemonById } = require('./pokemonLookupService');
const { getUserItemQuantity, removeItem, addItem } = require('./inventoryService');
const { getFusionItem, listFusionItems } = require('./fusionCatalogService');
const { assertPokemonAvailableForAction } = require('./healingStationService');
const { rollPokemonIvOffsets, calculatePokemonStats } = require('./pokemonStatsService');
const { getUser } = require('./userService');

const FUSION_BUY_ACTION_ID = 'fusion_buy_item';
const FUSION_QUANTITIES = [1, 10, 50, 100];

function calculateScaledCost(costs = [], quantity = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  return costs.map((cost) => ({ ...cost, quantity: Number(cost.quantity || 0) * qty }));
}

async function craftFusionItem({ slackUserId, itemKey, quantity }) {
  const item = getFusionItem(itemKey);
  if (!item) return { ok: false, reason: 'item_not_found' };

  const safeQuantity = Math.max(1, Number(quantity) || 1);
  const scaledCosts = calculateScaledCost(item.costs, safeQuantity);

  for (const cost of scaledCosts) {
    const currentQty = await getUserItemQuantity(slackUserId, cost.itemKey);
    if (currentQty < cost.quantity) {
      return { ok: false, reason: 'insufficient_materials', item, missingItemKey: cost.itemKey, required: cost.quantity, current: currentQty };
    }
  }

  for (const cost of scaledCosts) {
    const consume = await removeItem(slackUserId, cost.itemKey, cost.quantity);
    if (!consume.ok) return { ok: false, reason: consume.reason || 'consume_failed', item };
  }

  await addItem(slackUserId, item.itemKey, safeQuantity);
  return { ok: true, item, quantity: safeQuantity, costs: scaledCosts };
}

async function updatePokemonAfterMutation({ pokemon, nextIvOffsets, shiny, shinyType }) {
  const stats = calculatePokemonStats({
    species: pokemon.pokemon_species || {},
    level: pokemon.level,
    fallbackStats: {
      attack: pokemon.attack,
      magic: pokemon.magic,
      defense: pokemon.defense,
      hp: pokemon.hp,
      speed: pokemon.speed,
    },
    ivOffsets: nextIvOffsets,
    shiny,
    shinyType,
  });

  const currentHp = Number(pokemon.current_hp ?? pokemon.hp ?? stats.hp);
  const oldHp = Math.max(1, Number(pokemon.hp || stats.hp));
  const ratio = Math.max(0, Math.min(1, currentHp / oldHp));
  const nextCurrentHp = Math.max(1, Math.min(Number(stats.hp || 1), Math.round(Number(stats.hp || 1) * ratio)));

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_pokemons')
    .update({
      attack_iv: nextIvOffsets.attack_iv,
      magic_iv: nextIvOffsets.magic_iv,
      defense_iv: nextIvOffsets.defense_iv,
      hp_iv: nextIvOffsets.hp_iv,
      speed_iv: nextIvOffsets.speed_iv,
      shiny,
      shiny_type: shiny ? shinyType : null,
      attack: stats.attack,
      magic: stats.magic,
      defense: stats.defense,
      hp: stats.hp,
      current_hp: nextCurrentHp,
    })
    .eq('id', pokemon.id)
    .eq('slack_user_id', pokemon.slack_user_id)
    .select('id, attack_iv, magic_iv, defense_iv, hp_iv, speed_iv, shiny, shiny_type')
    .single();
  if (error) throw error;
  return data;
}

async function useReroll({ slackUserId, pokemonId }) {
  const availability = await assertPokemonAvailableForAction({ slackUserId, pokemonId, action: 'reroll' });
  if (!availability.ok) return { ok: false, reason: availability.reason };

  const pokemon = await getOwnedPokemonById(pokemonId);
  if (!pokemon || pokemon.slack_user_id !== slackUserId) return { ok: false, reason: 'pokemon_not_found' };

  const consume = await removeItem(slackUserId, 'magic_reroll_orb', 1);
  if (!consume.ok) return { ok: false, reason: 'missing_item' };

  const previousIvOffsets = {
    attack_iv: Number(pokemon.attack_iv || 0),
    defense_iv: Number(pokemon.defense_iv || 0),
    magic_iv: Number(pokemon.magic_iv || 0),
    speed_iv: Number(pokemon.speed_iv || 0),
    hp_iv: Number(pokemon.hp_iv || 0),
  };
  const nextIvOffsets = rollPokemonIvOffsets({ shiny: pokemon.shiny, shinyType: pokemon.shiny_type, rarity: pokemon.pokemon_species?.rarity });
  const updated = await updatePokemonAfterMutation({
    pokemon,
    nextIvOffsets,
    shiny: Boolean(pokemon.shiny),
    shinyType: pokemon.shiny ? (pokemon.shiny_type || 'normal') : null,
  });

  return { ok: true, updated, previousIvOffsets, nextIvOffsets, pokemon };
}

async function useTransform({ slackUserId, pokemonId, prime = false }) {
  const availability = await assertPokemonAvailableForAction({ slackUserId, pokemonId, action: prime ? 'transformprime' : 'transform' });
  if (!availability.ok) return { ok: false, reason: availability.reason };

  const pokemon = await getOwnedPokemonById(pokemonId);
  if (!pokemon || pokemon.slack_user_id !== slackUserId) return { ok: false, reason: 'pokemon_not_found' };
  if (prime && pokemon.shiny && pokemon.shiny_type === 'prime') return { ok: false, reason: 'already_prime' };
  if (!prime && pokemon.shiny) return { ok: false, reason: 'already_shiny' };

  const consume = await removeItem(slackUserId, prime ? 'prism_prime' : 'prism_shiny', 1);
  if (!consume.ok) return { ok: false, reason: 'missing_item' };

  const currentIv = {
    attack_iv: Number(pokemon.attack_iv || 0),
    magic_iv: Number(pokemon.magic_iv || 0),
    defense_iv: Number(pokemon.defense_iv || 0),
    hp_iv: Number(pokemon.hp_iv || 0),
    speed_iv: Number(pokemon.speed_iv || 0),
  };

  const updated = await updatePokemonAfterMutation({
    pokemon,
    nextIvOffsets: currentIv,
    shiny: true,
    shinyType: prime ? 'prime' : 'normal',
  });

  return { ok: true, updated };
}

async function getFusionHudResources(slackUserId) {
  const [user, epicFragments, prismaticFragments] = await Promise.all([
    getUser(slackUserId),
    getUserItemQuantity(slackUserId, 'epic_fragment'),
    getUserItemQuantity(slackUserId, 'prismatic_fragment'),
  ]);

  return {
    gold: user?.gold || '0',
    epicFragments,
    prismaticFragments,
  };
}

function buildFusionHud({ slackUserId, resources = {} }) {
  const {
    gold = '0',
    epicFragments = 0,
    prismaticFragments = 0,
  } = resources;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🧪 Fusão de Fragmentos', emoji: true } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `Treinador: <@${slackUserId}>\n` +
          `Gold: *${gold}*\n` +
          `Fragmentos épicos: *${Number(epicFragments || 0)}*\n` +
          `Fragmentos prismáticos: *${Number(prismaticFragments || 0)}*\n` +
          'Escolha um item e a quantidade para craftar.',
      },
    },
  ];

  for (const item of listFusionItems()) {
    const priceLabel = item.costs.map((cost) => `${cost.quantity}x ${cost.itemKey}`).join(' + ');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${item.itemName}*\n${item.description}\nUso: \`${item.useCommand}\`\nCusto base: *${priceLabel}*` },
    });
    blocks.push({
      type: 'actions',
      elements: FUSION_QUANTITIES.map((qty) => ({
        type: 'button',
        action_id: `${FUSION_BUY_ACTION_ID}__${item.itemKey}__${qty}`,
        text: { type: 'plain_text', text: `Comprar x${qty}`, emoji: true },
        value: JSON.stringify({ ownerSlackUserId: slackUserId, itemKey: item.itemKey, quantity: qty }),
      })),
    });
  }

  return { text: 'HUD de fusão', blocks };
}

module.exports = {
  FUSION_BUY_ACTION_ID,
  FUSION_QUANTITIES,
  buildFusionHud,
  getFusionHudResources,
  craftFusionItem,
  useReroll,
  useTransform,
};
