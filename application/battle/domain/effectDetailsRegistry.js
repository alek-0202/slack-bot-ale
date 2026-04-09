const { GLOBAL_EFFECT_DEFINITIONS } = require("./globalEffectRegistry");
const EFFECT_GAMEPLAY_DESCRIPTIONS = {
  ...Object.fromEntries(Object.values(GLOBAL_EFFECT_DEFINITIONS).map((entry) => [entry.id, entry.gameplayDescription]).filter((entry) => entry[0] && entry[1])),
  burn: "causa dano ao longo do tempo no turno do afetado",
  choque: "acumula cargas que reduzem velocidade/iniciativa e atrapalham agir primeiro",
  electric_overcharge_debuff: "acumula cargas que reduzem velocidade/iniciativa e atrapalham agir primeiro",
  mini_stun: "pode bloquear a ação do alvo por 1 turno",
  psychic_mind_control: "aplica controle por rodadas e limita a ação do alvo",
  psychic_barrier: "absorve dano antes do HP",
  psychic_barrier_break_buff: "aumenta dano e reduz dano recebido por poucas rodadas",
  ice_armor_buff: "reduz dano recebido e pode aplicar Gélido ao agressor",
  ice_blizzard_field_buff: "aumenta consistência de controle e pressão de Gélido",
  ice_blizzard_field_debuff: "reduz mobilidade e aumenta risco de controle",
  ice_freeze: "impede agir durante o congelamento",
  gelid: "acumula lentidão e pressão de controle por rodadas",
  ghost_curse: "causa dano contínuo e aumenta pressão conforme acumula",
  ghost_shadow_mark: "marca o alvo para execução em vida baixa e sustain do atacante",
  ghost_haunt_debuff: "reduz desempenho ofensivo e defesa do alvo",
  grass_root: "causa dano por turno e dificulta trocas de ritmo",
  grass_deep_root: "amplia dano por turno e pressão de controle",
  grass_slowness_debuff: "reduz velocidade/iniciativa do alvo",
  grass_thorn_field_buff: "reflete parte do dano físico recebido",
  grass_short_cut: "reduz dano físico causado",
  water_abyssal_tide_debuff: "reduz ataque/defesa e deixa o alvo mais vulnerável",
  water_life_energy_buff: "cura por turno e melhora resistência",
  electric_electrostatic_field_buff: "adiciona pressão elétrica e chance de splash",
  electric_electrostatic_field_debuff: "retalia ações e limita jogadas de alto custo",
  fighting_rhythm_buff: "aumenta dano físico conforme mantém pressão ofensiva",
  fighting_finisher_buff: "garante explosão de dano no próximo golpe",
  fighting_unyielding_stance: "armazena carga defensiva e pode evitar nocaute",
  fighting_stance_release: "converte carga acumulada em burst ofensivo",
  legendary_execute: "acumula stacks de execução e elimina o alvo quando o limiar de vida é alcançado",
  legendary_reactive_shield: "absorve dano antes do HP",
  dragon_impetus_state: "acumula stacks ofensivos e amplifica dano/eficiência/energia",
  dragon_impetus_stack: "acertos válidos acumulam stacks; cada stack aumenta ATK/MAG/eficiência e, no máximo, aumenta energia",
  dragon_impetus_unlock: "passiva equipada que habilita o acúmulo automático de Ímpeto desde o início da batalha",
  exhaustion: "reduz em 35% a geração de energia do alvo",
  dragonic_rupture: "aumenta em 20% o dano de habilidades recebido",
  legendary_true_burn: "causa dano verdadeiro por rodada e ignora mitigação",
  ancestral_presence: "ativa aura ancestral com resistência e burn de fogo por turno",
  ancestral_presence_enemy_aura: "reduz iniciativa e dano causado sob domínio ancestral",
  execute: "acumula stacks de execução e elimina abaixo do limiar calculado",
};

function normalizeEffectKey(entry = {}) {
  const id = String(entry?.id || "").trim().toLowerCase();
  if (id) return id;
  return String(entry?.name || "").trim().toLowerCase();
}

function inferGameplayDescription(entry = {}) {
  const parts = [];
  const damagePerTick = Number(entry.dotDamage || entry.damagePerTurn || entry.damagePerStack || 0);
  if (damagePerTick > 0) parts.push(`causa ${Math.round(damagePerTick)} de dano por turno`);

  const outgoingMultiplier = Number(entry.outgoingDamageMultiplier);
  if (Number.isFinite(outgoingMultiplier) && outgoingMultiplier !== 1) {
    const pct = Math.round((outgoingMultiplier - 1) * 100);
    parts.push(`${pct > 0 ? "aumenta" : "reduz"} dano causado em ${Math.abs(pct)}%`);
  }

  const incomingMultiplier = Number(entry.incomingDamageTakenMultiplier);
  if (Number.isFinite(incomingMultiplier) && incomingMultiplier !== 1) {
    const pct = Math.round((incomingMultiplier - 1) * 100);
    parts.push(`${pct > 0 ? "aumenta" : "reduz"} dano recebido em ${Math.abs(pct)}%`);
  }

  const speedMultiplier = Number(entry.speedMultiplier);
  if (Number.isFinite(speedMultiplier) && speedMultiplier !== 1) {
    const pct = Math.round((speedMultiplier - 1) * 100);
    parts.push(`${pct > 0 ? "aumenta" : "reduz"} velocidade/iniciativa em ${Math.abs(pct)}%`);
  }

  if (entry.shieldCurrentHp != null && Number(entry.shieldCurrentHp) > 0) parts.push("absorve dano antes do HP");
  if (entry.cannotAct || entry.skipTurn || entry.blockAction) parts.push("impede o alvo de agir");
  if (entry.taunt || entry.forcedAction) parts.push("força ação básica e limita escolhas");

  return parts.join("; ") || "efeito ativo com impacto não mapeado; consulte nome/tags para origem";
}

function isGenericDescription(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized.includes("altera o fluxo da luta");
}

function describeEffectGameplayImpact(entry = {}) {
  if (entry?.gameplayDescription) return String(entry.gameplayDescription);
  const key = normalizeEffectKey(entry);
  if (key && EFFECT_GAMEPLAY_DESCRIPTIONS[key]) return EFFECT_GAMEPLAY_DESCRIPTIONS[key];
  if (entry?.description && !isGenericDescription(entry.description)) return String(entry.description);
  return inferGameplayDescription(entry);
}

module.exports = {
  describeEffectGameplayImpact,
  normalizeEffectKey,
};
