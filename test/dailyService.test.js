const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getCurrentDayKey,
  hasClaimedDailyToday,
  pickDailyRewardTier,
} = require("../services/dailyService");

test("getCurrentDayKey retorna data em YYYY-MM-DD", () => {
  const key = getCurrentDayKey(new Date("2026-03-17T23:59:59.000Z"));
  assert.equal(key, "2026-03-17");
});

test("hasClaimedDailyToday valida por dia e não por horário", () => {
  const now = new Date("2026-03-18T00:00:00.000Z");

  assert.equal(hasClaimedDailyToday("2026-03-17T23:59:59.000Z", now), false);
  assert.equal(hasClaimedDailyToday("2026-03-18T00:00:00.000Z", now), true);
});

test("pickDailyRewardTier respeita limites de probabilidade", () => {
  assert.deepEqual(pickDailyRewardTier(0), { chance: 0.00001, min: 5000, max: 10000 });
  assert.deepEqual(pickDailyRewardTier(0.00002), { chance: 0.0005, min: 2000, max: 5000 });
  assert.deepEqual(pickDailyRewardTier(0.0006), { chance: 0.003, min: 1000, max: 2000 });
  assert.deepEqual(pickDailyRewardTier(0.01), { chance: 0.05, min: 700, max: 1000 });
  assert.deepEqual(pickDailyRewardTier(0.06), { chance: 0.18, min: 500, max: 700 });
  assert.deepEqual(pickDailyRewardTier(0.5), { min: 150, max: 500 });
});
