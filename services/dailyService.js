const { getSupabaseClient } = require("../database/supabase");
const { getUser, createUserIfMissing } = require("./userService");
const { addGold, assertNonNegativeGold, formatGold, toDatabaseGold, toGoldBigInt } = require("../utils/gold");
const { addItem } = require("./inventoryService");

const DAILY_REWARD_TIERS = [
  { chance: 0.00001, min: 5000, max: 10000 },
  { chance: 0.0005, min: 2000, max: 5000 },
  { chance: 0.003, min: 1000, max: 2000 },
  { chance: 0.05, min: 700, max: 1000 },
  { chance: 0.18, min: 500, max: 700 },
];

const DAILY_ESSENCE_REWARD = 1000;
const DAILY_ANCIENT_BOOKS_REWARD = 5;

function getCurrentDayKey(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasClaimedDailyToday(lastClaimAt, referenceDate = new Date()) {
  if (!lastClaimAt) return false;
  return getCurrentDayKey(new Date(lastClaimAt)) === getCurrentDayKey(referenceDate);
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickDailyRewardTier(randomValue = Math.random()) {
  let cumulative = 0;

  for (const tier of DAILY_REWARD_TIERS) {
    cumulative += tier.chance;
    if (randomValue < cumulative) {
      return tier;
    }
  }

  return { min: 150, max: 500 };
}

function generateDailyGoldReward() {
  const tier = pickDailyRewardTier();
  return BigInt(randomIntInclusive(tier.min, tier.max));
}

async function claimDaily(slackUserId) {
  const supabase = getSupabaseClient();
  const user = (await getUser(slackUserId)) || (await createUserIfMissing(slackUserId));

  if (hasClaimedDailyToday(user.last_claim_at)) {
    return {
      ok: false,
      reason: "already_claimed_today",
    };
  }

  const goldReward = generateDailyGoldReward();
  const pokeballReward = randomIntInclusive(1, 3);
  const nowIso = new Date().toISOString();
  const previousGold = toGoldBigInt(user.gold);
  const nextGold = assertNonNegativeGold(addGold(previousGold, goldReward));
  const currentEssence = Math.max(0, Number(user.pokemonEssence || 0));
  const nextEssence = currentEssence + DAILY_ESSENCE_REWARD;

  const { error: updateUserError } = await supabase
    .from("users")
    .update({
      last_claim_at: nowIso,
      gold: toDatabaseGold(nextGold),
      pokemon_essence: nextEssence,
    })
    .eq("slack_user_id", slackUserId);

  if (updateUserError) throw updateUserError;

  const { error: trxError } = await supabase.from("transactions").insert({
    slack_user_id: slackUserId,
    type: "daily_reward",
    amount: toDatabaseGold(goldReward),
  });

  if (trxError) throw trxError;

  await addItem(slackUserId, "pokeball_c", pokeballReward);
  await addItem(slackUserId, "ancient_book", DAILY_ANCIENT_BOOKS_REWARD);

  return {
    ok: true,
    goldReward: formatGold(goldReward),
    pokeballReward,
    ancientBookReward: DAILY_ANCIENT_BOOKS_REWARD,
    essenceReward: DAILY_ESSENCE_REWARD,
    totalEssence: String(nextEssence),
  };
}

module.exports = {
  DAILY_REWARD_TIERS,
  DAILY_ESSENCE_REWARD,
  DAILY_ANCIENT_BOOKS_REWARD,
  getCurrentDayKey,
  hasClaimedDailyToday,
  pickDailyRewardTier,
  generateDailyGoldReward,
  claimDaily,
};
