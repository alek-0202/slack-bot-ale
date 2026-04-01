const { getSupabaseClient } = require('../database/supabase');
const { createUserIfMissing } = require('./userService');
const { addItem } = require('./inventoryService');

async function grantGold(slackUserId, amount) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('apply_gold_transaction', {
    p_slack_user_id: slackUserId,
    p_amount: Number(amount) || 0,
    p_transaction_type: 'admin_grant_gold',
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function grantEnergy(slackUserId, amount) {
  await createUserIfMissing(slackUserId);
  const supabase = getSupabaseClient();
  const safeAmount = Math.max(1, Number(amount) || 1);

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('current_energy, max_energy, last_energy_update')
    .eq('slack_user_id', slackUserId)
    .single();
  if (userError) throw userError;

  const nextCurrentEnergy = Math.min(Number(user.max_energy) || 0, (Number(user.current_energy) || 0) + safeAmount);
  const { data, error } = await supabase
    .from('users')
    .update({
      current_energy: nextCurrentEnergy,
      last_energy_update: user.last_energy_update || new Date().toISOString(),
    })
    .eq('slack_user_id', slackUserId)
    .select('current_energy, max_energy')
    .single();

  if (error) throw error;
  return {
    grantedAmount: safeAmount,
    currentEnergy: Number(data.current_energy) || 0,
    maxEnergy: Number(data.max_energy) || 0,
  };
}

async function grantPokeballC(slackUserId, amount) {
  return addItem(slackUserId, 'pokeball_c', amount);
}

async function grantAncientBook(slackUserId, amount) {
  return addItem(slackUserId, 'ancient_book', amount);
}

async function grantDungeonBag(slackUserId, amount) {
  return addItem(slackUserId, 'dungeon_60_supply_bag', amount);
}

module.exports = {
  grantGold,
  grantEnergy,
  grantPokeballC,
  grantAncientBook,
  grantDungeonBag,
};
