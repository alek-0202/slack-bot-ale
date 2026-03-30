const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  addOrRefreshEffect,
  getStatus,
  upsertStatus,
  setSkillCooldown,
  ensureElementalState,
} = require("./elementalRules");

const GRASS_SKILLS = {
  NATURAL_GROWTH: "grass_natural_growth",
  SUFFOCATING_ROOTS: "grass_suffocating_roots",
  FOREST_THORN: "grass_forest_thorn",
};

const GRASS_STATUS_ROOT = "grass_root";
const GRASS_EFFECT_NATURAL_GROWTH = "grass_natural_growth_effect";
const GRASS_EFFECT_SUFFOCATING_ROOTS = "grass_suffocating_roots_effect";
const GRASS_EFFECT_FOREST_THORN = "grass_forest_thorn_effect";
const GRASS_EFFECT_TAUNT = "grass_taunt_forced_attack";
const GRASS_EFFECT_SHORT_CUT = "grass_short_cut";
const GRASS_EFFECT_SLOWNESS = "grass_slowness";

function hasActiveGrassEffect(player) {
  const state = ensureElementalState(player);
  const effects = (state.effects || []).some((effect) => Number(effect?.remainingRounds ?? 1) > 0 && effect?.element === "grass");
  const statuses = (state.statuses || []).some((status) => Number(status?.remainingRounds ?? 1) > 0 && effectElement(status) === "grass");
  return effects || statuses;
}

function effectElement(entry) {
  return String(entry?.element || "").toLowerCase();
}

function hasControlImmunity(player) {
  const effects = ensureElementalState(player).effects || [];
  return effects.some((effect) => Number(effect?.remainingRounds ?? 1) > 0 && effect?.immuneToControlLightOrDisplacement === true);
}

function upsertRootStatus(player) {
  const current = getStatus(player, GRASS_STATUS_ROOT);
  const nextStacks = Math.min(3, Math.max(1, Number(current?.stacks || 0) + 1));
  return upsertStatus(player, {
    id: GRASS_STATUS_ROOT,
    name: "Raiz",
    element: "grass",
    stacks: nextStacks,
    maxStacks: 3,
    remainingRounds: 3,
  });
}

function ensureRootImmunityEffect(player, stacks) {
  if (Number(stacks || 0) < 3) return;
  addOrRefreshEffect(player, {
    id: "grass_root_control_immunity",
    name: "Raiz Profunda",
    element: "grass",
    remainingRounds: 3,
    immuneToControlLightOrDisplacement: true,
  });
}

const grassRules = {
  element: "grass",
  activeSkillSlots: 3,
  skills: [
    {
      id: GRASS_SKILLS.NATURAL_GROWTH,
      name: "Crescimento Natural",
      icon: "🌿",
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, actorId }) {
        addOrRefreshEffect(actor, {
          id: GRASS_EFFECT_NATURAL_GROWTH,
          name: "Crescimento Natural",
          element: "grass",
          remainingRounds: 3,
          outgoingDamageMultiplier: 1.25,
          speedMultiplier: 0.8,
          healPerRoundPctMaxHp: 0.1,
          cooldownOnExpire: { skillId: GRASS_SKILLS.NATURAL_GROWTH, rounds: 5 },
        });

        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🌿 <@${actorId}> ativou *Crescimento Natural* por 3 rodadas (+25% eficiência, -20% velocidade).`,
        };
      },
    },
    {
      id: GRASS_SKILLS.SUFFOCATING_ROOTS,
      name: "Raízes Sufocantes",
      icon: "🌱",
      cooldownRounds: 6,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ battle, actor, defender, actorId, defenderId }) {
        const sourceMagic = Math.max(1, Number(actor?.stats?.magic || actor?.stats?.attack || 1));
        const efficiencyMultiplier = getElementalEfficiencyMultiplier(actor);
        const damagePerRound = Math.max(1, Math.round(sourceMagic * 0.25 * efficiencyMultiplier));
        const extraRound = hasActiveGrassEffect(defender) ? 1 : 0;
        const remainingRounds = 3 + extraRound;

        addOrRefreshEffect(defender, {
          id: GRASS_EFFECT_SUFFOCATING_ROOTS,
          name: "Raízes Sufocantes",
          element: "grass",
          sourceUserId: actorId,
          remainingRounds,
          speedMultiplier: 0.7,
          dotDamagePerRound: damagePerRound,
          drainHealRatio: 0.5,
          mobilityPunishDamagePctMaxHp: 0.2,
          mobilityPunishMode: "on_attempt",
          tags: ["grass", "control_light", "displacement"],
        });

        setSkillCooldown(actor, GRASS_SKILLS.SUFFOCATING_ROOTS, 6);

        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🌱 Raízes Sufocantes enraizou <@${defenderId}> por ${remainingRounds} rodadas (DOT + drenagem).`,
        };
      },
    },
    {
      id: GRASS_SKILLS.FOREST_THORN,
      name: "Espinho da Floresta",
      icon: "🌲",
      cooldownRounds: 5,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, defender, actorId, defenderId }) {
        addOrRefreshEffect(actor, {
          id: GRASS_EFFECT_FOREST_THORN,
          name: "Espinho da Floresta",
          element: "grass",
          remainingRounds: 2,
          reflectOnCommonAttack: {
            normalReflectPct: 0.15,
            lowHpReflectPct: 0.22,
            lowHpThreshold: 0.3,
            normalSlowChance: 0.2,
            lowHpSlowChance: 0.35,
          },
        });

        if (!hasControlImmunity(defender)) {
          addOrRefreshEffect(defender, {
            id: `${GRASS_EFFECT_TAUNT}_${actorId}`,
            name: "Provocação Espinhosa",
            element: "grass",
            sourceUserId: actorId,
            forcedAction: "attack",
            controlLight: true,
            remainingRounds: 2,
          });
        }

        setSkillCooldown(actor, GRASS_SKILLS.FOREST_THORN, 5);

        return {
          ok: true,
          consumedTurn: true,
          battleLog: hasControlImmunity(defender)
            ? `🌲 Espinho da Floresta ativado em <@${actorId}>. O alvo resistiu ao Taunt por imunidade de controle leve.`
            : `🌲 Espinho da Floresta ativado: <@${defenderId}> foi provocado para atacar no próximo turno.`,
        };
      },
    },
  ],
  hooks: {
    [BATTLE_HOOK.BEFORE_DAMAGE]: ({ defender }) => {
      const root = getStatus(defender, GRASS_STATUS_ROOT);
      if (!root) return null;
      const stacks = Math.max(0, Number(root.stacks || 0));
      if (!stacks) return null;
      return {
        damageMultiplier: Math.max(0, 1 - (0.05 * stacks)),
        battleLog: `🌿 Raiz reduziu ${Math.round(stacks * 5)}% do dano recebido.`,
      };
    },
    [BATTLE_HOOK.END_OF_ROUND]: ({ battle }) => {
      const logs = [];
      for (const [userId, player] of Object.entries(battle.players || {})) {
        const effects = ensureElementalState(player).effects || [];
        const growth = effects.find((effect) => effect.id === GRASS_EFFECT_NATURAL_GROWTH);
        if (growth) {
          const healValue = Math.max(1, Math.round(Number(player?.battleHp?.max || 0) * Number(growth.healPerRoundPctMaxHp || 0)));
          const before = Number(player?.battleHp?.current || 0);
          player.battleHp.current = Math.min(Number(player?.battleHp?.max || 0), before + healValue);
          const healed = Math.max(0, player.battleHp.current - before);
          const root = upsertRootStatus(player);
          ensureRootImmunityEffect(player, root.stacks);
          logs.push(`🌿 Crescimento Natural curou ${healed} em <@${userId}> e aplicou Raiz (${root.stacks}/3).`);
        }

        const suffocatingRoots = effects.find((effect) => effect.id === GRASS_EFFECT_SUFFOCATING_ROOTS);
        if (suffocatingRoots) {
          const damage = Math.max(0, Number(suffocatingRoots.dotDamagePerRound || 0));
          if (damage > 0) {
            player.battleHp.current = Math.max(0, Number(player?.battleHp?.current || 0) - damage);
          }
          const sourceUserId = suffocatingRoots.sourceUserId;
          if (sourceUserId && battle.players?.[sourceUserId] && damage > 0) {
            const healer = battle.players[sourceUserId];
            const drain = Math.max(0, Math.round(damage * Number(suffocatingRoots.drainHealRatio || 0)));
            healer.battleHp.current = Math.min(Number(healer?.battleHp?.max || 0), Number(healer?.battleHp?.current || 0) + drain);
            logs.push(`🌱 Raízes Sufocantes causou ${damage} em <@${userId}> e drenou ${drain} para <@${sourceUserId}>.`);
          } else {
            logs.push(`🌱 Raízes Sufocantes causou ${damage} em <@${userId}>.`);
          }
        }
      }
      return logs;
    },
  },
};

registerElementalRules("grass", grassRules);

module.exports = {
  GRASS_SKILLS,
  GRASS_STATUS_ROOT,
  GRASS_EFFECT_SUFFOCATING_ROOTS,
  GRASS_EFFECT_FOREST_THORN,
  GRASS_EFFECT_SHORT_CUT,
  GRASS_EFFECT_SLOWNESS,
  grassRules,
};
