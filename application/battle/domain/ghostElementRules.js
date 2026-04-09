const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  addOrRefreshEffect,
  ensureElementalState,
} = require("./elementalRules");
const { getOpponentId } = require("./battleState");
const { resolveSkillTargets, applyDamageToTargetRef } = require("./targetingEngine");
const { applyExecuteStacks } = require("./globalEffectRegistry");

const GHOST_SKILLS = {
  ETHEREAL_FORM: "ghost_ethereal_form",
  DARK_CURSE: "ghost_dark_curse",
  SHADOW_CALL: "ghost_shadow_call",
};

const GHOST_EFFECT_ETHEREAL = "ghost_ethereal_form_effect";
const GHOST_EFFECT_HAUNT = "ghost_haunt_effect";
const GHOST_EFFECT_CURSE = "ghost_dark_curse_mark";
const GHOST_EFFECT_POSSESSION_DRAIN = "ghost_possession_drain";
const GHOST_EFFECT_SHADOW_MARK = "ghost_shadow_mark";

function applyEtherealExit({ battle, actorId, actor, manualExit = false }) {
  const effect = (ensureElementalState(actor).effects || []).find((entry) => entry.id === GHOST_EFFECT_ETHEREAL);
  if (!effect) return null;
  const turnsStayed = Math.max(1, Number(effect.turnsStayed || 1));
  const opponentId = getOpponentId(battle, actorId);
  const opponent = battle.players?.[opponentId];
  if (!opponent) return null;

  const efficiency = getElementalEfficiencyMultiplier(actor);
  const damage = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * efficiency * (1 + (0.15 * turnsStayed))));
  opponent.battleHp.current = Math.max(0, Number(opponent?.battleHp?.current || 0) - damage);
  const pool = battle.metadata?.energyByUserId || {};
  if (pool[opponentId] != null) pool[opponentId] = Math.max(0, Math.floor(Number(pool[opponentId] || 0) * 0.5));

  addOrRefreshEffect(opponent, {
    id: GHOST_EFFECT_HAUNT,
    name: "Assombro",
    element: "ghost",
    remainingRounds: 2,
    outgoingDamageMultiplier: 0.85,
  });

  effect.remainingRounds = 0;
  return {
    damage,
    opponentId,
    battleLog: `👻 Forma Etérea ${manualExit ? "foi encerrada manualmente" : "expirou"} e causou ${damage} em <@${opponentId}> com Assombro.`,
  };
}

const ghostRules = {
  element: "ghost",
  activeSkillSlots: 3,
  skills: [
    {
      id: GHOST_SKILLS.ETHEREAL_FORM,
      name: "Forma Etérea",
      icon: "👻",
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ battle, actor, actorId }) {
        const active = (ensureElementalState(actor).effects || []).find((entry) => entry.id === GHOST_EFFECT_ETHEREAL);
        if (active) {
          const exit = applyEtherealExit({ battle, actorId, actor, manualExit: true });
          if (exit) {
            return { ok: true, consumedTurn: true, damageDealt: exit.damage, defenderId: exit.opponentId, battleLog: exit.battleLog };
          }
        }
        addOrRefreshEffect(actor, {
          id: GHOST_EFFECT_ETHEREAL,
          name: "Forma Etérea",
          element: "ghost",
          remainingRounds: 3,
          incomingDamageTakenMultiplier: 0.05,
          immuneToControlLightOrDisplacement: true,
          cannotAttack: true,
          hpDrainPctPerRound: 0.02,
          turnsStayed: 0,
          cooldownOnExpire: { skillId: GHOST_SKILLS.ETHEREAL_FORM, rounds: 8 },
        });
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `👻 <@${actorId}> entrou em Forma Etérea.`,
        };
      },
    },
    {
      id: GHOST_SKILLS.DARK_CURSE,
      name: "Maldição Sombria",
      icon: "🕯️",
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, defender, actorId, defenderId }) {
        addOrRefreshEffect(defender, {
          id: GHOST_EFFECT_CURSE,
          name: "Maldição Sombria",
          element: "ghost",
          sourceUserId: actorId,
          remainingRounds: 5,
          stacks: 0,
          sourceMagic: Number(actor?.stats?.magic || 1),
          sourceEfficiency: getElementalEfficiencyMultiplier(actor),
          neutralNonRemovable: true,
          isNegativeEffect: false,
          cooldownOnExpire: { skillId: GHOST_SKILLS.DARK_CURSE, rounds: 6 },
        });
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🕯️ Maldição Sombria marcou <@${defenderId}> por 5 rodadas.`,
        };
      },
    },
    {
      id: GHOST_SKILLS.SHADOW_CALL,
      name: "Chamado das Sombras",
      icon: "🌑",
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, actorId }) {
        actor.elementalState = actor.elementalState || { statuses: [], effects: [], skillCooldowns: {}, secondaryEntities: [] };
        actor.elementalState.secondaryEntities = actor.elementalState.secondaryEntities || [];
        const hp = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * 0.5));
        actor.elementalState.secondaryEntities.push({
          id: `ghost_shadow_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
          kind: "ghost_shadow",
          hpMax: hp,
          hpCurrent: hp,
          sourceUserId: actorId,
          magicSnapshot: Number(actor?.stats?.magic || 1),
          efficiencySnapshot: getElementalEfficiencyMultiplier(actor),
        });
        addOrRefreshEffect(actor, {
          id: "ghost_shadow_call_cd",
          name: "Chamado das Sombras (CD)",
          element: "ghost",
          remainingRounds: 1,
          cooldownOnExpire: { skillId: GHOST_SKILLS.SHADOW_CALL, rounds: 5 },
        });
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🌑 <@${actorId}> invocou uma Sombra.`,
        };
      },
    },
  ],
  hooks: {
    [BATTLE_HOOK.END_OF_ROUND]: ({ battle }) => {
      const logs = [];
      for (const [userId, player] of Object.entries(battle.players || {})) {
        const effects = ensureElementalState(player).effects || [];
        const et = effects.find((entry) => entry.id === GHOST_EFFECT_ETHEREAL);
        if (et) {
          et.turnsStayed = Math.max(0, Number(et.turnsStayed || 0) + 1);
          const drain = Math.max(1, Math.round(Number(player?.battleHp?.max || 0) * Number(et.hpDrainPctPerRound || 0)));
          player.battleHp.current = Math.max(0, Number(player?.battleHp?.current || 0) - drain);
          if (Number(et.remainingRounds || 0) <= 1) {
            const exit = applyEtherealExit({ battle, actorId: userId, actor: player, manualExit: false });
            if (exit?.battleLog) logs.push(exit.battleLog);
          }
        }

        const curse = effects.find((entry) => entry.id === GHOST_EFFECT_CURSE);
        if (curse) {
          curse.stacks = Math.max(0, Number(curse.stacks || 0) + 1);
          if (Number(curse.remainingRounds || 0) <= 1) {
            const hpLost = Math.max(0, Number(player?.battleHp?.max || 0) - Number(player?.battleHp?.current || 0));
            const ratio = Number(player?.battleHp?.current || 0) / Math.max(1, Number(player?.battleHp?.max || 1)) < 0.5 ? 0.05 : 0.03;
            const extra = Math.round(hpLost * ratio * Number(curse.stacks || 0));
            const base = Math.round(Number(curse.sourceMagic || 1) * 0.5 * Number(curse.sourceEfficiency || 1));
            const rawDamage = Math.max(0, base + extra);
            const damage = Math.min(rawDamage, Math.max(0, Number(player?.battleHp?.current || 0) - 1));
            player.battleHp.current = Math.max(1, Number(player?.battleHp?.current || 1) - damage);
            const source = battle.players?.[curse.sourceUserId];
            if (source) {
              source.battleHp.current = Math.min(Number(source?.battleHp?.max || 0), Number(source?.battleHp?.current || 0) + Math.round(damage * 0.5));
            }
            logs.push(`🕯️ Maldição Sombria explodiu em <@${userId}> por ${damage} (anti-execução ativa).`);
          }
        }

        const summons = player?.elementalState?.secondaryEntities || [];
        for (const summon of summons) {
          if (summon.kind !== "ghost_shadow" || Number(summon.hpCurrent || 0) <= 0) continue;
          const targets = resolveSkillTargets({
            battle,
            actorId: userId,
            targeting: { mode: "area", includeBench: true, allowSecondaryOutsideActive: true, includeSecondaryEntities: true },
          });
          if (!targets.length) continue;
          targets.sort((left, right) => {
            const leftPlayer = battle.players[left.userId];
            const rightPlayer = battle.players[right.userId];
            const leftDebuff = (ensureElementalState(leftPlayer).effects || []).some((entry) => Number(entry.remainingRounds ?? 1) > 0 && entry.outgoingDamageMultiplier != null);
            const rightDebuff = (ensureElementalState(rightPlayer).effects || []).some((entry) => Number(entry.remainingRounds ?? 1) > 0 && entry.outgoingDamageMultiplier != null);
            if (leftDebuff !== rightDebuff) return leftDebuff ? -1 : 1;
            return Number(left.currentHp || 0) - Number(right.currentHp || 0);
          });
          const targetRef = targets[0];
          const damage = Math.max(1, Math.round(Number(summon.magicSnapshot || 1) * 0.05 * Number(summon.efficiencySnapshot || 1)));
          const result = applyDamageToTargetRef(battle, targetRef, damage);
          const targetPlayer = battle.players[targetRef.userId];
          const targetEffects = ensureElementalState(targetPlayer).effects || [];
          const mark = targetEffects.find((entry) => entry.id === GHOST_EFFECT_SHADOW_MARK && entry.sourceUserId === userId);
          const hasDebuff = targetEffects.some((entry) => Number(entry.remainingRounds ?? 1) > 0 && entry.outgoingDamageMultiplier != null);
          const addStacks = hasDebuff ? 2 : 1;
          const nextStacks = Math.min(20, Math.max(0, Number(mark?.stacks || 0) + addStacks));
          addOrRefreshEffect(targetPlayer, {
            id: GHOST_EFFECT_SHADOW_MARK,
            name: "Marca Sombria",
            element: "ghost",
            sourceUserId: userId,
            remainingRounds: 4,
            stacks: nextStacks,
            incomingDamageTakenMultiplier: 1 + 0.1 + (0.02 * nextStacks),
            executePerStackPct: 0.01,
          });
          applyExecuteStacks(targetPlayer, {
            stacks: addStacks,
            maxStacks: 20,
            baseThresholdPct: 0,
            stackThresholdPct: 0.01,
          });
          logs.push(`🌑 Sombra atacou <@${targetRef.userId}> por ${result.damageApplied} e aplicou Marca Sombria (+${addStacks} stack).`);
        }
      }
      return logs;
    },
  },
};

registerElementalRules("ghost", ghostRules);

module.exports = {
  GHOST_SKILLS,
  GHOST_EFFECT_ETHEREAL,
  GHOST_EFFECT_CURSE,
  GHOST_EFFECT_POSSESSION_DRAIN,
  GHOST_EFFECT_SHADOW_MARK,
  ghostRules,
};
