const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  ensureElementalState,
  upsertStatus,
  addOrRefreshEffect,
  getStatus,
  hasStatus,
  setSkillCooldown,
} = require("./elementalRules");

const SKILL_IDS = {
  BURNING_CLAWS: "fire_burning_claws",
  INFERNAL_BREATH: "fire_infernal_breath",
  IGNEOUS_DEFENSE: "fire_igneous_defense",
};

const FIRE_BURN_STATUS_ID = "fire_burn";
const FIRE_BURN_MAX_STACKS = 3;
const FIRE_IGNEOUS_DEFENSE_EFFECT = "fire_igneous_defense_effect";

function applyBurn({ target, sourceUserId, damagePerStack, rounds, maxStacks = FIRE_BURN_MAX_STACKS }) {
  const current = getStatus(target, FIRE_BURN_STATUS_ID);
  const nextStacks = Math.min(maxStacks, Math.max(1, Number(current?.stacks || 0) + 1));
  return upsertStatus(target, {
    id: FIRE_BURN_STATUS_ID,
    name: "Burn",
    element: "fire",
    sourceUserId,
    stacks: nextStacks,
    maxStacks,
    damagePerStack: Math.max(0, Math.round(damagePerStack || 0)),
    remainingRounds: Math.max(1, Number(rounds) || 1),
  });
}

const fireRules = {
  element: "fire",
  activeSkillSlots: 3,
  skills: [
    {
      id: SKILL_IDS.BURNING_CLAWS,
      name: "Garras Ardentes",
      icon: "🔥",
      cooldownRounds: 5,
      hooks: [BATTLE_HOOK.ON_CAST, BATTLE_HOOK.ON_HIT],
      cast({ battle, actor, actorId }) {
        addOrRefreshEffect(actor, {
          id: "fire_burning_claws_effect",
          name: "Garras Ardentes",
          chargesRemaining: 3,
          remainingRounds: null,
          damageBoostPct: 0.3,
          burnRounds: 2,
        });

        return {
          ok: true,
          consumedTurn: true,
          forcePassTurn: true,
          reason: "burning_claws_applied",
          battleLog: `🔥 <@${actorId}> ativou *Garras Ardentes* (3 ataques fortalecidos).`,
          cooldownMode: "on_effect_end",
        };
      },
      onHit({ attacker, defender, attackerId }) {
        const state = ensureElementalState(attacker);
        const effect = state.effects.find((entry) => entry.id === "fire_burning_claws_effect");
        if (!effect || Number(effect.chargesRemaining || 0) <= 0) return { extraDamageMultiplier: 1 };

        effect.chargesRemaining = Math.max(0, Number(effect.chargesRemaining) - 1);
        const burnDamage = Math.round((Number(attacker.stats?.magic || 0) * 0.2) * getElementalEfficiencyMultiplier(attacker));
        applyBurn({
          target: defender,
          sourceUserId: attackerId,
          damagePerStack: burnDamage,
          rounds: Number(effect.burnRounds || 2),
          maxStacks: FIRE_BURN_MAX_STACKS,
        });

        const cooldownReady = Number(effect.chargesRemaining) === 0;
        if (cooldownReady) {
          setSkillCooldown(attacker, SKILL_IDS.BURNING_CLAWS, 5);
        }

        return {
          extraDamageMultiplier: 1 + Number(effect.damageBoostPct || 0),
          battleLog: `🔥 Garras Ardentes: +30% dano e Burn aplicado (${effect.chargesRemaining} carga(s) restante(s)).`,
        };
      },
    },
    {
      id: SKILL_IDS.INFERNAL_BREATH,
      name: "Sopro Infernal",
      icon: "🌋",
      cooldownRounds: 5,
      extraEnergyCost: 100,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, defender, actorId, defenderId, elementalRelation }) {
        const baseMagic = Math.max(1, Number(actor.stats?.magic || actor.stats?.attack || 1));
        const efficiencyMultiplier = getElementalEfficiencyMultiplier(actor);
        const fixedElementalDamage = Math.round((baseMagic * 0.9) * efficiencyMultiplier * (elementalRelation?.multiplier || 1));
        defender.battleHp.current = Math.max(0, Number(defender.battleHp.current || 0) - fixedElementalDamage);

        const burnDamage = Math.round((baseMagic * 0.5) * efficiencyMultiplier);
        applyBurn({
          target: defender,
          sourceUserId: actorId,
          damagePerStack: burnDamage,
          rounds: 4,
          maxStacks: FIRE_BURN_MAX_STACKS,
        });

        setSkillCooldown(actor, SKILL_IDS.INFERNAL_BREATH, 5);

        return {
          ok: true,
          consumedTurn: true,
          damageDealt: fixedElementalDamage,
          defenderId,
          defenderRemainingHp: defender.battleHp.current,
          reason: "infernal_breath_applied",
          battleLog: `🌋 Sopro Infernal atingiu <@${defenderId}> com ${fixedElementalDamage} de dano elemental e aplicou Burn (4 rodadas).`,
        };
      },
    },
    {
      id: SKILL_IDS.IGNEOUS_DEFENSE,
      name: "Defesa Ígnea",
      icon: "🛡️",
      cooldownRounds: 5,
      hooks: [BATTLE_HOOK.ON_CAST, BATTLE_HOOK.BEFORE_DAMAGE],
      cast({ actor, actorId }) {
        const missingHp = Math.max(0, Number(actor.battleHp.max || 0) - Number(actor.battleHp.current || 0));
        const healAmount = Math.min(400, Math.round(missingHp * 0.15));
        actor.battleHp.current = Math.min(Number(actor.battleHp.max || 0), Number(actor.battleHp.current || 0) + healAmount);

        addOrRefreshEffect(actor, {
          id: FIRE_IGNEOUS_DEFENSE_EFFECT,
          name: "Defesa Ígnea",
          remainingRounds: 3,
          burnAttackerReductionPct: 0.2,
        });

        upsertStatus(actor, {
          id: FIRE_BURN_STATUS_ID,
          name: "Burn",
          element: "fire",
          sourceUserId: actorId,
          stacks: 1,
          maxStacks: FIRE_BURN_MAX_STACKS,
          damagePerStack: 0,
          remainingRounds: 3,
        });

        setSkillCooldown(actor, SKILL_IDS.IGNEOUS_DEFENSE, 5);

        return {
          ok: true,
          consumedTurn: true,
          healAmount,
          reason: "igneous_defense_applied",
          battleLog: `🛡️ Defesa Ígnea ativada: cura ${healAmount} HP e reduz dano de inimigos queimados por 3 rodadas.`,
        };
      },
      beforeDamage({ attacker, defender }) {
        const state = ensureElementalState(defender);
        const active = state.effects.find((entry) => entry.id === FIRE_IGNEOUS_DEFENSE_EFFECT);
        if (!active || Number(active.remainingRounds || 0) <= 0) return null;
        if (!hasStatus(attacker, FIRE_BURN_STATUS_ID)) return null;

        return {
          damageMultiplier: 1 - Number(active.burnAttackerReductionPct || 0),
          battleLog: "🛡️ Defesa Ígnea reduziu em 20% o dano do inimigo em Burn.",
        };
      },
    },
  ],
  hooks: {
    [BATTLE_HOOK.END_OF_ROUND]: ({ battle }) => {
      const logs = [];
      for (const [userId, player] of Object.entries(battle.players || {})) {
        const burnStatus = getStatus(player, FIRE_BURN_STATUS_ID);
        if (!burnStatus) continue;
        const damage = Math.max(0, Math.round(Number(burnStatus.damagePerStack || 0) * Number(burnStatus.stacks || 0)));
        if (damage > 0) {
          player.battleHp.current = Math.max(0, Number(player.battleHp.current || 0) - damage);
          logs.push(`🔥 Burn causou ${damage} em <@${userId}> (${player.battleHp.current}/${player.battleHp.max}).`);
        }
      }
      return logs;
    },
  },
};

registerElementalRules("fire", fireRules);

module.exports = {
  SKILL_IDS,
  FIRE_BURN_STATUS_ID,
  fireRules,
};
