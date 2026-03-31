require("../application/battle/domain/elementalEngine");
const { getRegisteredElementalRules } = require("../application/battle/domain/elementalRules");

const ELEMENT_ORDER = ["fire", "water", "grass", "electric", "ice", "fighting", "psychic", "ghost"];

function buildSkillHelpBlocks() {
  const entries = listCharacteristicSkillsByElement();
  const chunks = [];
  let current = [];
  let currentLength = 0;

  const pushLine = (line) => {
    if ((currentLength + line.length) > 2600 && current.length) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  };

  pushLine("🧩 *SKILL HELP — Magias Características*");
  pushLine("_Organizado por elemento. Valores podem receber bônus/reduções em batalha._");
  pushLine("");

  for (const group of entries) {
    pushLine(`*${group.label}*`);
    for (const skill of group.skills) {
      pushLine(`${skill.icon || "✨"} *${skill.name}*`);
      pushLine(`• Elemento: ${group.element}`);
      pushLine(`• Descrição: ${skill.description}`);
      pushLine(`• Multiplicadores: ${skill.multipliers}`);
      pushLine(`• Custo de energia: ${skill.energyCost}`);
      pushLine(`• Cooldown: ${skill.cooldown}`);
      pushLine(`• Efeitos principais: ${skill.effects}`);
      pushLine(`• Especial: ${skill.special}`);
    }
    pushLine("");
  }

  if (current.length) chunks.push(current.join("\n"));
  return chunks.map((text) => ({ type: "section", text: { type: "mrkdwn", text } }));
}

function listCharacteristicSkillsByElement() {
  const registry = getRegisteredElementalRules();
  const order = new Map(ELEMENT_ORDER.map((element, index) => [element, index]));
  return registry
    .map(({ element, rules }) => ({
      element,
      label: `${getElementEmoji(element)} ${capitalize(element)}`,
      skills: (rules?.skills || []).map((skill) => ({
        icon: skill.icon,
        name: skill.name,
        description: buildSkillDescription(skill),
        multipliers: buildMultipliersLabel(skill),
        energyCost: `${50 + Math.max(0, Number(skill.extraEnergyCost || 0))}`,
        cooldown: `${Number(skill.cooldownRounds || 0)} rodada(s)`,
        effects: buildEffectsLabel(skill),
        special: buildSpecialLabel(skill),
      })),
    }))
    .filter((entry) => entry.skills.length)
    .sort((a, b) => (order.get(a.element) ?? 999) - (order.get(b.element) ?? 999));
}

function buildSkillDescription(skill) {
  if (skill?.description) return skill.description;
  if (skill?.hooks?.includes("onHit")) return "Skill de preparação/efeito com impacto em ataques seguintes.";
  return "Skill ativa que altera dano, status ou campo de batalha.";
}

function buildMultipliersLabel(skill) {
  const entries = [];
  if (skill?.damageMultiplier) entries.push(`dano x${skill.damageMultiplier}`);
  if (skill?.hooks?.includes("onHit")) entries.push("bônus em hits subsequentes");
  if (skill?.extraEnergyCost) entries.push("alto custo = maior impacto");
  return entries.length ? entries.join(" | ") : "depende do cálculo da skill (base + bônus situacionais)";
}

function buildEffectsLabel(skill) {
  const hooks = Array.isArray(skill?.hooks) ? skill.hooks : [];
  const mapped = hooks.map((hook) => ({
    onCast: "aplica ao conjurar",
    onHit: "aplica ao acertar",
    beforeDamage: "modifica dano recebido/causado",
    endOfRound: "efeito contínuo por rodada",
  }[hook] || hook));
  return mapped.length ? mapped.join(", ") : "efeitos diretos";
}

function buildSpecialLabel(skill) {
  if (Number(skill?.extraEnergyCost || 0) >= 100) return "habilidade de alto impacto e alto custo.";
  if (Number(skill?.cooldownRounds || 0) >= 5) return "janela forte com recarga longa.";
  return "uso tático com recarga padrão.";
}

function getElementEmoji(element) {
  return {
    fire: "🔥",
    water: "💧",
    grass: "🌿",
    electric: "⚡",
    ice: "❄️",
    fighting: "🥊",
    psychic: "🧠",
    ghost: "👻",
  }[String(element || "").toLowerCase()] || "✨";
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

module.exports = {
  buildSkillHelpBlocks,
};
