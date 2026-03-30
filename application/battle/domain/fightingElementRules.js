const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  addOrRefreshEffect,
  ensureElementalState,
  setSkillCooldown,
} = require("./elementalRules");

const FIGHTING_SKILLS = {
  COMBAT_RHYTHM: "fighting_combat_rhythm",
  DEMOLISHER_STRIKE: "fighting_demolisher_strike",
  UNYIELDING_STANCE: "fighting_unyielding_stance",
};

const FIGHTING_EFFECT_RHYTHM = "fighting_rhythm_effect";
const FIGHTING_EFFECT_FINISHER = "fighting_rhythm_finisher";
const FIGHTING_EFFECT_UNYIELDING = "fighting_unyielding_stance_effect";
const FIGHTING_EFFECT_STANCE_RELEASE = "fighting_unyielding_release";

function getRhythm(attacker) {
  return (ensureElementalState(attacker).effects || []).find((effect) => effect.id === FIGHTING_EFFECT_RHYTHM) || null;
}

function consumeRhythm(attacker) {
  const rhythm = getRhythm(attacker);
  if (!rhythm) return { stacks: 0 };
  const stacks = Math.max(0, Number(rhythm.stacks || 0));
  rhythm.stacks = 0;
  rhythm.targetUserId = null;
  return { stacks };
}

const fightingRules = {
  element: "fighting",
  activeSkillSlots: 3,
  skills: [
    {
      id: FIGHTING_SKILLS.COMBAT_RHYTHM,
      name: "Ritmo de Combate",
      icon: "🥊",
      cooldownRounds: 3,
      hooks: [BATTLE_HOOK.ON_CAST, BATTLE_HOOK.ON_HIT],
      cast({ actor, actorId }) {
        addOrRefreshEffect(actor, {
          id: FIGHTING_EFFECT_RHYTHM,
          name: "Ritmo de Combate",
          element: "fighting",
          remainingRounds: 3,
          stacks: 0,
          maxStacks: 3,
          targetUserId: null,
          breakOnMagic: true,
          breakOnTargetChange: true,
          breakOnMiss: true,
        });
        setSkillCooldown(actor, FIGHTING_SKILLS.COMBAT_RHYTHM, 3);
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🥊 <@${actorId}> entrou em Ritmo de Combate.`,
        };
      },
      onHit({ attacker, attackerId, defenderId, currentDamage }) {
        const rhythm = getRhythm(attacker);
        if (!rhythm) return null;
        if (Number(currentDamage || 0) <= 0) {
          rhythm.stacks = 0;
          rhythm.targetUserId = null;
          return { battleLog: "🥊 Ritmo de Combate quebrou por erro/ataque sem dano." };
        }

        if (rhythm.targetUserId && rhythm.targetUserId !== defenderId) {
          rhythm.stacks = 0;
        }
        rhythm.targetUserId = defenderId;
        rhythm.stacks = Math.min(3, Math.max(0, Number(rhythm.stacks || 0) + 1));
        const stacks = Number(rhythm.stacks || 0);
        const efficiency = getElementalEfficiencyMultiplier(attacker);
        let multiplier = 1 + (stacks * 0.1 * efficiency);
        if (Math.random() < 0.2) {
          multiplier *= 1.5;
        }
        if (stacks >= 3) {
          addOrRefreshEffect(attacker, {
            id: FIGHTING_EFFECT_FINISHER,
            name: "Finisher de Ritmo",
            element: "fighting",
            remainingRounds: 3,
            guaranteedCritMultiplier: 3,
            consumeOnOffensiveAction: true,
          });
        }

        return {
          extraDamageMultiplier: multiplier,
          battleLog: `🥊 Ritmo em ${stacks}/3 no alvo atual.`,
        };
      },
    },
    {
      id: FIGHTING_SKILLS.DEMOLISHER_STRIKE,
      name: "Golpe Demolidor",
      icon: "💥",
      cooldownRounds: 4,
      extraEnergyCost: 80,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, defenderId }) {
        const rhythm = getRhythm(actor);
        const stacks = Math.max(0, Number(rhythm?.stacks || 0));
        const efficiency = getElementalEfficiencyMultiplier(actor);
        const baseDamage = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * efficiency));
        const impactMultiplier = 1 + (stacks * 0.1);
        const damageDealt = Math.max(1, Math.round(baseDamage * impactMultiplier));
        consumeRhythm(actor);
        setSkillCooldown(actor, FIGHTING_SKILLS.DEMOLISHER_STRIKE, 4);
        return {
          ok: true,
          consumedTurn: true,
          damageDealt,
          defenderId,
          consumeStanceRelease: true,
          battleLog: `💥 Golpe Demolidor aplicado${stacks ? ` com Impacto (${stacks} stack(s))` : ""}.`,
        };
      },
    },
    {
      id: FIGHTING_SKILLS.UNYIELDING_STANCE,
      name: "Postura Inabalável",
      icon: "🛡️",
      cooldownRounds: 5,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, actorId }) {
        addOrRefreshEffect(actor, {
          id: FIGHTING_EFFECT_UNYIELDING,
          name: "Postura Inabalável",
          element: "fighting",
          remainingRounds: 2,
          incomingDamageTakenMultiplier: 0.7,
          preventFatal: true,
          storedCharge: 0,
          chargeFromTakenDamageRatio: 0.3,
          cooldownOnExpire: { skillId: FIGHTING_SKILLS.UNYIELDING_STANCE, rounds: 5 },
          grantEffectOnExpire: {
            id: FIGHTING_EFFECT_STANCE_RELEASE,
            name: "Carga Inabalável",
            element: "fighting",
            remainingRounds: 2,
            storedCharge: 0,
            consumeOnAttack: true,
          },
        });
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🛡️ <@${actorId}> entrou em Postura Inabalável por 2 rodadas.`,
        };
      },
    },
  ],
};

registerElementalRules("fighting", fightingRules);

module.exports = {
  FIGHTING_SKILLS,
  FIGHTING_EFFECT_RHYTHM,
  FIGHTING_EFFECT_FINISHER,
  FIGHTING_EFFECT_UNYIELDING,
  FIGHTING_EFFECT_STANCE_RELEASE,
  getRhythm,
  consumeRhythm,
  fightingRules,
};
