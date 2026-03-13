const { pickByRarity } = require("../pokemon/rarity");
const { getSupabaseClient } = require("../database/supabase");
const { getUser, createUserIfMissing } = require("./userService");
const { getAllSpecies, insertUserPokemon } = require("./pokemonService");

const CAPTURE_COOLDOWN_MS = 10 * 60 * 1000;
const SHINY_CHANCE = 0.02;

function getCooldownRemainingMs(lastCaptureAt) {
  if (!lastCaptureAt) return 0;

  const nextTime = new Date(lastCaptureAt).getTime() + CAPTURE_COOLDOWN_MS;
  return Math.max(0, nextTime - Date.now());
}

function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

async function capturePokemon(slackUserId) {
  const supabase = getSupabaseClient();
  const user = (await getUser(slackUserId)) || (await createUserIfMissing(slackUserId));

  const remainingMs = getCooldownRemainingMs(user.last_capture_at);
  if (remainingMs > 0) {
    return {
      ok: false,
      reason: "cooldown",
      remainingMs,
      remainingText: formatRemaining(remainingMs),
    };
  }

  const speciesList = await getAllSpecies();
  if (!speciesList.length) {
    return {
      ok: false,
      reason: "no_species",
    };
  }

  const selected = pickByRarity(speciesList);
  const shiny = Math.random() < SHINY_CHANCE;
  const level = 1 + Math.floor(Math.random() * 3);
  const goldReward = Math.max(5, selected.base_value || 5);
  const nowIso = new Date().toISOString();

  const captured = await insertUserPokemon({
    slackUserId,
    speciesId: selected.id,
    level,
    shiny,
  });

  const { error: updateUserError } = await supabase
    .from("users")
    .update({
      last_capture_at: nowIso,
      gold: (user.gold || 0) + goldReward,
    })
    .eq("slack_user_id", slackUserId);
  if (updateUserError) throw updateUserError;

  const { error: trxError } = await supabase.from("transactions").insert({
    slack_user_id: slackUserId,
    type: "capture_reward",
    amount: goldReward,
  });
  if (trxError) throw trxError;

  return {
    ok: true,
    captured,
    species: selected,
    shiny,
    goldReward,
  };
}

module.exports = {
  CAPTURE_COOLDOWN_MS,
  capturePokemon,
};
