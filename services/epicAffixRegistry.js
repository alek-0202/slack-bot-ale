const EPIC_AFFIX_TYPES = Object.freeze({
  ATTACK_PCT: 'attack_pct',
  MAGIC_PCT: 'magic_pct',
  HP_PCT: 'hp_pct',
  SPEED_PCT: 'speed_pct',
  MAGIC_EFFICIENCY_PCT: 'magic_efficiency_pct',
  DEFENSE_PCT: 'defense_pct',
  SHIELD_START_HP_PCT: 'shield_start_hp_pct',
  DODGE_PCT: 'dodge_pct',
  ON_HIT_FLAT: 'on_hit_flat',
  DAMAGE_REDUCTION_FLAT: 'damage_reduction_flat',
});

const EPIC_AFFIX_REGISTRY = Object.freeze({
  [EPIC_AFFIX_TYPES.ATTACK_PCT]: {
    type: EPIC_AFFIX_TYPES.ATTACK_PCT,
    label: 'Attack',
    min: 5,
    max: 18,
    valueType: 'percent',
  },
  [EPIC_AFFIX_TYPES.MAGIC_PCT]: {
    type: EPIC_AFFIX_TYPES.MAGIC_PCT,
    label: 'Magia',
    min: 5,
    max: 18,
    valueType: 'percent',
  },
  [EPIC_AFFIX_TYPES.HP_PCT]: {
    type: EPIC_AFFIX_TYPES.HP_PCT,
    label: 'HP',
    min: 7,
    max: 22,
    valueType: 'percent',
  },
  [EPIC_AFFIX_TYPES.SPEED_PCT]: {
    type: EPIC_AFFIX_TYPES.SPEED_PCT,
    label: 'Speed',
    min: 30,
    max: 45,
    valueType: 'percent',
  },
  [EPIC_AFFIX_TYPES.MAGIC_EFFICIENCY_PCT]: {
    type: EPIC_AFFIX_TYPES.MAGIC_EFFICIENCY_PCT,
    label: 'Eficiência mágica',
    min: 10,
    max: 30,
    valueType: 'percent',
  },
  [EPIC_AFFIX_TYPES.DEFENSE_PCT]: {
    type: EPIC_AFFIX_TYPES.DEFENSE_PCT,
    label: 'Defesa',
    min: 5,
    max: 18,
    valueType: 'percent',
  },
  [EPIC_AFFIX_TYPES.SHIELD_START_HP_PCT]: {
    type: EPIC_AFFIX_TYPES.SHIELD_START_HP_PCT,
    label: 'Shield bônus inicial',
    min: 3,
    max: 12,
    valueType: 'percent_hp',
  },
  [EPIC_AFFIX_TYPES.DODGE_PCT]: {
    type: EPIC_AFFIX_TYPES.DODGE_PCT,
    label: 'Esquiva',
    min: 4,
    max: 10,
    valueType: 'percent',
  },
  [EPIC_AFFIX_TYPES.ON_HIT_FLAT]: {
    type: EPIC_AFFIX_TYPES.ON_HIT_FLAT,
    label: 'Dano on-hit',
    min: 50,
    max: 300,
    valueType: 'flat',
  },
  [EPIC_AFFIX_TYPES.DAMAGE_REDUCTION_FLAT]: {
    type: EPIC_AFFIX_TYPES.DAMAGE_REDUCTION_FLAT,
    label: 'Redução fixa',
    min: 30,
    max: 150,
    valueType: 'flat',
  },
});

function randomIntInclusive(min, max) {
  const safeMin = Math.min(Number(min) || 0, Number(max) || 0);
  const safeMax = Math.max(Number(min) || 0, Number(max) || 0);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function getEpicAffixDefinition(type) {
  return EPIC_AFFIX_REGISTRY[String(type || '').trim().toLowerCase()] || null;
}

function normalizeEpicAffix(rawAffix = null) {
  if (!rawAffix || !rawAffix.type) return null;
  const definition = getEpicAffixDefinition(rawAffix.type);
  if (!definition) return null;
  const value = Number(rawAffix.value || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return {
    type: definition.type,
    value,
    label: rawAffix.label || definition.label,
    valueType: rawAffix.valueType || definition.valueType,
    metadata: rawAffix.metadata || {},
  };
}

function rollEpicAffix(type) {
  const definition = getEpicAffixDefinition(type);
  if (!definition) return null;
  return {
    type: definition.type,
    value: randomIntInclusive(definition.min, definition.max),
    label: definition.label,
    valueType: definition.valueType,
    metadata: {
      min: definition.min,
      max: definition.max,
      rolledAt: new Date().toISOString(),
    },
  };
}

function rollDistinctEpicAffixOptions(count = 2) {
  const allTypes = Object.keys(EPIC_AFFIX_REGISTRY);
  const requested = Math.max(1, Number(count) || 1);
  const selected = [];
  const available = [...allTypes];

  while (selected.length < requested && available.length > 0) {
    const index = randomIntInclusive(0, available.length - 1);
    const [type] = available.splice(index, 1);
    const rolled = rollEpicAffix(type);
    if (rolled) selected.push(rolled);
  }

  return selected;
}

function formatEpicAffix(affix) {
  const normalized = normalizeEpicAffix(affix);
  if (!normalized) return 'Sem afixo';
  if (normalized.valueType === 'flat') return `${normalized.label} +${Math.round(normalized.value)}`;
  if (normalized.valueType === 'percent_hp') return `${normalized.label} +${Math.round(normalized.value)}% HP`;
  return `${normalized.label} +${Math.round(normalized.value)}%`;
}

module.exports = {
  EPIC_AFFIX_TYPES,
  EPIC_AFFIX_REGISTRY,
  getEpicAffixDefinition,
  normalizeEpicAffix,
  rollEpicAffix,
  rollDistinctEpicAffixOptions,
  formatEpicAffix,
};
