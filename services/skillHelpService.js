const SKILL_HELP_TEXT = `📘 *!skillhelp — Magias Características*

🔥 *FOGO*

🔥 *Garras Ardentes*
Buff (3 turnos)
• +30% dano nos próximos 3 ataques
• Aplica Burn (stack até 3)
• Burn: 20% magia + eficiência / turno
⚠️ Consome turno ao ativar

🔥 *Sopro Infernal*
Burst (+100 energia)
• Dano: 90% magia
• Burn forte (4 turnos)
• Burn: 50% magia + eficiência

🔥 *Defesa Ígnea*
Sustain (3 turnos)
• Cura: 15% da vida perdida (cap 400)
• Contra Burn: inimigo causa -20% dano

💧 *ÁGUA*

🌊 *Maré Abissal*
Controle
• Dano fixo: 200
• -35% dano do alvo (2 turnos)

💧 *Energia Vital*
Buff (4 turnos)
• +50% dano de água
• Pode buffar aliados de água

🌊 *Profundezas do Oceano*
Burst (+150 energia)
• Dano verdadeiro: 2500
• Kill: +100 energia / -3 CD

🌿 *GRAMA*

🌿 *Crescimento Natural*
Sustain (3 turnos)
• +25% eficiência
• Cura 10% HP/turno
• Gera Raiz (até 3)

Raiz:
• -5% dano recebido por stack
• 3 stacks = imune a controle leve
⚠️ -20% velocidade

🌿 *Raízes Sufocantes*
DOT + drain
• 25% magia + eficiência / turno
• Cura 50% do dano
• -30% velocidade

Extra: +1 turno se já afetado

🌿 *Espinho da Floresta*
Defensivo
• Taunt + contra-ataque
• Reflete 15% dano
• <30% HP → até 22%

⚡ *ELÉTRICO*

⚡ *Sobrecarga*
Buff
• +20% dano elétrico
• Aplica Choque

Choque:
• -25% iniciativa
• 20% falha parcial

Upgrade: pode perder turno

⚡ *Corrente de Raios*
Chain attack
• 85% magia
• Salta até 3 alvos

Extra:
• alvo único: +45% dano
• choque melhora efeito

⚡ *Campo Eletrostático*
Campo (3 turnos)
• -20% iniciativa inimigos
• 15% chance de choque

• +20% dano próprio
• pode atingir alvo extra

❄️ *GELO*

❄️ *Armadura de Gelo*
Defesa
• -25% dano recebido
• Aplica Gélido

Gélido:
• -20% iniciativa
• 3 stacks = congelado

❄️ *Estilhaço Glacial*
Burst
• 90% magia

• Gélido → +30%
• Congelado → +60%

Aplica Quebra:
• alvo recebe +25% dano

❄️ *Nevasca*
AoE (3 turnos)
• 40% magia / turno
• Aplica Gélido

• -25% iniciativa
• chance de congelar

🥊 *LUTADOR*

🥊 *Ritmo de Combate*
Scaling
• stacks (até 3):
+10% dano / +5% speed

• 20% hit duplo

3 stacks:
• próximo ataque = crit x3

🥊 *Golpe Demolidor*
Burst
• 100% magia

• stacks → -10% defesa por stack
• consome stacks

🥊 *Postura Inabalável*
Defesa
• -30% dano recebido
• converte dano em carga

Carga:
• até +50% dano

Extra:
• não morre
• cura 10% HP

🧠 *PSÍQUICO*

🧠 *Leitura Mental*
Setup (2 cargas)
• Marca alvo

• +20% velocidade
• +25% dano

2ª carga:
• 110% magia

🧠 *Explosão Psíquica*
Burst
• 80% magia
• -30% iniciativa

Counter:
• vira shield

🧠 *Barreira Psíquica*
Shield
• base: magia + HP

• gera stacks
• aplica dano on-hit

Quebra:
• bônus de dano + defesa

👻 *GHOST*

👻 *Forma Etérea*
Invulnerável (3 turnos)
• -95% dano
• perde 2% HP/turno

Saída:
• dano + Assombro

👻 *Maldição Sombria*
DOT acumulativo
• stacks por turno/skill

Explode:
• dano baseado em stacks

Extra:
• não executa
• deixa alvo com 1 HP

🌑 *Chamado das Sombras*
Invocação
• sombra ataca por turno

Marca:
• alvo recebe +dano

Execução:
• até 10% HP

👻 *Possessão*
Controle
• 50% chance

Sucesso:
• dreno por 3 turnos

Falha:
• debuff`;

function buildSkillHelpBlocks() {
  const lines = SKILL_HELP_TEXT.split("\n");
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const line of lines) {
    if (current.length && (currentLength + line.length + 1) > 2600) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }

    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length) chunks.push(current.join("\n"));
  return chunks.map((text) => ({ type: "section", text: { type: "mrkdwn", text } }));
}

module.exports = {
  buildSkillHelpBlocks,
};
