const { getSupabaseClient } = require("../database/supabase");
const { getUser, createUserIfMissing } = require("./userService");

const DAILY_REWARD_TIERS = [
  { chance: 0.00001, min: 5000, max: 10000 },
  { chance: 0.0005, min: 2000, max: 5000 },
  { chance: 0.003, min: 1000, max: 2000 },
  { chance: 0.05, min: 700, max: 1000 },
  { chance: 0.18, min: 500, max: 700 },
];

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
  return randomIntInclusive(tier.min, tier.max);
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
  const nowIso = new Date().toISOString();

  const { error: updateUserError } = await supabase
    .from("users")
    .update({
      last_claim_at: nowIso,
      gold: (user.gold || 0) + goldReward,
    })
    .eq("slack_user_id", slackUserId);

  if (updateUserError) throw updateUserError;

  const { error: trxError } = await supabase.from("transactions").insert({
    slack_user_id: slackUserId,
    type: "daily_reward",
    amount: goldReward,
  });

  if (trxError) throw trxError;

  return {
    ok: true,
    goldReward,
  };
}

module.exports = {
  DAILY_REWARD_TIERS,
  getCurrentDayKey,
  hasClaimedDailyToday,
  pickDailyRewardTier,
  generateDailyGoldReward,
  claimDaily,
};
