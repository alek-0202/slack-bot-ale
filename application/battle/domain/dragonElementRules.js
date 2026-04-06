const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  ensureElementalState,
  getStatus,
  upsertStatus,
  addOrRefreshEffect,
  setSkillCooldown,
} = require("./elementalRules");
const { resolveElementalDamageRule } = require("./elementalRules");

const DRAGON_SKILLS = {
  DRACONIC_IMPETUS: "dragon_draconic_impetus",
  ANCESTRAL_BREATH: "dragon_ancestral_breath",
  ANCESTRAL_PRESENCE: "dragon_ancestral_presence",
};

const DRAGON_IMPETUS_STATUS_ID = "dragon_impetus_stack";
const DRAGON_IMPETUS_EFFECT_ID = "dragon_impetus_state";
const DRAGON_EXHAUSTION_EFFECT_ID = "exhaustion";
const DRAGON_RUPTURE_EFFECT_ID = "dragonic_rupture";
const DRAGON_ANCESTRAL_PRESENCE_EFFECT_ID = "ancestral_presence";
const DRAGON_ANCESTRAL_PRESENCE_ENEMY_EFFECT_ID = "ancestral_presence_enemy_aura";
const DRAGON_ANCESTRAL_BREATH_RECAST_EFFECT_ID = "dragon_ancestral_breath_recast";

const IMPETUS_MAX_STACKS = 3;
const IMPETUS_ROUNDS = 2;

function getImpetusStatus(actor) {
  return getStatus(actor, DRAGON_IMPETUS_STATUS_ID);
}

function getImpetusStacks(actor) {
  return Math.max(0, Number(getImpetusStatus(actor)?.stacks || 0));
}

function syncImpetusState(actor) {
  const stacks = getImpetusStacks(actor);
  const effects = ensureElementalState(actor).effects || [];
  const effect = effects.find((entry) => entry.id === DRAGON_IMPETUS_EFFECT_ID);
  if (stacks <= 0) {
    if (effect) effect.remainingRounds = 0;
    return;
  }

  addOrRefreshEffect(actor, {
    id: DRAGON_IMPETUS_EFFECT_ID,
    name: "Ímpeto Dracônico",
    element: "dragon",
    remainingRounds: IMPETUS_ROUNDS,
    stacks,
    outgoingAttackDamageMultiplier: 1 + (0.05 * stacks),
    outgoingMagicDamageMultiplier: 1 + (0.12 * stacks),
    elementalEfficiencyBonusPct: 8 * stacks,
    energyRegenMultiplier: stacks >= IMPETUS_MAX_STACKS ? 1.2 : 1,
  });
}

function gainImpetusStack({ actor, actorId, logs = [] }) {
  const current = getImpetusStatus(actor);
  const nextStacks = Math.min(IMPETUS_MAX_STACKS, Math.max(1, Number(current?.stacks || 0) + 1));
  upsertStatus(actor, {
    id: DRAGON_IMPETUS_STATUS_ID,
    name: "Ímpeto",
    element: "dragon",
    stacks: nextStacks,
    maxStacks: IMPETUS_MAX_STACKS,
    remainingRounds: IMPETUS_ROUNDS,
  });
  syncImpetusState(actor);

  logs.push(nextStacks >= IMPETUS_MAX_STACKS
    ? `🐉 Característica: Ímpeto no máximo [${nextStacks}/${IMPETUS_MAX_STACKS}] em <@${actorId}>.`
    : `🐉 Característica: Ímpeto +1 [${nextStacks}/${IMPETUS_MAX_STACKS}] em <@${actorId}>.`);
}

function consumeImpetusStacks({ actor, actorId, logs = [] }) {
  const stacks = getImpetusStacks(actor);
  if (stacks <= 0) return 0;
  upsertStatus(actor, {
    id: DRAGON_IMPETUS_STATUS_ID,
    name: "Ímpeto",
    element: "dragon",
    stacks: 0,
    maxStacks: IMPETUS_MAX_STACKS,
    remainingRounds: 0,
  });
  syncImpetusState(actor);
  logs.push(`🐉 Característica: Ímpeto consumido na reativação de <@${actorId}>.`);
  return stacks;
}

function clearImpetusByControl({ actor, actorId, logs = [] }) {
  const stacks = getImpetusStacks(actor);
  if (stacks <= 0) return false;
  upsertStatus(actor, {
    id: DRAGON_IMPETUS_STATUS_ID,
    name: "Ímpeto",
    element: "dragon",
    stacks: 0,
    maxStacks: IMPETUS_MAX_STACKS,
    remainingRounds: 0,
  });
  syncImpetusState(actor);
  logs.push(`🐉 Passiva/Característica: Ímpeto removido por controle de grupo em <@${actorId}>.`);
  return true;
}

function getRecastState(actor) {
  return (ensureElementalState(actor).effects || []).find((entry) => entry.id === DRAGON_ANCESTRAL_BREATH_RECAST_EFFECT_ID && Number(entry.remainingRounds ?? 0) > 0) || null;
}

function canUseAncestralBreathRecast(actor) {
  const recast = getRecastState(actor);
  return Boolean(recast && getImpetusStacks(actor) > 0);
}

const dragonRules = {
  element: "dragon",
  activeSkillSlots: 3,
  skills: [
    {
      id: DRAGON_SKILLS.DRACONIC_IMPETUS,
      name: "Ímpeto Dracônico",
      description: "Passiva: acertos acumulam stacks (até 3).",
      icon: "🐉",
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, actorId }) {
        addOrRefreshEffect(actor, {
          id: "dragon_impetus_unlock",
          name: "Ímpeto Dracônico (Passiva)",
          element: "dragon",
          remainingRounds: null,
          passiveEnabled: true,
        });
        return {
          ok: true,
          consumedTurn: true,
          battleLog: `🐉 <@${actorId}> habilitou *Ímpeto Dracônico* (passiva ativa).`,
        };
      },
    },
    {
      id: DRAGON_SKILLS.ANCESTRAL_BREATH,
      name: "Sopro Ancestral",
      description: "95% MAG (+5% por stack de Ímpeto) + eficiência. Com 3 stacks: Exaustão e Ruptura Dracônica.",
      icon: "🫧",
      cooldownRounds: 6,
      extraEnergyCost: 100,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, defender, actorId, defenderId }) {
        const recast = getRecastState(actor);
        const impetusStacks = getImpetusStacks(actor);

        if (recast && impetusStacks > 0) {
          const baseTrueDamage = Math.max(1, Math.round(100 + (Number(actor?.stats?.magic || 1) * 0.5)));
          consumeImpetusStacks({ actor, actorId, logs: [] });
          recast.remainingRounds = 0;
          setSkillCooldown(actor, DRAGON_SKILLS.ANCESTRAL_BREATH, 6);
          defender.battleHp.current = Math.max(0, Number(defender?.battleHp?.current || 0) - baseTrueDamage);
          return {
            ok: true,
            consumedTurn: true,
            damageType: "true",
            damageDealt: baseTrueDamage,
            defenderId,
            defenderRemainingHp: defender.battleHp.current,
            battleLog: [
              `🐉 Característica: Sopro Ancestral reativado — ${baseTrueDamage} de dano verdadeiro em <@${defenderId}>.`,
              `🐉 Característica: Ímpeto consumido na reativação.`,
            ],
          };
        }

        const baseMagic = Math.max(1, Number(actor?.stats?.magic || actor?.stats?.attack || 1));
        const scale = 0.95 + (0.05 * impetusStacks);
        const efficiency = getElementalEfficiencyMultiplier(actor);
        const damageDealt = Math.max(1, Math.round(baseMagic * scale * efficiency));

        addOrRefreshEffect(actor, {
          id: DRAGON_ANCESTRAL_BREATH_RECAST_EFFECT_ID,
          name: "Sopro Ancestral (Reativação)",
          element: "dragon",
          remainingRounds: 2,
          chargesRemaining: 1,
          sourceSkillId: DRAGON_SKILLS.ANCESTRAL_BREATH,
        });
        setSkillCooldown(actor, DRAGON_SKILLS.ANCESTRAL_BREATH, 6);

        const logs = [`🐉 Característica: Sopro Ancestral causou ${damageDealt} de dano em <@${defenderId}>.`];

        if (impetusStacks >= IMPETUS_MAX_STACKS) {
          addOrRefreshEffect(defender, {
            id: DRAGON_EXHAUSTION_EFFECT_ID,
            name: "Exaustão",
            element: "dragon",
            sourceUserId: actorId,
            remainingRounds: 2,
            energyRegenMultiplier: 0.65,
          });
          addOrRefreshEffect(defender, {
            id: DRAGON_RUPTURE_EFFECT_ID,
            name: "Ruptura Dracônica",
            element: "dragon",
            sourceUserId: actorId,
            remainingRounds: 2,
            incomingSkillDamageTakenMultiplier: 1.2,
          });
          logs.push("🐉 Característica: Exaustão aplicada [-35% geração de energia].");
          logs.push("🐉 Característica: Ruptura Dracônica aplicada [+20% dano de habilidades].");
        }

        return {
          ok: true,
          consumedTurn: true,
          damageDealt,
          baseDamage: damageDealt,
          defenderId,
          battleLog: logs,
        };
      },
    },
    {
      id: DRAGON_SKILLS.ANCESTRAL_PRESENCE,
      name: "Presença Ancestral",
      description: "Aura de 3 turnos: reduz iniciativa/dano inimigo, fortalece resistência e gera burn ancestral de fogo.",
      icon: "👁️",
      cooldownRounds: 6,
      hooks: [BATTLE_HOOK.ON_CAST],
      cast({ actor, actorId }) {
        const stacks = getImpetusStacks(actor);
        addOrRefreshEffect(actor, {
          id: DRAGON_ANCESTRAL_PRESENCE_EFFECT_ID,
          name: "Presença Ancestral",
          element: "dragon",
          remainingRounds: 3,
          incomingDamageTakenMultiplier: Math.max(0.2, 1 - (0.15 + (0.05 * stacks))),
          healingReceivedMultiplier: 1.05,
        });
        setSkillCooldown(actor, DRAGON_SKILLS.ANCESTRAL_PRESENCE, 6);
        return {
          ok: true,
          consumedTurn: true,
          battleLog: [
            `🐉 Característica: Presença Ancestral ativada por 3 turnos em <@${actorId}>.`,
            "🐉 Característica: Inimigos afetados [-25% iniciativa, -15% dano].",
            `🐉 Característica: Resistência aumentada em ${Math.round((0.15 + (0.05 * stacks)) * 100)}% e +5% cura.`,
          ],
        };
      },
    },
  ],
  hooks: {
    [BATTLE_HOOK.END_OF_ROUND]: ({ battle }) => {
      const logs = [];
      const userIds = Object.keys(battle.players || {});
      for (const actorId of userIds) {
        const actor = battle.players?.[actorId];
        if (!actor) continue;
        const aura = (ensureElementalState(actor).effects || []).find((effect) => effect.id === DRAGON_ANCESTRAL_PRESENCE_EFFECT_ID && Number(effect.remainingRounds || 0) > 0);
        if (!aura) continue;

        const stacks = getImpetusStacks(actor);
        aura.incomingDamageTakenMultiplier = Math.max(0.2, 1 - (0.15 + (0.05 * stacks)));

        for (const enemyId of userIds.filter((entry) => entry !== actorId)) {
          const enemy = battle.players?.[enemyId];
          if (!enemy || Number(enemy?.battleHp?.current || 0) <= 0) continue;

          addOrRefreshEffect(enemy, {
            id: `${DRAGON_ANCESTRAL_PRESENCE_ENEMY_EFFECT_ID}_${actorId}`,
            name: "Presença Ancestral (Opressão)",
            element: "dragon",
            sourceUserId: actorId,
            remainingRounds: 1,
            speedMultiplier: 0.75,
            outgoingDamageMultiplier: 0.85,
          });

          const fireRelation = resolveElementalDamageRule({
            attackElement: "fire",
            defenderElements: enemy?.selectedPokemon?.elementTypes || [],
          });
          const burnDamage = Math.max(1, Math.round(Number(actor?.stats?.magic || 1) * 0.1 * getElementalEfficiencyMultiplier(actor) * Number(fireRelation.multiplier || 1)));
          enemy.battleHp.current = Math.max(0, Number(enemy?.battleHp?.current || 0) - burnDamage);
          logs.push(`🔥 Característica: Burn ancestral causou ${burnDamage} de dano de fogo em <@${enemyId}>.`);
        }

        if (stacks >= IMPETUS_MAX_STACKS) {
          const cooldowns = ensureElementalState(actor).skillCooldowns || {};
          const reduced = [];
          for (const skillId of Object.keys(cooldowns)) {
            const current = Math.max(0, Number(cooldowns[skillId] || 0));
            const next = Math.max(0, current - 1);
            if (next !== current) {
              cooldowns[skillId] = next;
              reduced.push(skillId);
            }
          }
          if (reduced.length) {
            logs.push(`🐉 Característica: Presença Ancestral reduziu 1 round extra (${reduced.join(", ")}).`);
          }
        }
      }

      return logs;
    },
  },
};

registerElementalRules("dragon", dragonRules);

module.exports = {
  DRAGON_SKILLS,
  DRAGON_IMPETUS_STATUS_ID,
  DRAGON_IMPETUS_EFFECT_ID,
  DRAGON_EXHAUSTION_EFFECT_ID,
  DRAGON_RUPTURE_EFFECT_ID,
  DRAGON_ANCESTRAL_PRESENCE_EFFECT_ID,
  DRAGON_ANCESTRAL_BREATH_RECAST_EFFECT_ID,
  IMPETUS_MAX_STACKS,
  getImpetusStacks,
  gainImpetusStack,
  clearImpetusByControl,
  consumeImpetusStacks,
  canUseAncestralBreathRecast,
  dragonRules,
};
