const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  addOrRefreshEffect,
  ensureElementalState,
  setSkillCooldown,
} = require("./elementalRules");
const { resolveSkillTargets, applyStatusEffectToTargetRef } = require("./targetingEngine");

const ELECTRIC_SKILLS = {
  OVERCHARGE: "electric_overcharge",
  LIGHTNING_CHAIN: "electric_lightning_chain",
  ELECTROSTATIC_FIELD: "electric_electrostatic_field",
};

const ELECTRIC_EFFECT_SHOCK = "electric_shock";
const ELECTRIC_EFFECT_OVERLOAD = "electric_overload";
const ELECTRIC_EFFECT_OVERCHARGE = "electric_overcharge_buff";
const ELECTRIC_EFFECT_FIELD = "electric_electrostatic_field";
const ELECTRIC_EFFECT_FIELD_DEBUFF = "electric_electrostatic_field_debuff";

function hasEffect(player, effectId) {
  return (ensureElementalState(player).effects || []).some((effect) => effect.id === effectId && Number(effect.remainingRounds ?? 1) > 0);
}

function applyShock({ target, sourceUserId }) {
  addOrRefreshEffect(target, {
    id: ELECTRIC_EFFECT_SHOCK,
    name: "Choque",
    element: "electric",
    sourceUserId,
    remainingRounds: 3,
    speedMultiplier: 0.75,
    partialFailureChance: 0.2,
    partialFailureDamageMultiplier: 0.5,
  });
}

function applyOverload({ target, sourceUserId }) {
  addOrRefreshEffect(target, {
    id: ELECTRIC_EFFECT_OVERLOAD,
    name: "Sobrecarga",
    element: "electric",
    sourceUserId,
    remainingRounds: 2,
    loseTurnChance: 0.3,
    partialTurnLossMultiplier: 0.5,
  });
}

const electricRules = {
  element: "electric",
  activeSkillSlots: 3,
  skills: [
    {
      id: ELECTRIC_SKILLS.OVERCHARGE,
      name: "Sobrecarga",
      icon: "⚡",
      hooks: [BATTLE_HOOK.ON_CAST, BATTLE_HOOK.ON_HIT],
      cast({ actor, actorId }) {
        addOrRefreshEffect(actor, {
          id: ELECTRIC_EFFECT_OVERCHARGE,
          name: "Sobrecarga",
          element: "electric",
          remainingRounds: 2,
          chargesRemaining: 2,
          onHitDamageMultiplier: 1.2,
          applyShockOnHit: true,
          cooldownOnExpire: { skillId: ELECTRIC_SKILLS.OVERCHARGE, rounds: 4 },
        });

        return {
          ok: true,
          consumedTurn: true,
          battleLog: `⚡ <@${actorId}> carregou Sobrecarga (2 ataques com choque).`,
        };
      },
      onHit({ attacker, defender, attackerId }) {
        const effect = (ensureElementalState(attacker).effects || []).find((entry) => entry.id === ELECTRIC_EFFECT_OVERCHARGE);
        if (!effect || Number(effect.chargesRemaining || 0) <= 0) return null;
        effect.chargesRemaining = Math.max(0, Number(effect.chargesRemaining || 0) - 1);

        if (hasEffect(defender, ELECTRIC_EFFECT_SHOCK)) {
          applyOverload({ target: defender, sourceUserId: attackerId });
        } else if (effect.applyShockOnHit) {
          applyShock({ target: defender, sourceUserId: attackerId });
        }

        return {
          extraDamageMultiplier: Number(effect.onHitDamageMultiplier || 1),
          battleLog: `⚡ Sobrecarga energizou o ataque (${effect.chargesRemaining} carga(s) restante(s)).`,
        };
      },
    },
    {
      id: ELECTRIC_SKILLS.LIGHTNING_CHAIN,
      name: "Corrente de Raios",
      icon: "🌩️",
      extraEnergyCost: 80,
      cooldownRounds: 5,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ battle, actor, actorId, defenderId }) {
        const efficiencyMultiplier = getElementalEfficiencyMultiplier(actor);
        const baseDamage = Math.max(1, Math.round((Number(actor?.stats?.magic || 1) * 0.85) * efficiencyMultiplier));
        const targets = resolveSkillTargets({
          battle,
          actorId,
          primaryDefenderId: defenderId,
          targeting: {
            mode: "chain",
            maxTargets: 3,
            includeBench: true,
            allowSecondaryOutsideActive: true,
          },
        });

        const singleTargetBoost = targets.length === 1 ? 1.45 : 1;
        const damageEvents = targets.map((targetRef, index) => {
          const targetPlayer = battle.players[targetRef.userId];
          const alreadyShocked = hasEffect(targetPlayer, ELECTRIC_EFFECT_SHOCK);
          const falloffMultiplier = alreadyShocked ? 1 : Math.pow(0.8, index);
          const damage = Math.max(1, Math.round(baseDamage * singleTargetBoost * falloffMultiplier));
          return {
            type: "chain",
            targetRef,
            damageDealt: damage,
            applyAfterDamage: () => {
              if (alreadyShocked) {
                applyOverload({ target: targetPlayer, sourceUserId: actorId });
                addOrRefreshEffect(targetPlayer, {
                  id: "electric_mini_stun",
                  name: "Mini-Stun",
                  element: "electric",
                  remainingRounds: 1,
                  partialTurnLossMultiplier: 0.5,
                });
              } else {
                applyShock({ target: targetPlayer, sourceUserId: actorId });
              }
            },
          };
        });

        setSkillCooldown(actor, ELECTRIC_SKILLS.LIGHTNING_CHAIN, 5);
        return {
          ok: true,
          consumedTurn: true,
          damageEvents,
          battleLog: `🌩️ Corrente de Raios atingiu ${damageEvents.length} alvo(s)${targets.length === 1 ? " com bônus de alvo único" : ""}.`,
        };
      },
    },
    {
      id: ELECTRIC_SKILLS.ELECTROSTATIC_FIELD,
      name: "Campo Eletrostático",
      icon: "🧲",
      extraEnergyCost: 80,
      cooldownRounds: 5,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ battle, actor, actorId }) {
        const efficiencyMultiplier = getElementalEfficiencyMultiplier(actor);
        const procDamage = Math.max(1, Math.round((Number(actor?.stats?.magic || 1) * 0.15) * efficiencyMultiplier));
        addOrRefreshEffect(actor, {
          id: ELECTRIC_EFFECT_FIELD,
          name: "Campo Eletrostático",
          element: "electric",
          remainingRounds: 3,
          outgoingDamageMultiplier: 1.2,
          splashChance: 0.25,
          splashDamageMultiplier: 0.3,
          reactiveHighCostDamage: procDamage,
        });

        for (const targetRef of resolveSkillTargets({
          battle,
          actorId,
          targeting: { mode: "area", includeBench: true, allowSecondaryOutsideActive: true },
        })) {
          applyStatusEffectToTargetRef(battle, targetRef, {
            id: `${ELECTRIC_EFFECT_FIELD_DEBUFF}_${actorId}`,
            name: "Campo Eletrostático (Inimigo)",
            element: "electric",
            sourceUserId: actorId,
            remainingRounds: 3,
            speedMultiplier: 0.8,
            actionShockChance: 0.15,
            actionShockDamage: procDamage,
          });
        }

        setSkillCooldown(actor, ELECTRIC_SKILLS.ELECTROSTATIC_FIELD, 5);
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🧲 <@${actorId}> criou Campo Eletrostático por 3 rodadas.`,
        };
      },
    },
  ],
};

registerElementalRules("electric", electricRules);

module.exports = {
  ELECTRIC_SKILLS,
  ELECTRIC_EFFECT_SHOCK,
  ELECTRIC_EFFECT_OVERLOAD,
  ELECTRIC_EFFECT_OVERCHARGE,
  ELECTRIC_EFFECT_FIELD,
  ELECTRIC_EFFECT_FIELD_DEBUFF,
  electricRules,
};
