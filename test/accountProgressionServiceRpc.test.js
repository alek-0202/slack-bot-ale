const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const servicePath = path.resolve(__dirname, '../services/accountProgressionService.js');
const dbPath = path.resolve(__dirname, '../database/supabase.js');

function loadServiceWithSupabase(supabase) {
  delete require.cache[servicePath];
  delete require.cache[dbPath];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      getSupabaseClient() {
        return supabase;
      },
    },
  };

  return require(servicePath);
}

test('grantAccountXp delegates to RPC and maps snapshot correctly', async () => {
  const rpcCalls = [];
  const supabase = {
    async rpc(fn, params) {
      rpcCalls.push({ fn, params });
      return {
        data: [{
          granted_xp: 500,
          previous_level: 1,
          previous_total_xp: 50,
          current_level: 4,
          current_total_xp: 550,
          current_level_xp: 100,
          xp_to_next_level: 250,
          leveled_up: true,
          levels_gained: 3,
          reason: 'dungeon_daily_hard_reward',
        }],
        error: null,
      };
    },
  };

  const { grantAccountXp } = loadServiceWithSupabase(supabase);
  const result = await grantAccountXp('U123', 500, 'dungeon_daily_hard_reward');

  assert.deepEqual(rpcCalls, [{
    fn: 'grant_account_xp',
    params: {
      p_slack_user_id: 'U123',
      p_xp_amount: 500,
      p_reason: 'dungeon_daily_hard_reward',
    },
  }]);
  assert.equal(result.grantedXp, 500);
  assert.equal(result.previous.level, 1);
  assert.equal(result.current.level, 4);
  assert.equal(result.current.currentLevelXp, 100);
  assert.equal(result.current.xpToNextLevel, 250);
  assert.equal(result.leveledUp, true);
  assert.equal(result.levelsGained, 3);
});
