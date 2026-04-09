const CURRENT_UPDATE = {
  versionLabel: 'Atualização de Produção — Passivas Lendárias, Codex e Combate 2.0',
  sections: {
    combate: [
      'Resumo da rodada reformulado: leitura mais limpa, melhor destaque de dano e sequência das ações.',
      'Status de batalha agora aparecem com ícones visuais consistentes no PvP e na Dungeon.',
      'Nova área de *Details* na batalha mostrando passivas lendárias e efeitos ativos de forma clara.',
      'Logs de dano, buffs e debuffs ficaram mais claros para reduzir dúvidas durante a luta.',
      'Correções importantes em interações de skills características e passivas para evitar comportamentos inconsistentes.',
    ],
    caracteristicasPassivas: [
      'Sistema de passivas lendárias entrou em produção com efeitos exclusivos para lendários.',
      'Novo `!codex`: agora você acompanha melhor suas passivas e os efeitos de cada uma.',
      'Novo `!applycodex`: permite aplicar passivas do seu códex em Pokémon lendário.',
      'Novo *Tomo Lendário* (`!usetomo`): ao abrir, você recebe uma passiva lendária com roll próprio de eficiência.',
      'Passivas lendárias ficaram mais visíveis no combate, no `!codex` e no `!pokeid`.',
    ],
    magiasCaracteristicas: [
      'Skills características ganharam ajustes gerais de funcionamento e estabilidade em batalha.',
      '`!mrskill` ficou mais estável e o loadout salvo passou a persistir corretamente por Pokémon.',
      'Melhorias nas descrições e na apresentação dos efeitos para facilitar a escolha das skills.',
      'Elemento dracônico recebeu melhorias e centralização das regras de skills características no combate.',
    ],
    sistemaItens: [
      'A economia de fragmentos foi rebalanceada para deixar progressão e craft mais coerentes.',
      'Venda de Pokémon passou por ajustes relevantes de recompensa em fragmentos (incluindo casos shiny/prime).',
      'Correções garantem distribuição correta de fragmentos comuns, épicos, lendários, míticos e prismáticos.',
      'Fluxos de fusão e recompensas foram refinados para evitar perda de valor em conversões e craft.',
    ],
    qualidadeDeVida: [
      'Visual dos status no Slack foi padronizado e ficou mais fácil de interpretar durante a luta.',
      'Correções de renderização evitaram sumiço/quebra de ícones em diferentes modos de batalha.',
      'Ajustes de persistência e estabilidade reduziram problemas de comportamento em combate contínuo.',
    ],
  },
};

function buildUpdateMessage() {
  const { versionLabel, sections } = CURRENT_UPDATE;

  const text = [
    `📢 *${versionLabel}*`,
    '',
    '*⚔️ Combate*',
    sections.combate.map((item) => `• ${item}`).join('\n'),
    '',
    '*🐉 Características e Passivas*',
    sections.caracteristicasPassivas.map((item) => `• ${item}`).join('\n'),
    '',
    '*🧩 Magias Características*',
    sections.magiasCaracteristicas.map((item) => `• ${item}`).join('\n'),
    '',
    '*🎒 Sistema / Itens / Fragmentos*',
    sections.sistemaItens.map((item) => `• ${item}`).join('\n'),
    '',
    '*📊 Qualidade de vida*',
    sections.qualidadeDeVida.map((item) => `• ${item}`).join('\n'),
  ].join('\n');

  return {
    text,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📢 Atualização!',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${versionLabel}*\nConfira o pacote mais recente de melhorias que já entrou no jogo.`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚔️ Combate*\n${sections.combate.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🐉 Características e Passivas*\n${sections.caracteristicasPassivas.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🧩 Magias Características*\n${sections.magiasCaracteristicas.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎒 Sistema / Itens / Fragmentos*\n${sections.sistemaItens.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Qualidade de vida*\n${sections.qualidadeDeVida.map((item) => `• ${item}`).join('\n')}`,
        },
      },
    ],
  };
}

module.exports = {
  CURRENT_UPDATE,
  buildUpdateMessage,
};
