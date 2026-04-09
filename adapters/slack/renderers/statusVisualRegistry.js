const { describeEffectGameplayImpact, normalizeEffectKey } = require("../../../application/battle/domain/effectDetailsRegistry");

const STATUS_ICON_ASSET_BASE_PATH = "assets/status-icons";
const STATUS_ICON_CATEGORY_ASSETS = {
  buff: `${STATUS_ICON_ASSET_BASE_PATH}/status_buff.png`,
  debuff: `${STATUS_ICON_ASSET_BASE_PATH}/status_debuff.png`,
  special: `${STATUS_ICON_ASSET_BASE_PATH}/status_special.png`,
};

const VISUAL_CATEGORY_META = {
  buff: { label: "buff", blockColor: "green" },
  debuff: { label: "debuff", blockColor: "red" },
  special: { label: "special", blockColor: "blue" },
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
  if (key.startsWith("legendary_") || key.startsWith("mythic_")) return "special";
  if (key.includes("field") || key.includes("special")) return "special";
  if (effect?.type === "debuff" || effect?.type === "debuff_status") return "debuff";
  if (effect?.type === "special") return "special";

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

function resolveStatusIconPath({ category, key } = {}) {
  const directCategoryAsset = STATUS_ICON_CATEGORY_ASSETS[category];
  if (directCategoryAsset) return directCategoryAsset;
  if (key && STATUS_ICON_CATEGORY_ASSETS[key]) return STATUS_ICON_CATEGORY_ASSETS[key];
  return STATUS_ICON_CATEGORY_ASSETS.special;
}

function buildStatusTooltip(effect = {}, { stacks = null, remainingRounds = null, charges = null } = {}) {
  const name = effect?.name || effect?.id || "Status";
  const description = describeEffectGameplayImpact(effect);
  const roundsText = remainingRounds == null ? null : `${Math.max(0, Number(remainingRounds || 0))} rounds`;
  const stacksText = stacks == null || Number(stacks || 0) <= 1 ? null : `${Math.max(1, Number(stacks || 1))} stacks`;
  const chargesText = charges == null || Number(charges || 0) <= 0 ? null : `${Math.max(0, Number(charges || 0))} cargas`;
  return [name, description, roundsText, stacksText, chargesText].filter(Boolean).join(" • ");
}

function resolveStatusVisual(effect = {}) {
  const key = normalizeEffectKey(effect);
  const base = (key && STATUS_VISUAL_REGISTRY[key]) || null;
  const category = base?.category || inferCategoryFromEffect(effect);
  const categoryMeta = VISUAL_CATEGORY_META[category] || VISUAL_CATEGORY_META.buff;
  const iconPath = resolveStatusIconPath({ category, key });

  return {
    id: base?.id || key || effect?.id || null,
    name: base?.name || effect?.name || effect?.id || "Status",
    category,
    categoryLabel: categoryMeta.label,
    blockColor: categoryMeta.blockColor,
    symbol: base?.symbol || "⬜",
    description: describeEffectGameplayImpact(effect) || base?.description || effect?.description || "Status ativo.",
    tooltip: describeEffectGameplayImpact(effect) || base?.tooltip || effect?.description || effect?.name || "Status ativo",
    iconPath,
    placeholder: !base,
  };
}

function renderStatusBadge({ effect, stacks = 1, remainingRounds = null }) {
  const visual = resolveStatusVisual(effect);
  const charges = effect?.charges;
  const stackTag = Number(stacks || 1) > 1 ? `x${Math.max(1, Number(stacks || 1))}` : null;
  const roundsTag = remainingRounds == null ? null : `${Math.max(0, Number(remainingRounds || 0))}r`;
  const tags = [stackTag, roundsTag].filter(Boolean).join("·");
  const suffix = tags ? ` (${tags})` : "";
  const tooltip = buildStatusTooltip(effect, { stacks, remainingRounds, charges });
  const shortName = visual.name || "Status";

  return {
    text: `${shortName}${suffix}`,
    metadata: {
      id: visual.id,
      name: visual.name,
      category: visual.category,
      iconPath: visual.iconPath,
      tooltip,
      tooltipFallback: visual.tooltip,
      description: visual.description,
      remainingRounds: remainingRounds == null ? null : Math.max(0, Number(remainingRounds || 0)),
      stacks: Math.max(1, Number(stacks || 1)),
      charges: charges == null ? null : Math.max(0, Number(charges || 0)),
      placeholder: visual.placeholder,
    },
  };
}

module.exports = {
  STATUS_ICON_ASSET_BASE_PATH,
  STATUS_ICON_CATEGORY_ASSETS,
  STATUS_VISUAL_REGISTRY,
  VISUAL_CATEGORY_META,
  resolveStatusVisual,
  resolveStatusIconPath,
  buildStatusTooltip,
  renderStatusBadge,
};
