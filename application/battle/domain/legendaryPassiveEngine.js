const { ensureElementalState, addOrRefreshEffect } = require('./elementalRules');
const { GLOBAL_EFFECT_IDS, applyExecuteStacks, getExecuteStatus, tryExecuteTarget } = require('./globalEffectRegistry');

const EXECUTE_STATUS_ID = GLOBAL_EFFECT_IDS.EXECUTE;
const LEGENDARY_PREFIX = 'Passiva Lendária:';
const EGG_MAX_TURNS = 6;
const ULTIMO_SUSPIRO_REVIVE_PCT_PER_ROUND = 8;
const PASSIVE_DETAILS_BY_ID = Object.freeze({
  retalia_primordial: 'Armazena parte do dano recebido e libera no próximo ataque como retaliação.',
  eco_arcano: 'Ao usar magia, pode repetir automaticamente o golpe com porcentagem do dano original.',
  dominio_elemental: 'Quando acerta super efetivo, converte parte do dano em cura.',
  paradoxo_temporal: 'Após intervalo de turnos, repete automaticamente a última magia registrada.',
  sangue_adaptativo: 'Receber dano elemental acumula resistência contra aquele mesmo elemento.',
  fissura_caos: 'Ataques podem aplicar um status aleatório adicional no alvo.',
  espirito_sobrevivencia: 'Ao entrar em vida baixa, aumenta a vida máxima e troca parte do dano por resistência.',
  vinculo_ruina: 'Parte do dano físico é transferida para alvo secundário ou convertida em dano verdadeiro.',
  blindagem_reativa: 'Ao receber dano, gera escudo temporário com cooldown interno.',
  colapso_elemental: 'Golpes super efetivos aplicam stacks de Execute no alvo.',
  ascensao_crescente: 'Cada magia aumenta ataque, magia e defesa até o limite da passiva.',
  ruptura_realidade: 'Aumenta o dano final ignorando parte efetiva da defesa do alvo.',
  essencia_vampirica: 'Magias convertem parte do dano em cura e roubo de energia.',
  reflexo_dimensional: 'Pode invocar mímico temporário que causa dano automático por turno.',
  catalisador_instavel: 'Debuffs aplicados podem ativar burn adicional com dano verdadeiro.',
  sobreposicao_elemental: 'Tem chance de adicionar dano extra do elemento principal.',
  regencia_absoluta: 'Pode conceder buffs aleatórios de combate durante a luta.',
  marca_juizo: 'Acumula marcas e, ao atingir o limite, explode com dano baseado na vida máxima do alvo.',
  ultimo_suspiro: 'Ao morrer, vira ovo temporário e pode renascer se sobreviver rodadas suficientes.',
});

function getPassiveRuntime(player) {
  if (!player) return null;
  player.legendaryRuntime = player.legendaryRuntime || {};
  return player.legendaryRuntime;
}

function getLegendaryPassive(player) {
  return player?.selectedPokemon?.legendaryPassive || null;
}

function passiveId(player) {
  return getLegendaryPassive(player)?.passiveId || null;
}

function pct(value) {
  return Math.max(0, Number(value || 0)) / 100;
}

function addLog(ctx, text) {
  if (!text) return;
  ctx.logs.push(text);
}

function getPassiveDetailsText(player) {
  const passive = getLegendaryPassive(player);
  if (!passive?.passiveId) return null;
  return PASSIVE_DETAILS_BY_ID[passive.passiveId] || null;
}

function formatLegendaryPassiveLine(detail) {
  if (!detail) return LEGENDARY_PREFIX;
  return `${LEGENDARY_PREFIX} ${detail}`;
}

function pushPassiveLog(logs, { passiveId: eventPassiveId = null, label, detail = null, effectType = null }) {
  if (!Array.isArray(logs) || !detail) return;
  const message = formatLegendaryPassiveLine(detail);
  logs.push({
    kind: 'legendary_passive',
    passiveId: eventPassiveId,
    effectType,
    label: label || null,
    detail,
    message,
  });
}

function ensureExecuteStatus(defender) {
  return getExecuteStatus(defender);
}

function checkExecuteThreshold(defender) {
  return tryExecuteTarget(defender);
}

function onBattleStart({ battle }) {
  for (const player of Object.values(battle.players || {})) {
    const runtime = getPassiveRuntime(player);
    runtime.turnCounter = 0;
    runtime.lastMagic = null;
    runtime.retaliationStored = 0;
    runtime.blindagemCd = 0;
    runtime.regenciaBuffs = [];
    runtime.paradoxoCounter = 0;
    runtime.mimicTurns = 0;
    runtime.sangueStacks = 0;
    runtime.sangueElement = null;
    runtime.ascensaoBonusPct = 0;
    runtime.ultimoSuspiroCd = 0;
    runtime.eggTurns = 0;
  }
}

function onTurnStart({ battle, actorId, logs = [] }) {
  const player = battle.players?.[actorId];
  const opponentId = actorId === battle.challengerId ? battle.challengedId : battle.challengerId;
  const opponent = battle.players?.[opponentId];
  const passive = getLegendaryPassive(player);
  if (!passive) return logs;
  const runtime = getPassiveRuntime(player);
  runtime.turnCounter = Number(runtime.turnCounter || 0) + 1;
  const passiveDetails = getPassiveDetailsText(player);
  if (passiveDetails) {
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'details',
      detail: passiveDetails,
    });
  }

  if (runtime.blindagemCd > 0) {
    runtime.blindagemCd -= 1;
    if (passive.passiveId === 'blindagem_reativa') {
      pushPassiveLog(logs, {
        passiveId: passive.passiveId,
        effectType: 'cooldown_tick',
        detail: `Blindagem Reativa em cooldown: ${runtime.blindagemCd} turno(s).`,
      });
    }
  }
  if (runtime.ultimoSuspiroCd > 0) {
    runtime.ultimoSuspiroCd -= 1;
    if (passive.passiveId === 'ultimo_suspiro') {
      pushPassiveLog(logs, {
        passiveId: passive.passiveId,
        effectType: 'cooldown_tick',
        detail: `Último Suspiro do Titã em cooldown: ${runtime.ultimoSuspiroCd} rodada(s).`,
      });
    }
  }
  if (runtime.mimicTurns > 0 && opponent?.battleHp?.current > 0) {
    const mimicDamage = Math.max(1, Math.round(Number(player?.stats?.attack || 1) * 0.35));
    opponent.battleHp.current = Math.max(0, Number(opponent.battleHp.current || 0) - mimicDamage);
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'summon_attack',
      detail: `Mímico causou ${mimicDamage} de dano.`,
    });
    runtime.mimicTurns -= 1;
  }

  if (passive.passiveId === 'paradoxo_temporal') {
    runtime.paradoxoCounter = Number(runtime.paradoxoCounter || 0) + 1;
    const interval = Number(passive.values.intervalTurns || 5);
    if (runtime.paradoxoCounter >= interval && runtime.lastMagic?.baseDamage) {
      runtime.paradoxoCounter = 0;
      const bonusDamage = Math.max(1, Math.round(Number(runtime.lastMagic.baseDamage || 0) * pct(passive.values.efficacyPct)));
      if (opponent) {
        opponent.battleHp.current = Math.max(0, Number(opponent.battleHp.current || 0) - bonusDamage);
        pushPassiveLog(logs, {
          passiveId: passive.passiveId,
          effectType: 'skill_repeat',
          detail: `Paradoxo Temporal ativado — repetiu habilidade com ${Math.round(Number(passive.values.efficacyPct || 0))}% de eficácia e causou ${bonusDamage} de dano.`,
        });
      }
    }
  }

  if (passive.passiveId === 'ultimo_suspiro' && runtime.eggActive) {
    runtime.eggTurns = Number(runtime.eggTurns || 0) + 1;
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'egg_round_survived',
      detail: `Ovo sobreviveu ao round ${runtime.eggTurns}.`,
    });
    const maxEggTurns = Math.max(1, Number(passive.values.maxEggRounds || EGG_MAX_TURNS));
    if (runtime.eggTurns >= maxEggTurns) {
      reviveFromEgg({ player, passive, runtime, logs, reason: 'round_limit' });
    }
  }

  return logs;
}

function onOutgoingDamage({ battle, attackerId, defenderId, damage, isMagic, logs = [], isSuperEffective = false }) {
  const attacker = battle.players?.[attackerId];
  const defender = battle.players?.[defenderId];
  if (!attacker || !defender) return { damage, logs };
  const passive = getLegendaryPassive(attacker);
  if (!passive) return { damage, logs };
  const runtime = getPassiveRuntime(attacker);

  let finalDamage = Math.max(0, Number(damage || 0));

  if (passive.passiveId === 'ruptura_realidade') {
    finalDamage = Math.round(finalDamage * (1 + (pct(passive.values.penetrationPct) * 0.5)));
  }

  if (passive.passiveId === 'vinculo_ruina' && !isMagic) {
    const transfer = Math.max(1, Math.round(finalDamage * pct(passive.values.transferPct)));
    const splashTargetId = Object.keys(battle.players || {}).find((id) => id !== attackerId && id !== defenderId);
    if (splashTargetId && battle.players[splashTargetId]) {
      battle.players[splashTargetId].battleHp.current = Math.max(0, Number(battle.players[splashTargetId].battleHp.current || 0) - transfer);
      pushPassiveLog(logs, {
        passiveId: passive.passiveId,
        effectType: 'resource_transfer',
        detail: `Transferiu ${transfer} de dano para alvo secundário.`,
      });
    } else {
      const trueDamage = Math.max(1, Math.round(Number(defender?.battleHp?.max || 0) * pct(passive.values.trueDamagePctTargetMaxHp)));
      defender.battleHp.current = Math.max(0, Number(defender.battleHp.current || 0) - trueDamage);
      pushPassiveLog(logs, {
        passiveId: passive.passiveId,
        effectType: 'bonus_damage',
        detail: `Causou ${trueDamage} de dano verdadeiro baseado na vida máxima.`,
      });
    }
  }

  if (passive.passiveId === 'sobreposicao_elemental' && Math.random() < pct(passive.values.chancePct)) {
    const extra = Math.max(1, Math.round(Number(attacker?.stats?.magic || 1) * pct(passive.values.magicDamagePct)));
    defender.battleHp.current = Math.max(0, Number(defender?.battleHp?.current || 0) - extra);
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'bonus_damage',
      detail: `Causou ${extra} de dano ${String(attacker?.selectedPokemon?.elementTypes?.[0] || 'elemental')} adicional.`,
    });
  }

  if (passive.passiveId === 'marca_juizo') {
    const status = ensureExecuteStatus(defender);
    status.marcaJuizoStacks = Number(status.marcaJuizoStacks || 0) + 1;
    const required = Math.max(1, Number(passive.values.requiredStacks || 3));
    if (status.marcaJuizoStacks >= required) {
      status.marcaJuizoStacks = 0;
      const explode = Math.max(1, Math.round(Number(defender?.battleHp?.max || 0) * pct(passive.values.explosionPctTargetMaxHp)));
      defender.battleHp.current = Math.max(0, Number(defender.battleHp.current || 0) - explode);
      pushPassiveLog(logs, {
        passiveId: passive.passiveId,
        effectType: 'execute_trigger',
        detail: `Explosão causada — ${Math.round(Number(passive.values.explosionPctTargetMaxHp || 0))}% da vida máxima (${explode} de dano).`,
      });
    }
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'stacks_gain',
      detail: `Marca aplicada [${status.marcaJuizoStacks}/${required}]`,
    });
  }

  if (passive.passiveId === 'dominio_elemental' && isSuperEffective) {
    const heal = Math.max(1, Math.round(finalDamage * pct(passive.values.healPct)));
    attacker.battleHp.current = Math.min(Number(attacker?.battleHp?.max || 0), Number(attacker?.battleHp?.current || 0) + heal);
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'heal',
      detail: `Converteu ${finalDamage} de dano em ${heal} de cura.`,
    });
  }

  if (passive.passiveId === 'colapso_elemental' && isSuperEffective) {
    const execute = applyExecuteStacks(defender, {
      stacks: 1,
      maxStacks: Math.max(1, Number(passive.values.maxExecuteStacks || 7)),
      baseThresholdPct: 0.15,
      stackThresholdPct: Math.max(0.005, 0.01),
    });
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'stacks_gain',
      detail: `Aplicou EXECUTE +1 [stack ${execute.stacks}]`,
    });
  }

  if (passive.passiveId === 'eco_arcano' && isMagic && Math.random() < pct(passive.values.chancePct)) {
    const echo = Math.max(1, Math.round(finalDamage * pct(passive.values.echoDamagePct)));
    defender.battleHp.current = Math.max(0, Number(defender?.battleHp?.current || 0) - echo);
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'skill_repeat',
      detail: `Eco Arcano ativado — habilidade repetida com ${Math.round(Number(passive.values.echoDamagePct || 0))}% de poder (${echo} de dano).`,
    });
  }

  if (passive.passiveId === 'ascensao_crescente' && isMagic) {
    runtime.ascensaoBonusPct = Math.min(Number(passive.values.capPct || 30), Number(runtime.ascensaoBonusPct || 0) + Number(passive.values.bonusPctPerSkill || 3));
    const mul = 1 + pct(runtime.ascensaoBonusPct);
    attacker.stats.attack = Math.max(1, Math.round(Number(attacker.stats.attack || 1) * mul));
    attacker.stats.magic = Math.max(1, Math.round(Number(attacker.stats.magic || 1) * mul));
    attacker.stats.defense = Math.max(0, Math.round(Number(attacker.stats.defense || 0) * mul));
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'buff_apply',
      detail: `Atributos aumentados em ${Math.round(Number(passive.values.bonusPctPerSkill || 0))}% [stack ${Math.round(Number(runtime.ascensaoBonusPct || 0) / Math.max(1, Number(passive.values.bonusPctPerSkill || 1)))}]`,
    });
  }

  if (passive.passiveId === 'essencia_vampirica' && isMagic) {
    const lifeSteal = Math.max(1, Math.round(finalDamage * pct(passive.values.lifeStealPct)));
    attacker.battleHp.current = Math.min(Number(attacker.battleHp.max || 0), Number(attacker.battleHp.current || 0) + lifeSteal);
    attacker.skillEnergy = Math.min(Number(attacker.skillEnergyMax || 300), Number(attacker.skillEnergy || 0) + Math.round(finalDamage * pct(passive.values.resourceStealPct)));
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'heal_resource_steal',
      detail: `Recuperou ${lifeSteal} de vida e ${Math.round(finalDamage * pct(passive.values.resourceStealPct))} de energia.`,
    });
  }

  return { damage: finalDamage, logs };
}

function onDamageTaken({ battle, attackerId, defenderId, damage, logs = [], attackElement = null }) {
  const defender = battle.players?.[defenderId];
  const attacker = battle.players?.[attackerId];
  if (!defender) return logs;
  const passive = getLegendaryPassive(defender);
  if (!passive) return logs;
  const runtime = getPassiveRuntime(defender);

  if (passive.passiveId === 'retalia_primordial') {
    const cap = Math.round(Number(defender.battleHp.max || 0) * pct(passive.values.storageCapPctMaxHp));
    runtime.retaliationCounter = (Number(runtime.retaliationCounter || 0) + 1);
    if (runtime.retaliationCounter >= Number(passive.values.intervalTurns || 6)) {
      runtime.retaliationCounter = 0;
      const add = Math.round(Number(damage || 0) * pct(passive.values.conversionPct));
      runtime.retaliationStored = Math.min(cap, Number(runtime.retaliationStored || 0) + add);
      pushPassiveLog(logs, {
        passiveId: passive.passiveId,
        effectType: 'stacks_gain',
        detail: `Armazenou ${add} de dano (total: ${runtime.retaliationStored})`,
      });
    }
  }

  if (passive.passiveId === 'blindagem_reativa' && Number(runtime.blindagemCd || 0) <= 0) {
    runtime.blindagemCd = Number(passive.values.cooldownTurns || 5);
    const shield = Math.max(1, Math.round(Number(damage || 0) * pct(passive.values.absorbPct)));
    addOrRefreshEffect(defender, {
      id: 'legendary_reactive_shield',
      name: 'Blindagem Reativa',
      remainingRounds: Number(passive.values.durationTurns || 1),
      shieldCurrentHp: shield,
    });
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'shield_apply',
      detail: `Gerou escudo de ${shield} por ${Math.max(1, Number(passive.values.durationTurns || 1))} turno(s).`,
    });
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'cooldown_start',
      detail: `Blindagem Reativa em cooldown por ${runtime.blindagemCd} turno(s).`,
    });
  }

  if (passive.passiveId === 'sangue_adaptativo' && attackElement) {
    if (runtime.sangueElement && runtime.sangueElement !== attackElement) {
      runtime.sangueStacks = 1;
      runtime.sangueElement = attackElement;
      runtime.sangueHold = 2;
    } else {
      runtime.sangueElement = attackElement;
      runtime.sangueStacks = Math.min(Number(passive.values.maxStacks || 3), Number(runtime.sangueStacks || 0) + 1);
    }
    const reduction = 1 - (pct(passive.values.resistPerStackPct) * Number(runtime.sangueStacks || 0));
    addOrRefreshEffect(defender, {
      id: `legendary_adaptive_${attackElement}`,
      name: `Resistência ${attackElement}`,
      remainingRounds: 2,
      incomingDamageTakenMultiplier: Math.max(0.4, reduction),
    });
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'debuff_apply',
      detail: `Resistência ao elemento ${attackElement} aumentada (+${Math.round(Number(passive.values.resistPerStackPct || 0))}%) [stack ${runtime.sangueStacks}]`,
    });
  }

  if (passive.passiveId === 'espirito_sobrevivencia') {
    const hpPct = (Number(defender.battleHp.current || 0) / Math.max(1, Number(defender.battleHp.max || 1))) * 100;
    if (!runtime.espiritoTriggered && hpPct <= Number(passive.values.triggerHpPct || 20)) {
      runtime.espiritoTriggered = true;
      const bonus = Math.round(Number(defender.battleHp.max || 0) * pct(passive.values.maxHpBonusPct));
      defender.battleHp.max += bonus;
      defender.battleHp.current = Math.min(defender.battleHp.max, Number(defender.battleHp.current || 0) + Math.round(Number(defender.battleHp.max || 0) * 0.2));
      defender.stats.attack = Math.max(1, Math.round(Number(defender.stats.attack || 1) * 0.85));
      defender.stats.magic = Math.max(1, Math.round(Number(defender.stats.magic || 1) * 0.85));
      pushPassiveLog(logs, {
        passiveId: passive.passiveId,
        effectType: 'buff_apply',
        detail: 'Ativou sobrevivência — HP máximo aumentado e atributos reduzidos',
      });
    }
  }

  if (passive.passiveId === 'ultimo_suspiro' && runtime.eggActive) {
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'damage_taken',
      detail: `Ovo recebeu ${Math.max(0, Number(damage || 0))} de dano (HP atual: ${Math.max(0, Number(defender.battleHp.current || 0))})`,
    });
    if (Number(defender.battleHp.current || 0) <= 0) {
      reviveFromEgg({ player: defender, passive, runtime, logs, reason: 'egg_hp_zero' });
    }
  }

  if (passive.passiveId === 'ultimo_suspiro' && Number(defender.battleHp.current || 0) <= 0 && !runtime.eggActive && Number(runtime.ultimoSuspiroCd || 0) <= 0) {
    runtime.eggActive = true;
    runtime.eggTurns = 0;
    runtime.ultimoSuspiroCd = Number(passive.values.cooldownRounds || 20);
    defender.battleHp.current = Math.max(1, Math.round(Number(defender.battleHp.max || 0) * pct(passive.values.eggHpPct)));
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'revive',
      detail: `Transformado em Ovo (HP: ${defender.battleHp.current})`,
    });
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'cooldown_start',
      detail: `Último Suspiro do Titã em cooldown por ${runtime.ultimoSuspiroCd} rodada(s).`,
    });
  }

  if (checkExecuteThreshold(defender)) {
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'execute_trigger',
      detail: 'EXECUTE ativado — alvo eliminado',
    });
  }

  if (passive.passiveId === 'regencia_absoluta' && attacker && Math.random() < 0.2) {
    const buffs = ['energia', 'dano', 'magia', 'imune_controle', 'imortal'];
    const pick = buffs[Math.floor(Math.random() * buffs.length)];
    runtime.regenciaBuffs = Array.isArray(runtime.regenciaBuffs) ? runtime.regenciaBuffs : [];
    if (runtime.regenciaBuffs.length < Number(passive.values.maxBuffStacks || 3)) runtime.regenciaBuffs.push(pick);
    const bonus = 1 + (pct(passive.values.bonusPerBuffPct) * runtime.regenciaBuffs.length);
    defender.stats.attack = Math.max(1, Math.round(Number(defender.stats.attack || 1) * bonus));
    defender.stats.magic = Math.max(1, Math.round(Number(defender.stats.magic || 1) * bonus));
    defender.stats.defense = Math.max(0, Math.round(Number(defender.stats.defense || 0) * bonus));
    if (pick === 'imortal') addOrRefreshEffect(defender, { id: 'legendary_immortal_round', name: 'Imortal', remainingRounds: 1, antiExecute: true, preventFatal: true });
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'buff_apply',
      detail: `Ganhou buff ${pick}`,
    });
    pushPassiveLog(logs, {
      passiveId: passive.passiveId,
      effectType: 'buff_apply',
      detail: `Buff ativo — atributos aumentados (+${Math.round(Number(passive.values.bonusPerBuffPct || 0))}%) [stack ${runtime.regenciaBuffs.length}]`,
    });
  }

  return logs;
}

function consumeRetaliationOnAttack({ battle, attackerId, logs = [] }) {
  const attacker = battle.players?.[attackerId];
  const passive = getLegendaryPassive(attacker);
  if (!attacker || passive?.passiveId !== 'retalia_primordial') return logs;
  const runtime = getPassiveRuntime(attacker);
  const stored = Math.max(0, Number(runtime.retaliationStored || 0));
  if (stored <= 0) return logs;
  const opponentId = attackerId === battle.challengerId ? battle.challengedId : battle.challengerId;
  const opponent = battle.players?.[opponentId];
  if (!opponent) return logs;
  opponent.battleHp.current = Math.max(0, Number(opponent.battleHp.current || 0) - stored);
  runtime.retaliationStored = 0;
  pushPassiveLog(logs, {
    passiveId: passive.passiveId,
    effectType: 'bonus_damage',
    detail: `Liberou ${stored} de dano acumulado`,
  });
  return logs;
}

function rememberLastMagic({ battle, actorId, baseDamage }) {
  const actor = battle.players?.[actorId];
  if (!actor) return;
  const runtime = getPassiveRuntime(actor);
  runtime.lastMagic = { baseDamage: Number(baseDamage || 0) };
}

function isEggFormActive(player) {
  const passive = getLegendaryPassive(player);
  if (passive?.passiveId !== 'ultimo_suspiro') return false;
  const runtime = getPassiveRuntime(player);
  return Boolean(runtime?.eggActive);
}

function reviveFromEgg({ player, passive, runtime, logs = [], reason = null }) {
  const turnsSurvived = Math.max(0, Number(runtime?.eggTurns || 0));
  const pctPerRound = Number(passive?.values?.revivePctPerRound || ULTIMO_SUSPIRO_REVIVE_PCT_PER_ROUND);
  const maxEggTurns = Math.max(1, Number(passive?.values?.maxEggRounds || EGG_MAX_TURNS));
  const appliedTurns = Math.min(turnsSurvived, maxEggTurns);
  const revivePct = Math.max(1, Math.min(100, Math.round(appliedTurns * pctPerRound)));
  const reviveHp = Math.max(1, Math.round(Number(player?.battleHp?.max || 0) * (revivePct / 100)));
  runtime.eggActive = false;
  runtime.eggTurns = 0;
  player.battleHp.current = reviveHp;

  if (reason === 'round_limit') {
    pushPassiveLog(logs, {
      passiveId: passive?.passiveId,
      effectType: 'revive',
      detail: 'Ovo atingiu o limite de rounds e renasceu.',
    });
  }
  pushPassiveLog(logs, {
    passiveId: passive?.passiveId,
    effectType: 'revive',
    detail: `Renasceu com ${revivePct}% de HP (${reviveHp}).`,
  });
}

module.exports = {
  onBattleStart,
  onTurnStart,
  onOutgoingDamage,
  onDamageTaken,
  consumeRetaliationOnAttack,
  rememberLastMagic,
  getPassiveDetailsText,
  isEggFormActive,
};
