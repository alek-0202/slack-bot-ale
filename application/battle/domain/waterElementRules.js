const {
  BATTLE_HOOK,
  registerElementalRules,
  getElementalEfficiencyMultiplier,
  addOrRefreshEffect,
  setSkillCooldown,
  ensureElementalState,
} = require("./elementalRules");

const WATER_SKILLS = {
  ABYSSAL_TIDE: "water_abyssal_tide",
  LIFE_ENERGY: "water_life_energy",
  OCEAN_DEPTHS: "water_ocean_depths",
};

const WATER_DEBUFF_ABYSSAL_TIDE = "water_abyssal_tide_debuff";
const WATER_BUFF_LIFE_ENERGY = "water_life_energy_buff";

function isWaterNature(playerState) {
  return (playerState?.selectedPokemon?.elementTypes || []).map((entry) => String(entry || "").toLowerCase()).includes("water");
}

const waterRules = {
  element: "water",
  activeSkillSlots: 3,
  skills: [
    {
      id: WATER_SKILLS.ABYSSAL_TIDE,
      name: "Maré Abissal",
      icon: "🌊",
      extraEnergyCost: 50,
      cast({ defender, defenderId, elementalRelation }) {
        const baseDamage = 200;
        const damageDealt = Math.max(0, Math.round(baseDamage * (elementalRelation?.multiplier || 1)));
        defender.battleHp.current = Math.max(0, Number(defender.battleHp.current || 0) - damageDealt);

        addOrRefreshEffect(defender, {
          id: WATER_DEBUFF_ABYSSAL_TIDE,
          name: "Maré Abissal",
          remainingRounds: 2,
          outgoingDamageMultiplier: 0.65,
          cooldownOnExpire: { skillId: WATER_SKILLS.ABYSSAL_TIDE, rounds: 5 },
        });

        return {
          ok: true,
          consumedTurn: true,
          damageDealt,
          defenderId,
          defenderRemainingHp: defender.battleHp.current,
          battleLog: `🌊 Maré Abissal causou ${damageDealt} e aplicou redução de dano de 35% por 2 rodadas.`,
        };
      },
    },
    {
      id: WATER_SKILLS.LIFE_ENERGY,
      name: "Energia Vital",
      icon: "💧",
      extraEnergyCost: 50,
      cast({ battle, actor, actorId, targetId }) {
        const resolvedTargetId = targetId || actorId;
        const target = battle.players?.[resolvedTargetId];
        if (!target) return { ok: false, reason: "invalid_target" };
        if (!isWaterNature(target)) return { ok: false, reason: "target_not_water_nature" };

        addOrRefreshEffect(target, {
          id: WATER_BUFF_LIFE_ENERGY,
          name: "Energia Vital",
          remainingRounds: 4,
          outgoingWaterDamageMultiplier: 1.5,
          cooldownOnExpire: { skillId: WATER_SKILLS.LIFE_ENERGY, rounds: 7 },
        });

        return {
          ok: true,
          consumedTurn: true,
          battleLog: `💧 Energia Vital ativada em <@${resolvedTargetId}>: +50% de dano de água por 4 rodadas.`,
        };
      },
    },
    {
      id: WATER_SKILLS.OCEAN_DEPTHS,
      name: "Profundezas do Oceano",
      icon: "🌀",
      extraEnergyCost: 150,
      cooldownRounds: 6,
      cast({ actor, defender, defenderId }) {
        const damageDealt = 2500;
        defender.battleHp.current = Math.max(0, Number(defender.battleHp.current || 0) - damageDealt);
        setSkillCooldown(actor, WATER_SKILLS.OCEAN_DEPTHS, 6);

        const killed = Number(defender.battleHp.current || 0) <= 0;
        return {
          ok: true,
          consumedTurn: true,
          damageType: "true",
          damageDealt,
          defenderId,
          defenderRemainingHp: defender.battleHp.current,
          killed,
          energyRestoreOnKill: killed ? 100 : 0,
          cooldownReductionOnKill: killed ? 3 : 0,
          battleLog: killed
            ? `🌀 Profundezas do Oceano abateu o alvo e ativou bônus de energia/cooldown.`
            : `🌀 Profundezas do Oceano causou dano verdadeiro massivo.`,
        };
      },
    },
  ],
  hooks: {
    [BATTLE_HOOK.END_OF_ROUND]: ({ battle }) => {
      const logs = [];
      for (const [userId, player] of Object.entries(battle.players || {})) {
        const effects = ensureElementalState(player).effects || [];
        if (effects.some((entry) => entry.id === WATER_DEBUFF_ABYSSAL_TIDE)) {
          logs.push(`🌊 <@${userId}> permanece sob Maré Abissal.`);
        }
        if (effects.some((entry) => entry.id === WATER_BUFF_LIFE_ENERGY)) {
          logs.push(`💧 <@${userId}> mantém Energia Vital ativa.`);
        }
      }
      return logs;
    },
  },
};

registerElementalRules("water", waterRules);

module.exports = {
  WATER_SKILLS,
  WATER_DEBUFF_ABYSSAL_TIDE,
  WATER_BUFF_LIFE_ENERGY,
  waterRules,
};
