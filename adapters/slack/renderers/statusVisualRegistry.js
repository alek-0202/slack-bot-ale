const { normalizeEffectKey } = require("../../../application/battle/domain/effectDetailsRegistry");

const STATUS_ICON_ASSET_BASE_PATH = "assets/status-icons";

const VISUAL_CATEGORY_META = {
  buff: { label: "buff", blockColor: "green", badge: "🟩" },
  debuff: { label: "debuff", blockColor: "red", badge: "🟥" },
  special: { label: "special", blockColor: "blue", badge: "🟦" },
  mythic: { label: "mythic", blockColor: "purple", badge: "🟪" },
};

const STATUS_VISUAL_REGISTRY = {
  burn: {
    id: "burn",
    name: "Burn",
    category: "debuff",
    symbol: "🔥",
    description: "Causa dano contínuo por rodada.",
    tooltip: "Burn: dano por rodada.",
  },
  gelid: {
    id: "gelid",
    name: "Gélido",
    category: "debuff",
    symbol: "❄️",
    description: "Reduz ritmo e aplica controle gradual.",
    tooltip: "Gélido: lentidão e pressão de controle.",
  },
  psychic_barrier: {
    id: "psychic_barrier",
    name: "Barreira Psíquica",
    category: "buff",
    symbol: "🛡️",
    description: "Escudo que absorve dano antes do HP.",
    tooltip: "Barreira: absorve dano recebido.",
  },
  legendary_execute: {
    id: "legendary_execute",
    name: "Execução Lendária",
    category: "mythic",
    symbol: "👑",
    description: "Acumula execução até finalizar alvo elegível.",
    tooltip: "Passiva mítica de execução.",
  },
};

function inferCategoryFromEffect(effect = {}) {
  if (effect?.visualCategory && VISUAL_CATEGORY_META[effect.visualCategory]) return effect.visualCategory;
  const key = normalizeEffectKey(effect);
  if (key.startsWith("legendary_") || key.startsWith("mythic_")) return "mythic";
  if (key.includes("field") || key.includes("special")) return "special";

  const harmful = Boolean(
    effect?.isDebuff
    || effect?.harmful
    || effect?.cannotAct
    || effect?.skipTurn
    || effect?.blockAction
    || Number(effect?.dotDamage || effect?.damagePerTurn || 0) > 0
    || Number(effect?.incomingDamageTakenMultiplier || 1) > 1
    || Number(effect?.outgoingDamageMultiplier || 1) < 1
    || Number(effect?.speedMultiplier || 1) < 1
    || Number(effect?.defenseMultiplier || 1) < 1,
  );

  return harmful ? "debuff" : "buff";
}

function resolveStatusVisual(effect = {}) {
  const key = normalizeEffectKey(effect);
  const base = (key && STATUS_VISUAL_REGISTRY[key]) || null;
  const category = base?.category || inferCategoryFromEffect(effect);
  const categoryMeta = VISUAL_CATEGORY_META[category] || VISUAL_CATEGORY_META.buff;
  const iconPath = `${STATUS_ICON_ASSET_BASE_PATH}/${key || "placeholder"}.png`;

  return {
    id: base?.id || key || effect?.id || null,
    name: base?.name || effect?.name || effect?.id || "Status",
    category,
    categoryLabel: categoryMeta.label,
    blockColor: categoryMeta.blockColor,
    badge: categoryMeta.badge,
    symbol: base?.symbol || "⬜",
    description: base?.description || effect?.description || "Status ativo.",
    tooltip: base?.tooltip || effect?.description || effect?.name || "Status ativo",
    iconPath,
    placeholder: !base,
  };
}

function renderStatusBadge({ effect, stacks = 1, remainingRounds = null }) {
  const visual = resolveStatusVisual(effect);
  const stackTag = Number(stacks || 1) > 1 ? `x${Math.max(1, Number(stacks || 1))}` : null;
  const roundsTag = remainingRounds == null ? null : `${Math.max(0, Number(remainingRounds || 0))}r`;
  const tags = [stackTag, roundsTag].filter(Boolean).join("·");
  const suffix = tags ? `(${tags})` : "";

  return {
    text: `${visual.badge}${visual.symbol}${suffix}`,
    metadata: {
      id: visual.id,
      name: visual.name,
      category: visual.category,
      iconPath: visual.iconPath,
      tooltip: visual.tooltip,
      description: visual.description,
      placeholder: visual.placeholder,
    },
  };
}

module.exports = {
  STATUS_ICON_ASSET_BASE_PATH,
  STATUS_VISUAL_REGISTRY,
  VISUAL_CATEGORY_META,
  resolveStatusVisual,
  renderStatusBadge,
};
