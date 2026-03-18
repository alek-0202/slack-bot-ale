const { getSupabaseClient } = require("../database/supabase");
const { getUserPokemonById } = require("./pokemonService");
const { getUpgradeCost } = require("./upgradeService");
const { getBaseGoldByRarity, getLevelBonus } = require("./economyService");
const { addGold, assertNonNegativeGold, formatGold, toDatabaseGold, toGoldBigInt } = require("../utils/gold");

function getBaseSellPriceByRarity(rarity) {
  return BigInt(getBaseGoldByRarity(rarity));
}

function calculatePokemonSellPrice({ rarity, level }) {
  const safeLevel = Math.max(1, Number(level) || 1);
  const basePrice = getBaseSellPriceByRarity(rarity);
  const extraLevels = safeLevel - 1;

  let totalUpgradeCost = 0n;
  for (let currentLevel = 1; currentLevel <= extraLevels; currentLevel += 1) {
    totalUpgradeCost += getUpgradeCost(currentLevel);
  }

  const levelBonus = BigInt(getLevelBonus(safeLevel));
  const upgradeReturn = totalUpgradeCost / 5n;
  const finalPrice = basePrice + levelBonus + upgradeReturn;

  return {
    basePrice: formatGold(basePrice),
    levelBonus: formatGold(levelBonus),
    totalUpgradeCost: formatGold(totalUpgradeCost),
    upgradeReturn: formatGold(upgradeReturn),
    finalPrice: formatGold(finalPrice >= 0n ? finalPrice : 0n),
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

  const previousGold = toGoldBigInt(user.gold);
  const goldReceived = toGoldBigInt(price.finalPrice);
  const nextGold = assertNonNegativeGold(addGold(previousGold, goldReceived));

  const { error: updateUserError } = await supabase
    .from("users")
    .update({ gold: toDatabaseGold(nextGold) })
    .eq("slack_user_id", slackUserId);
  if (updateUserError) throw updateUserError;

  const { error: transactionError } = await supabase.from("transactions").insert({
    slack_user_id: slackUserId,
    type: "pokemon_sell",
    amount: toDatabaseGold(goldReceived),
  });
  if (transactionError) throw transactionError;

  return {
    ok: true,
    pokemon,
    goldReceived: formatGold(goldReceived),
    currentGold: formatGold(nextGold),
    priceBreakdown: price,
  };
}

module.exports = {
  getBaseSellPriceByRarity,
  calculatePokemonSellPrice,
  sellPokemon,
};
