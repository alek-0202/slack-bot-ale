const { getSupabaseClient } = require("../database/supabase");

async function getUser(slackUserId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("slack_user_id, gold, created_at, last_capture_at")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createUserIfMissing(slackUserId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .upsert({ slack_user_id: slackUserId }, { onConflict: "slack_user_id" })
    .select("slack_user_id, gold, created_at, last_capture_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateLastCapture(slackUserId, isoDate) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({ last_capture_at: isoDate })
    .eq("slack_user_id", slackUserId);

  if (error) throw error;
}

module.exports = {
  getUser,
  createUserIfMissing,
  updateLastCapture,
};
