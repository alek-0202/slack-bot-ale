const PASSIVE_DEFINITIONS = Object.freeze({
  retalia_primordial: {
    id: 'retalia_primordial',
    code: 'NRP',
    name: 'Núcleo de Retaliação Primordial',
    ranges: { intervalTurns: [6, 3], conversionPct: [20, 40], storageCapPctMaxHp: [30, 80] },
    descriptionTemplate: 'Ao receber dano, armazena {conversionPct} a cada {intervalTurns} turnos (máx {storageCapPctMaxHp} do HP). Próximo ataque libera o valor acumulado.',
  },
  eco_arcano: {
    id: 'eco_arcano',
    code: 'EAI',
    name: 'Eco Arcano Infinito',
    ranges: { chancePct: [15, 30], echoDamagePct: [40, 70] },
    descriptionTemplate: 'Habilidades têm {chancePct} de chance de repetir no mesmo alvo com {echoDamagePct} do poder.',
  },
  dominio_elemental: {
    id: 'dominio_elemental',
    code: 'DEA',
    name: 'Domínio Elemental Absoluto',
    ranges: { healPct: [20, 50], cooldownReductionTurns: [1, 2] },
    descriptionTemplate: 'Ao causar super efetivo: cura {healPct} do dano e reduz cooldowns em {cooldownReductionTurns} turno(s).',
  },
  paradoxo_temporal: {
    id: 'paradoxo_temporal',
    code: 'PTM',
    name: 'Paradoxo Temporal',
    ranges: { intervalTurns: [5, 3], efficacyPct: [70, 100] },
    descriptionTemplate: 'A cada {intervalTurns} turnos, repete a última habilidade sem custo com {efficacyPct} da eficácia.',
  },
  sangue_adaptativo: {
    id: 'sangue_adaptativo',
    code: 'SAD',
    name: 'Sangue Adaptativo',
    ranges: { resistPerStackPct: [3, 8], maxStacks: [3, 6] },
    descriptionTemplate: 'Ao sofrer dano elemental, ganha {resistPerStackPct} de resistência por stack (máx {maxStacks}); troca de elemento mantém por 2 turnos e reseta.',
  },
  fissura_caos: {
    id: 'fissura_caos',
    code: 'FDC',
    name: 'Fissura do Caos',
    ranges: { chancePct: [10, 25], durationTurns: [1, 3] },
    descriptionTemplate: 'Ataques têm {chancePct} de chance de aplicar burn/freeze/poison/shock por {durationTurns} turno(s).',
  },
  espirito_sobrevivencia: {
    id: 'espirito_sobrevivencia',
    code: 'EDS',
    name: 'Espírito de Sobrevivência',
    ranges: { triggerHpPct: [20, 40], maxHpBonusPct: [50, 80] },
    descriptionTemplate: 'Ao ficar abaixo de {triggerHpPct} de HP: ganha +{maxHpBonusPct} HP máximo até o fim da luta, cura 20% e perde 15% ATK/MAG.',
  },
  vinculo_ruina: {
    id: 'vinculo_ruina',
    code: 'VDR',
    name: 'Vínculo de Ruína',
    ranges: { transferPct: [25, 45], trueDamagePctTargetMaxHp: [5, 9] },
    descriptionTemplate: 'Ataques físicos transferem {transferPct} do dano para outro alvo. Sem alvo secundário: causa {trueDamagePctTargetMaxHp} da vida máxima como dano verdadeiro.',
  },
  blindagem_reativa: {
    id: 'blindagem_reativa',
    code: 'BLR',
    name: 'Blindagem Reativa',
    ranges: { absorbPct: [15, 35], durationTurns: [1, 2], cooldownTurns: [5, 2] },
    descriptionTemplate: 'Ao receber dano, gera escudo de {absorbPct} do dano por {durationTurns} turno(s). Recarga: {cooldownTurns} turnos.',
  },
  colapso_elemental: {
    id: 'colapso_elemental',
    code: 'CLE',
    name: 'Colapso Elemental',
    ranges: { maxExecuteStacks: [7, 18] },
    descriptionTemplate: 'Em super efetivo, aplica Execute (1 stack = 1% HP de limiar), até {maxExecuteStacks} stacks.',
  },
  ascensao_crescente: {
    id: 'ascensao_crescente',
    code: 'ASC',
    name: 'Ascensão Crescente',
    ranges: { bonusPctPerSkill: [3, 6], capPct: [30, 60] },
    descriptionTemplate: 'Cada habilidade usada aumenta ATK/MAG/DEF em {bonusPctPerSkill} (até {capPct}) até o fim da batalha.',
  },
  ruptura_realidade: {
    id: 'ruptura_realidade',
    code: 'RDR',
    name: 'Ruptura de Realidade',
    ranges: { penetrationPct: [20, 40] },
    descriptionTemplate: 'Ataques ignoram {penetrationPct} das defesas/resistências do alvo.',
  },
  essencia_vampirica: {
    id: 'essencia_vampirica',
    code: 'EVA',
    name: 'Essência Vampírica Arcana',
    ranges: { lifeStealPct: [15, 30], resourceStealPct: [10, 20] },
    descriptionTemplate: 'Converte {lifeStealPct} do dano de habilidades em vida e {resourceStealPct} em energia.',
  },
  reflexo_dimensional: {
    id: 'reflexo_dimensional',
    code: 'RFD',
    name: 'Reflexo Dimensional',
    ranges: { chancePct: [25, 45], durationTurns: [2, 3] },
    descriptionTemplate: 'Ataques têm {chancePct} de chance de criar mímico inalvejável por {durationTurns} turnos.',
  },
  catalisador_instavel: {
    id: 'catalisador_instavel',
    code: 'CAT',
    name: 'Catalisador Instável',
    ranges: { chancePct: [20, 35], trueBurnDamage: [150, 300] },
    descriptionTemplate: 'Ao aplicar debuff, {chancePct}% de chance de burn verdadeiro de {trueBurnDamage} por 2 rodadas.',
  },
  sobreposicao_elemental: {
    id: 'sobreposicao_elemental',
    code: 'SPE',
    name: 'Sobreposição Elemental',
    ranges: { chancePct: [40, 70], magicDamagePct: [30, 45] },
    descriptionTemplate: 'Ataques têm {chancePct} de chance de on-hit elemental adicional com {magicDamagePct} da MAG.',
  },
  regencia_absoluta: {
    id: 'regencia_absoluta',
    code: 'RGA',
    name: 'Regência Absoluta',
    ranges: { bonusPerBuffPct: [4, 8], maxBuffStacks: [3, 6] },
    descriptionTemplate: 'Ao atacar, 20% de chance de ganhar buff aleatório. Cada buff ativo concede +{bonusPerBuffPct} em atributos (máx {maxBuffStacks} stacks).',
  },
  marca_juizo: {
    id: 'marca_juizo',
    code: 'MJF',
    name: 'Marca do Juízo Final',
    ranges: { requiredStacks: [7, 3], explosionPctTargetMaxHp: [12, 18] },
    descriptionTemplate: 'Ataques marcam alvo; com {requiredStacks} stacks, explode causando {explosionPctTargetMaxHp} do HP máximo.',
  },
  ultimo_suspiro: {
    id: 'ultimo_suspiro',
    code: 'UST',
    name: 'Último Suspiro do Titã',
    ranges: { eggHpPct: [15, 45], cooldownRounds: [20, 20] },
    descriptionTemplate: 'Ao morrer vira ovo com {eggHpPct} de HP máximo e cura 8% por rodada; recarga de {cooldownRounds} rounds.',
  },
});


function formatRange(range = []) {
  const [min, max] = Array.isArray(range) ? range : [0, 0];
  return `${min} - ${max}`;
}

function isPercentKey(key = '') {
  return String(key).toLowerCase().includes('pct');
}

function formatRollValueWithRange({ passiveId, key, value }) {
  const def = PASSIVE_DEFINITIONS[passiveId];
  const range = def?.ranges?.[key] || [value, value];
  const valueLabel = isPercentKey(key) ? `${value}%` : `${value}`;
  const rangeLabel = isPercentKey(key) ? `${range[0]}% - ${range[1]}%` : formatRange(range);
  return `${valueLabel} (${rangeLabel})`;
}

const BY_CODE = Object.freeze(Object.fromEntries(Object.values(PASSIVE_DEFINITIONS).map((entry) => [entry.code, entry])));

function interpolateRange(range, efficiency, { integer = false } = {}) {
  const [a, b] = Array.isArray(range) ? range : [0, 0];
  const min = Number(a);
  const max = Number(b);
  const raw = min + ((max - min) * efficiency);
  return integer ? Math.round(raw) : Number(raw.toFixed(2));
}

function rollLegendaryPassive({ random = Math.random } = {}) {
  const entries = Object.values(PASSIVE_DEFINITIONS);
  const picked = entries[Math.floor(random() * entries.length)] || entries[0];
  const efficiency = Math.max(0, Math.min(1, Number(random()) || 0));
  const values = {};
  for (const [key, range] of Object.entries(picked.ranges || {})) {
    const needsInteger = key.toLowerCase().includes('turn') || key.toLowerCase().includes('stack') || key.toLowerCase().includes('cooldown') || key.toLowerCase().includes('damage');
    values[key] = interpolateRange(range, efficiency, { integer: needsInteger });
  }
  return {
    passiveId: picked.id,
    passiveCode: picked.code,
    efficiency: Number(efficiency.toFixed(4)),
    values,
  };
}

function renderLegendaryPassiveDescription(passiveId, values = {}) {
  const definition = PASSIVE_DEFINITIONS[passiveId];
  if (!definition) return '';
  return String(definition.descriptionTemplate || '').replace(/\{(.*?)\}/g, (_, key) => {
    const value = values[key];
    if (value == null) return '-';
    return formatRollValueWithRange({ passiveId, key, value: Number.isFinite(Number(value)) ? Number(value) : value });
  });
}

function getPassiveByCode(code) {
  return BY_CODE[String(code || '').trim().toUpperCase()] || null;
}

module.exports = {
  PASSIVE_DEFINITIONS,
  rollLegendaryPassive,
  renderLegendaryPassiveDescription,
  getPassiveByCode,
  interpolateRange,
  formatRollValueWithRange,
};
