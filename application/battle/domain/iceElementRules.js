const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  addOrRefreshEffect,
  ensureElementalState,
  setSkillCooldown,
} = require("./elementalRules");
const { resolveSkillTargets, applyDamageToTargetRef, applyStatusEffectToTargetRef } = require("./targetingEngine");
const {
  applyGelidStacks,
  hasGelid,
  hasFrozen,
  consumeFrozen,
  applyBreak,
  getGelidStacks,
} = require("./iceStatusRules");

const ICE_SKILLS = {
  ICE_ARMOR: "ice_armor",
  GLACIAL_SHARD: "ice_glacial_shard",
  BLIZZARD: "ice_blizzard",
};

const ICE_EFFECT_ARMOR = "ice_armor_effect";
const ICE_EFFECT_BLIZZARD_FIELD = "ice_blizzard_field";
const ICE_EFFECT_BLIZZARD_DEBUFF = "ice_blizzard_debuff";

const iceRules = {
  element: "ice",
  activeSkillSlots: 3,
  skills: [
    {
      id: ICE_SKILLS.ICE_ARMOR,
      name: "Armadura de Gelo",
      icon: "🧊",
      cooldownRounds: 5,
      hooks: [BATTLE_HOOK.ON_CAST, BATTLE_HOOK.ON_HIT],
      cast({ actor, actorId }) {
        addOrRefreshEffect(actor, {
          id: ICE_EFFECT_ARMOR,
          name: "Armadura de Gelo",
          element: "ice",
          remainingRounds: 3,
          incomingDamageTakenMultiplier: 0.75,
          retaliationApplyGelid: 1,
        });
        setSkillCooldown(actor, ICE_SKILLS.ICE_ARMOR, 5);
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🧊 <@${actorId}> ativou Armadura de Gelo por 3 rodadas.`,
        };
      },
      onHit({ attacker, defender }) {
        const armor = (ensureElementalState(attacker).effects || []).find((effect) => effect.id === ICE_EFFECT_ARMOR);
        if (!armor) return null;
        if (!hasGelid(defender)) return null;
        return {
          extraDamageMultiplier: 1.15,
          battleLog: "🧊 Armadura de Gelo amplificou dano em alvo Gélido.",
        };
      },
    },
    {
      id: ICE_SKILLS.GLACIAL_SHARD,
      name: "Estilhaço Glacial",
      icon: "❄️",
      cooldownRounds: 5,
      extraEnergyCost: 80,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ battle, actor, defender, actorId, defenderId }) {
        const baseDamage = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * 0.9 * getElementalEfficiencyMultiplier(actor)));
        const frozen = hasFrozen(defender);
        const gelid = hasGelid(defender);
        const stateMultiplier = frozen ? 1.6 : gelid ? 1.3 : 1;
        const damageDealt = Math.max(1, Math.round(baseDamage * stateMultiplier));

        if (frozen) {
          consumeFrozen(defender);
          applyBreak(defender, actorId);
        }

        setSkillCooldown(actor, ICE_SKILLS.GLACIAL_SHARD, 5);
        return {
          ok: true,
          consumedTurn: true,
          damageDealt,
          defenderId,
          onKillSpread: { status: "gelid", stacks: 1 },
          battleLog: `❄️ Estilhaço Glacial atingiu <@${defenderId}> (${frozen ? "Congelado consumido + Quebra" : gelid ? "bônus contra Gélido" : "dano base"}).`,
        };
      },
    },
    {
      id: ICE_SKILLS.BLIZZARD,
      name: "Nevasca",
      icon: "🌨️",
      cooldownRounds: 5,
      extraEnergyCost: 100,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ battle, actor, actorId }) {
        const tickDamage = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * 0.4 * getElementalEfficiencyMultiplier(actor)));
        addOrRefreshEffect(actor, {
          id: ICE_EFFECT_BLIZZARD_FIELD,
          name: "Nevasca",
          element: "ice",
          remainingRounds: 3,
          incomingDamageTakenMultiplier: 0.9,
          blizzardTickDamage: tickDamage,
        });

        for (const targetRef of resolveSkillTargets({
          battle,
          actorId,
          targeting: { mode: "area", includeBench: true, allowSecondaryOutsideActive: true },
        })) {
          applyStatusEffectToTargetRef(battle, targetRef, {
            id: `${ICE_EFFECT_BLIZZARD_DEBUFF}_${actorId}`,
            name: "Nevasca (Debuff)",
            element: "ice",
            sourceUserId: actorId,
            remainingRounds: 3,
            speedMultiplier: 0.75,
            partialFailureChance: 0.15,
            partialFailureDamageMultiplier: 0.85,
          });
        }

        setSkillCooldown(actor, ICE_SKILLS.BLIZZARD, 5);
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🌨️ <@${actorId}> invocou Nevasca por 3 rodadas.`,
        };
      },
    },
  ],
  hooks: {
    [BATTLE_HOOK.END_OF_ROUND]: ({ battle }) => {
      const logs = [];
      for (const [userId, player] of Object.entries(battle.players || {})) {
        const field = (ensureElementalState(player).effects || []).find((effect) => effect.id === ICE_EFFECT_BLIZZARD_FIELD);
        if (!field) continue;
        const targets = resolveSkillTargets({
          battle,
          actorId: userId,
          targeting: { mode: "area", includeBench: true, allowSecondaryOutsideActive: true },
        });
        for (const targetRef of targets) {
          const damageResult = applyDamageToTargetRef(battle, targetRef, Number(field.blizzardTickDamage || 0));
          const targetPlayer = battle.players[targetRef.userId];
          const gelidResult = applyGelidStacks(targetPlayer, 1, userId);
          if (!gelidResult.promotedToFrozen && getGelidStacks(targetPlayer) >= 2 && Math.random() < 0.2) {
            applyGelidStacks(targetPlayer, 1, userId);
          }
          logs.push(`🌨️ Nevasca causou ${damageResult.damageApplied} em <@${targetRef.userId}> e aplicou Gélido.`);
        }
      }
      return logs;
    },
  },
};

registerElementalRules("ice", iceRules);

module.exports = {
  ICE_SKILLS,
  ICE_EFFECT_ARMOR,
  ICE_EFFECT_BLIZZARD_FIELD,
  ICE_EFFECT_BLIZZARD_DEBUFF,
  iceRules,
};
