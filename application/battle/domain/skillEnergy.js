const SKILL_ENERGY_MAX = 200;
const BASE_SKILL_ENERGY_REGEN = 25;

function ensureSkillEnergyState(playerState) {
  if (!playerState) return null;
  if (playerState.skillEnergyMax == null) playerState.skillEnergyMax = SKILL_ENERGY_MAX;
  if (playerState.skillEnergy == null) playerState.skillEnergy = playerState.skillEnergyMax;
  return playerState;
}

function getBaseEnergyRegen() {
  return BASE_SKILL_ENERGY_REGEN;
}

function getEnergyRegenModifiers(actor) {
  const effects = Array.isArray(actor?.elementalState?.effects) ? actor.elementalState.effects : [];
  return effects
    .filter((effect) => Number(effect?.remainingRounds ?? 1) > 0)
    .map((effect) => ({
      flat: Number(effect?.energyRegenFlat || 0),
      multiplier: Number(effect?.energyRegenMultiplier || 1),
    }));
}

function getModifiedEnergyRegen(actor, combat) {
  const base = getBaseEnergyRegen(actor, combat);
  return getEnergyRegenModifiers(actor, combat).reduce((acc, value) => {
    const flatRaw = value && typeof value === "object" ? value.flat : value;
    const flat = Number.isFinite(Number(flatRaw)) ? Number(flatRaw) : 0;
    const multiplier = Number(value?.multiplier || 1);
    const byMultiplier = Number.isFinite(multiplier) && multiplier !== 1
      ? Math.round(base * (multiplier - 1))
      : 0;
    return acc + flat + byMultiplier;
  }, 0);
}

function regenerateSkillEnergy(actor, combat) {
  if (!ensureSkillEnergyState(actor)) return 0;
  const before = Math.max(0, Number(actor.skillEnergy || 0));
  const regen = Math.max(0, getBaseEnergyRegen(actor, combat) + getModifiedEnergyRegen(actor, combat));
  actor.skillEnergy = Math.min(
    Math.max(0, Number(actor.skillEnergyMax || SKILL_ENERGY_MAX)),
    before + regen,
  );
  return Math.max(0, Number(actor.skillEnergy || 0) - before);
}

function consumeSkillEnergy(actor, amount) {
  if (!ensureSkillEnergyState(actor)) return { ok: false, currentEnergy: 0, requiredEnergy: amount };
  const cost = Math.max(0, Number(amount) || 0);
  const current = Math.max(0, Number(actor.skillEnergy || 0));
  if (current < cost) return { ok: false, currentEnergy: current, requiredEnergy: cost };
  actor.skillEnergy = current - cost;
  return { ok: true, consumed: cost, currentEnergy: actor.skillEnergy };
}

function restoreSkillEnergy(actor, amount) {
  if (!ensureSkillEnergyState(actor)) return;
  const gain = Math.max(0, Number(amount) || 0);
  actor.skillEnergy = Math.min(
    Math.max(0, Number(actor.skillEnergyMax || SKILL_ENERGY_MAX)),
    Math.max(0, Number(actor.skillEnergy || 0)) + gain,
  );
}

module.exports = {
  SKILL_ENERGY_MAX,
  BASE_SKILL_ENERGY_REGEN,
  ensureSkillEnergyState,
  getBaseEnergyRegen,
  getEnergyRegenModifiers,
  getModifiedEnergyRegen,
  regenerateSkillEnergy,
  consumeSkillEnergy,
  restoreSkillEnergy,
};
