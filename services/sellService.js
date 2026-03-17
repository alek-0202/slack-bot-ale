const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById } = require("./pokemonService");
const { getUpgradeCost } = require("./upgradeService");
const { getBaseGoldByRarity, getLevelBonus } = require("./economyService");

function getBaseSellPriceByRarity(rarity) {
  return getBaseGoldByRarity(rarity);
}

function calculatePokemonSellPrice({ rarity, level }) {
  const safeLevel = Math.max(1, Number(level) || 1);
  const basePrice = getBaseSellPriceByRarity(rarity);
  const extraLevels = safeLevel - 1;

  let totalUpgradeCost = 0;
  for (let currentLevel = 1; currentLevel <= extraLevels; currentLevel += 1) {
    totalUpgradeCost += getUpgradeCost(currentLevel);
  }

  const levelBonus = getLevelBonus(safeLevel);
  const upgradeReturn = Math.floor(totalUpgradeCost * 0.2);

  return {
    basePrice,
    levelBonus,
    totalUpgradeCost,
    upgradeReturn,
    finalPrice: Math.max(0, basePrice + levelBonus + upgradeReturn),
  };
}

async function sellPokemon({ slackUserId, pokemonId }) {
  const supabase = getSupabaseClient();
  const pokemon = await getUserPokemonById(slackUserId, pokemonId);

  if (!pokemon) {
    return { ok: false, reason: "pokemon_not_owned" };
  }

  const price = calculatePokemonSellPrice({
    rarity: pokemon.pokemon_species?.rarity,
    level: pokemon.level,
  });

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("slack_user_id, gold")
    .eq("slack_user_id", slackUserId)
    .single();
  if (userError) throw userError;

  const { error: deleteError } = await supabase
    .from("user_pokemons")
    .delete()
    .eq("id", pokemon.id)
    .eq("slack_user_id", slackUserId);
  if (deleteError) throw deleteError;

  const nextGold = (user.gold || 0) + price.finalPrice;

  const { error: updateUserError } = await supabase
    .from("users")
    .update({ gold: nextGold })
    .eq("slack_user_id", slackUserId);
  if (updateUserError) throw updateUserError;

  const { error: transactionError } = await supabase.from("transactions").insert({
    slack_user_id: slackUserId,
    type: "pokemon_sell",
    amount: price.finalPrice,
  });
  if (transactionError) throw transactionError;

  return {
    ok: true,
    pokemon,
    goldReceived: price.finalPrice,
    currentGold: nextGold,
    priceBreakdown: price,
  };
}

module.exports = {
  getBaseSellPriceByRarity,
  calculatePokemonSellPrice,
  sellPokemon,
};
