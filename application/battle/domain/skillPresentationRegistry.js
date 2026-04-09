const SKILL_SHORT_DESCRIPTION_BY_ID = Object.freeze({
  fire_burning_soul: 'Escala dano de fogo e reforça burn ao manter pressão.',
  fire_flame_burst: 'Explosão mágica de fogo com pressão de burn no alvo.',
  fire_phoenix_rebirth: 'Defesa/retorno de fogo que sustenta trocas longas.',
  water_abyssal_tide: 'Onda de água em área que enfraquece ataque/defesa inimiga.',
  water_tidal_armor: 'Aura aquática que reduz dano recebido e melhora sustain.',
  water_life_energy: 'Converte pressão ofensiva em cura e bônus de água.',
  grass_root_prison: 'Enraíza e pune mobilidade, aplicando dano por turno.',
  grass_thorn_field: 'Campo de espinhos com reflexão e controle de ritmo.',
  grass_natural_growth: 'Buff progressivo de sobrevivência e consistência.',
  electric_overcharge: 'Acelera dano elétrico e pode causar falhas no alvo.',
  electric_thunder_chain: 'Acerto elétrico com chance de cadeia e mini-controle.',
  electric_electrostatic_field: 'Campo elétrico que pune ações e amplia pressão.',
  ice_armor: 'Reduz dano recebido e potencializa resposta contra alvo Gélido.',
  ice_glacial_shard: 'Golpe de gelo que explode dano em alvo congelado.',
  ice_blizzard: 'Campo de nevasca em área com Gélido contínuo.',
  fighting_combo_rhythm: 'Passiva que escala dano físico por sequência ofensiva.',
  fighting_breaker_punch: 'Golpe de ruptura com burst e preparação de finalização.',
  fighting_unyielding_stance: 'Postura defensiva que acumula carga e evita colapso.',
  psychic_mind_reading: 'Marca alvo e fortalece o segundo acerto com previsão.',
  psychic_burst: 'Explosão psíquica ofensiva; contra counter vira Ilusão defensiva.',
  psychic_barrier: 'Escudo dinâmico que acumula energia e vira sobrecarga ao quebrar.',
  ghost_ethereal_form: 'Forma etérea com evasão, drenagem e reposicionamento.',
  ghost_dark_curse: 'Maldição crescente com pressão contínua e explosão final.',
  ghost_shadow_call: 'Invoca sombra que marca alvo e escala execute.',
  dragon_draconic_impetus: 'Passiva: acertos acumulam stacks de Ímpeto (até 3).',
  dragon_ancestral_breath: '95% MAG (+5% por stack de Ímpeto) + eficiência. Com 3 stacks: Exaustão e Ruptura Dracônica.',
  dragon_ancestral_presence: 'Aura de 3 turnos: reduz iniciativa/dano inimigo, fortalece resistência e gera burn ancestral de fogo.',
});

function getSkillShortDescription(skill = {}) {
  const id = String(skill?.id || '');
  if (id && SKILL_SHORT_DESCRIPTION_BY_ID[id]) return SKILL_SHORT_DESCRIPTION_BY_ID[id];
  if (skill?.mrskillDescription) return String(skill.mrskillDescription);
  if (skill?.description) return String(skill.description);
  return null;
}

module.exports = {
  SKILL_SHORT_DESCRIPTION_BY_ID,
  getSkillShortDescription,
};
