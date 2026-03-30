const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  addOrRefreshEffect,
  ensureElementalState,
  setSkillCooldown,
} = require("./elementalRules");

const PSYCHIC_SKILLS = {
  MIND_READING: "psychic_mind_reading",
  PSYCHIC_BURST: "psychic_burst",
  PSYCHIC_BARRIER: "psychic_barrier",
};

const PSYCHIC_EFFECT_MARK = "psychic_prediction_mark";
const PSYCHIC_EFFECT_READ_STATE = "psychic_read_state";
const PSYCHIC_EFFECT_RECHARGE = "psychic_telekinetic_recharge";
const PSYCHIC_EFFECT_BARRIER = "psychic_barrier_effect";
const PSYCHIC_EFFECT_BARRIER_BREAK_BUFF = "psychic_barrier_break_buff";

function getReadState(actor) {
  return (ensureElementalState(actor).effects || []).find((entry) => entry.id === PSYCHIC_EFFECT_READ_STATE) || null;
}

function clearReadState(actor) {
  const state = getReadState(actor);
  if (state) state.remainingRounds = 0;
  const mark = (ensureElementalState(actor).effects || []).find((entry) => entry.id === PSYCHIC_EFFECT_MARK);
  if (mark) mark.remainingRounds = 0;
}

const psychicRules = {
  element: "psychic",
  activeSkillSlots: 3,
  skills: [
    {
      id: PSYCHIC_SKILLS.MIND_READING,
      name: "Leitura Mental",
      icon: "🧠",
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, actorId, defenderId }) {
        let state = getReadState(actor);
        if (!state) {
          state = addOrRefreshEffect(actor, {
            id: PSYCHIC_EFFECT_READ_STATE,
            name: "Leitura Mental",
            element: "psychic",
            remainingRounds: 4,
            chargesRemaining: 2,
            markedTargetUserId: defenderId,
          });
        }

        const efficiency = getElementalEfficiencyMultiplier(actor);
        const isSecondOnMarked = Number(state.chargesRemaining || 0) === 1 && state.markedTargetUserId === defenderId;
        const baseScale = isSecondOnMarked ? 1.1 : 0.4;
        let damageDealt = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * baseScale * efficiency));
        if (isSecondOnMarked) damageDealt = Math.round(damageDealt * 1.25);

        state.chargesRemaining = Math.max(0, Number(state.chargesRemaining || 0) - 1);
        state.markedTargetUserId = defenderId;

        addOrRefreshEffect(actor, {
          id: PSYCHIC_EFFECT_MARK,
          name: "Previsão",
          element: "psychic",
          remainingRounds: 2,
          markedTargetUserId: defenderId,
          speedMultiplier: 1.2,
          outgoingDamageVsMarkedMultiplier: 1.25,
        });

        if (Number(state.chargesRemaining || 0) <= 0) {
          addOrRefreshEffect(actor, {
            id: PSYCHIC_EFFECT_RECHARGE,
            name: "Recarga Telecinética",
            element: "psychic",
            remainingRounds: 1,
            forcedSkipAction: true,
            consumeOnActionStart: true,
          });
          setSkillCooldown(actor, PSYCHIC_SKILLS.MIND_READING, 6);
          state.remainingRounds = 0;
          const mark = (ensureElementalState(actor).effects || []).find((entry) => entry.id === PSYCHIC_EFFECT_MARK);
          if (mark) mark.remainingRounds = 0;
        }

        return {
          ok: true,
          consumedTurn: true,
          damageDealt,
          consumePsychicBarrierOnHit: true,
          defenderId,
          battleLog: `🧠 Leitura Mental atingiu <@${defenderId}>${isSecondOnMarked ? " (segunda carga com Previsão)." : "."}`,
        };
      },
    },
    {
      id: PSYCHIC_SKILLS.PSYCHIC_BURST,
      name: "Explosão Psíquica",
      icon: "💫",
      cooldownRounds: 5,
      extraEnergyCost: 80,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, defender, actorId, defenderId, elementalRelation }) {
        if (elementalRelation?.hasDisadvantage) {
          addOrRefreshEffect(actor, {
            id: "psychic_illusion_shield",
            name: "Ilusão Psíquica",
            element: "psychic",
            remainingRounds: 1,
            shieldCurrentHp: Number(actor?.battleHp?.max || 0),
            shieldMaxHp: Number(actor?.battleHp?.max || 0),
            immuneToDamageAndControl: true,
          });
          setSkillCooldown(actor, PSYCHIC_SKILLS.PSYCHIC_BURST, 5);
          return {
            ok: true,
            consumedTurn: true,
            damageDealt: 0,
            consumeAllEnergy: true,
            defenderId,
            battleLog: `💫 Explosão Psíquica virou Ilusão contra counter elemental.`,
          };
        }

        const damageDealt = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * 0.8 * getElementalEfficiencyMultiplier(actor)));
        addOrRefreshEffect(defender, {
          id: "psychic_burst_slow",
          name: "Compressão Mental",
          element: "psychic",
          remainingRounds: 2,
          speedMultiplier: 0.7,
        });
        setSkillCooldown(actor, PSYCHIC_SKILLS.PSYCHIC_BURST, 5);
        return {
          ok: true,
          consumedTurn: true,
          damageDealt,
          consumePsychicBarrierOnHit: true,
          defenderId,
          battleLog: `💫 Explosão Psíquica causou dano e reduziu iniciativa de <@${defenderId}>.`,
        };
      },
    },
    {
      id: PSYCHIC_SKILLS.PSYCHIC_BARRIER,
      name: "Barreira Psíquica",
      icon: "🛡️",
      hooks: [BATTLE_HOOK.ON_CAST, BATTLE_HOOK.ON_HIT, BATTLE_HOOK.END_OF_ROUND],
      cast({ actor, actorId }) {
        const hpRatio = Number(actor?.battleHp?.current || 0) / Math.max(1, Number(actor?.battleHp?.max || 1));
        const efficiency = getElementalEfficiencyMultiplier(actor);
        const baseBarrier = hpRatio < 0.15
          ? Math.round(Number(actor?.battleHp?.max || 0) * 0.14)
          : Math.round((Number(actor?.stats?.magic || 0) * 0.1 * efficiency) + (Number(actor?.battleHp?.max || 0) * 0.07));

        addOrRefreshEffect(actor, {
          id: PSYCHIC_EFFECT_BARRIER,
          name: "Barreira Psíquica",
          element: "psychic",
          remainingRounds: null,
          shieldCurrentHp: Math.max(1, baseBarrier),
          shieldMaxHp: Math.max(1, baseBarrier),
          psychicEnergyStacks: 0,
          cooldownOnExpire: { skillId: PSYCHIC_SKILLS.PSYCHIC_BARRIER, rounds: 7 },
          grantEffectOnExpire: {
            id: PSYCHIC_EFFECT_BARRIER_BREAK_BUFF,
            name: "Sobrecarga Psíquica",
            element: "psychic",
            remainingRounds: 2,
            outgoingDamageMultiplier: 1.05,
            incomingDamageTakenMultiplier: 0.95,
            damageFlatBonusPerStack: 0,
          },
        });

        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🛡️ <@${actorId}> ergueu Barreira Psíquica.`,
        };
      },
      onHit({ attacker }) {
        const barrier = (ensureElementalState(attacker).effects || []).find((entry) => entry.id === PSYCHIC_EFFECT_BARRIER);
        if (!barrier || Number(barrier.shieldCurrentHp || 0) <= 0) return null;
        const stacks = Math.max(0, Number(barrier.psychicEnergyStacks || 0));
        const efficiency = getElementalEfficiencyMultiplier(attacker);
        const flat = Math.round(5 * stacks);
        const bonus = Math.round((Number(attacker?.stats?.magic || 0) * 0.05 * efficiency) + flat);
        barrier.shieldCurrentHp = Math.min(Number(barrier.shieldMaxHp || 0), Number(barrier.shieldCurrentHp || 0) + Math.round(Number(barrier.shieldMaxHp || 0) * 0.15));
        return {
          extraDamageFlat: bonus,
          battleLog: `🧠 Energia Psíquica reforçou o on-hit (+${bonus}).`,
        };
      },
    },
  ],
  hooks: {
    [BATTLE_HOOK.END_OF_ROUND]: ({ battle }) => {
      const logs = [];
      for (const [userId, player] of Object.entries(battle.players || {})) {
        const barrier = (ensureElementalState(player).effects || []).find((entry) => entry.id === PSYCHIC_EFFECT_BARRIER);
        if (!barrier || Number(barrier.shieldCurrentHp || 0) <= 0) continue;
        barrier.psychicEnergyStacks = Math.max(0, Number(barrier.psychicEnergyStacks || 0) + 1);
        const missing = Math.max(0, Number(barrier.shieldMaxHp || 0) - Number(barrier.shieldCurrentHp || 0));
        const regen = Math.round(missing * 0.1);
        barrier.shieldCurrentHp = Math.min(Number(barrier.shieldMaxHp || 0), Number(barrier.shieldCurrentHp || 0) + regen);
        logs.push(`🧠 Barreira Psíquica de <@${userId}> acumulou energia (${barrier.psychicEnergyStacks}).`);
      }
      return logs;
    },
  },
};

registerElementalRules("psychic", psychicRules);

module.exports = {
  PSYCHIC_SKILLS,
  PSYCHIC_EFFECT_MARK,
  PSYCHIC_EFFECT_READ_STATE,
  PSYCHIC_EFFECT_RECHARGE,
  PSYCHIC_EFFECT_BARRIER,
  PSYCHIC_EFFECT_BARRIER_BREAK_BUFF,
  getReadState,
  clearReadState,
  psychicRules,
};
