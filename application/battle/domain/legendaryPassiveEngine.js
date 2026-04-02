const { ensureElementalState, addOrRefreshEffect } = require('./elementalRules');

const EXECUTE_STATUS_ID = 'legendary_execute';

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

function ensureExecuteStatus(defender) {
  const state = ensureElementalState(defender);
  state.statuses = Array.isArray(state.statuses) ? state.statuses : [];
  let status = state.statuses.find((entry) => entry.id === EXECUTE_STATUS_ID);
  if (!status) {
    status = { id: EXECUTE_STATUS_ID, stacks: 0, maxStacks: 0 };
    state.statuses.push(status);
  }
  return status;
}

function checkExecuteThreshold(defender) {
  const status = ensureExecuteStatus(defender);
  if (!status?.stacks) return false;
  const threshold = Math.round(Number(defender?.battleHp?.max || 0) * (Number(status.stacks || 0) / 100));
  if (Number(defender?.battleHp?.current || 0) > 0 && Number(defender?.battleHp?.current || 0) <= threshold) {
    defender.battleHp.current = 0;
    return true;
  }
  return false;
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

  if (runtime.blindagemCd > 0) runtime.blindagemCd -= 1;
  if (runtime.mimicTurns > 0 && opponent?.battleHp?.current > 0) {
    const mimicDamage = Math.max(1, Math.round(Number(player?.stats?.attack || 1) * 0.35));
    opponent.battleHp.current = Math.max(0, Number(opponent.battleHp.current || 0) - mimicDamage);
    logs.push(`🪞 Mímico dimensional atacou e causou ${mimicDamage}.`);
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
        logs.push(`⏳ Paradoxo Temporal repetiu habilidade e causou ${bonusDamage}.`);
      }
    }
  }

  if (passive.passiveId === 'ultimo_suspiro' && runtime.eggActive) {
    const heal = Math.max(1, Math.round(Number(player?.battleHp?.max || 0) * 0.08));
    player.battleHp.current = Math.min(Number(player?.battleHp?.max || 0), Number(player?.battleHp?.current || 0) + heal);
    logs.push(`🥚 Ovo do Titã regenerou ${heal} HP.`);
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
      logs.push(`☠️ Vínculo de Ruína transferiu ${transfer} para alvo secundário.`);
    } else {
      const trueDamage = Math.max(1, Math.round(Number(defender?.battleHp?.max || 0) * pct(passive.values.trueDamagePctTargetMaxHp)));
      defender.battleHp.current = Math.max(0, Number(defender.battleHp.current || 0) - trueDamage);
      logs.push(`☠️ Vínculo de Ruína causou ${trueDamage} de dano verdadeiro adicional.`);
    }
  }

  if (passive.passiveId === 'sobreposicao_elemental' && Math.random() < pct(passive.values.chancePct)) {
    const extra = Math.max(1, Math.round(Number(attacker?.stats?.magic || 1) * pct(passive.values.magicDamagePct)));
    defender.battleHp.current = Math.max(0, Number(defender?.battleHp?.current || 0) - extra);
    logs.push(`🧪 Sobreposição Elemental causou ${extra} de dano on-hit adicional.`);
  }

  if (passive.passiveId === 'marca_juizo') {
    const status = ensureExecuteStatus(defender);
    status.marcaJuizoStacks = Number(status.marcaJuizoStacks || 0) + 1;
    const required = Math.max(1, Number(passive.values.requiredStacks || 3));
    if (status.marcaJuizoStacks >= required) {
      status.marcaJuizoStacks = 0;
      const explode = Math.max(1, Math.round(Number(defender?.battleHp?.max || 0) * pct(passive.values.explosionPctTargetMaxHp)));
      defender.battleHp.current = Math.max(0, Number(defender.battleHp.current || 0) - explode);
      logs.push(`💥 Marca do Juízo Final explodiu por ${explode}.`);
    }
  }

  if (passive.passiveId === 'dominio_elemental' && isSuperEffective) {
    const heal = Math.max(1, Math.round(finalDamage * pct(passive.values.healPct)));
    attacker.battleHp.current = Math.min(Number(attacker?.battleHp?.max || 0), Number(attacker?.battleHp?.current || 0) + heal);
    logs.push(`🌟 Domínio Elemental curou ${heal} HP.`);
  }

  if (passive.passiveId === 'colapso_elemental' && isSuperEffective) {
    const execute = ensureExecuteStatus(defender);
    execute.maxStacks = Math.max(1, Number(passive.values.maxExecuteStacks || 7));
    execute.stacks = Math.min(execute.maxStacks, Number(execute.stacks || 0) + 1);
    logs.push(`⚖️ Execute aplicado: ${execute.stacks}/${execute.maxStacks} stacks.`);
  }

  if (passive.passiveId === 'eco_arcano' && isMagic && Math.random() < pct(passive.values.chancePct)) {
    const echo = Math.max(1, Math.round(finalDamage * pct(passive.values.echoDamagePct)));
    defender.battleHp.current = Math.max(0, Number(defender?.battleHp?.current || 0) - echo);
    logs.push(`🔁 Eco Arcano repetiu a habilidade e causou ${echo}.`);
  }

  if (passive.passiveId === 'ascensao_crescente' && isMagic) {
    runtime.ascensaoBonusPct = Math.min(Number(passive.values.capPct || 30), Number(runtime.ascensaoBonusPct || 0) + Number(passive.values.bonusPctPerSkill || 3));
    const mul = 1 + pct(runtime.ascensaoBonusPct);
    attacker.stats.attack = Math.max(1, Math.round(Number(attacker.stats.attack || 1) * mul));
    attacker.stats.magic = Math.max(1, Math.round(Number(attacker.stats.magic || 1) * mul));
    attacker.stats.defense = Math.max(0, Math.round(Number(attacker.stats.defense || 0) * mul));
  }

  if (passive.passiveId === 'essencia_vampirica' && isMagic) {
    const lifeSteal = Math.max(1, Math.round(finalDamage * pct(passive.values.lifeStealPct)));
    attacker.battleHp.current = Math.min(Number(attacker.battleHp.max || 0), Number(attacker.battleHp.current || 0) + lifeSteal);
    attacker.skillEnergy = Math.min(Number(attacker.skillEnergyMax || 300), Number(attacker.skillEnergy || 0) + Math.round(finalDamage * pct(passive.values.resourceStealPct)));
    logs.push(`🩸 Essência Vampírica drenou ${lifeSteal} de vida.`);
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
      logs.push(`🧱 Núcleo Primordial armazenou ${add} dano.`);
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
    logs.push(`🛡️ Blindagem Reativa criou escudo de ${shield}.`);
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
      logs.push(`💚 Espírito de Sobrevivência ativou (+${bonus} HP máximo).`);
    }
  }

  if (passive.passiveId === 'ultimo_suspiro' && Number(defender.battleHp.current || 0) <= 0 && Number(runtime.ultimoSuspiroCd || 0) <= 0) {
    runtime.eggActive = true;
    runtime.ultimoSuspiroCd = Number(passive.values.cooldownRounds || 20);
    defender.battleHp.current = Math.max(1, Math.round(Number(defender.battleHp.max || 0) * pct(passive.values.eggHpPct)));
    logs.push('🥚 Último Suspiro do Titã ativou: o lendário virou ovo e evitou a morte.');
  }

  if (checkExecuteThreshold(defender)) {
    logs.push('⚖️ Execute finalizou o alvo automaticamente.');
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
    logs.push(`👑 Regência Absoluta ativou buff: ${pick}.`);
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
  logs.push(`💥 Núcleo de Retaliação liberou ${stored} de dano acumulado.`);
  return logs;
}

function rememberLastMagic({ battle, actorId, baseDamage }) {
  const actor = battle.players?.[actorId];
  if (!actor) return;
  const runtime = getPassiveRuntime(actor);
  runtime.lastMagic = { baseDamage: Number(baseDamage || 0) };
}

module.exports = {
  onBattleStart,
  onTurnStart,
  onOutgoingDamage,
  onDamageTaken,
  consumeRetaliationOnAttack,
  rememberLastMagic,
};
