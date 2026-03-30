const CURRENT_UPDATE = {
  versionLabel: 'Atualização de Produção — PvP, Dungeon 60 e Essência',
  sections: {
    combate: [
      'PvP agora suporta até *3 Pokémons* por jogador.',
      'Troca de Pokémon durante a batalha com fluxo mais estável.',
      'Novo comando `!surrender` para desistir da partida.',
      'PvP com entrada de *2000 gold* e recompensa de *4000 gold* ao vencedor.',
      'Contador de vitórias PvP no acompanhamento das partidas.',
      'Ajustes no cálculo de crítico e melhoria dos logs de combate.',
    ],
    dungeons: [
      'Nova *Dungeon 60* disponível.',
      'Tabela de recompensas da dungeon atualizada.',
      'Melhorias de estabilidade e correções no fluxo da dungeon.',
    ],
    visual: [
      'Fundos por raridade adicionados: lendário (roxo) e mítico (dourado/laranja).',
      'Shiny prime com novo visual (borda preta/vermelha).',
      'Bordas de nível mantidas junto dos novos fundos.',
      'Melhorias gerais de renderização nas cartas e listagens.',
    ],
    economia: [
      '*Essência Pokémon* integrada ao sistema de progressão.',
      '`!sell` agora gera gold + essência.',
      'Ajustes nas recompensas de dungeon, `!daily` e outros fluxos.',
    ],
    qualidadeDeVida: [
      '`!battleon` para definir quais Pokémons ficam disponíveis para batalha.',
      'Favoritos agora influenciam listagens e proteções de venda.',
      'Melhorias no `!mochila` com informações mais claras.',
      'Melhorias no `!sell`, incluindo identificação de shiny.',
      '`!sellall` disponível para venda em lote com proteção de favoritos.',
      'Filtros ativos `!prarity` e `!pelement` para facilitar consultas.',
    ],
    correcoes: [
      'Correções na Dungeon 60 (finalização e resultado).',
      'Correções na healstation e no fluxo de cura.',
      'Correções em ações de botões no Slack.',
      'Ajustes de reset e persistência de HP.',
      'Ajustes de shiny e balanceamento geral.',
    ],
  },
};

function buildUpdateMessage() {
  const { versionLabel, sections } = CURRENT_UPDATE;

  const text = [
    `📣 *${versionLabel}*`,
    '',
    '*⚔️ Combate / PvP*',
    sections.combate.map((item) => `• ${item}`).join('\n'),
    '',
    '*🧭 Dungeons*',
    sections.dungeons.map((item) => `• ${item}`).join('\n'),
    '',
    '*🎨 Visual*',
    sections.visual.map((item) => `• ${item}`).join('\n'),
    '',
    '*📦 Economia*',
    sections.economia.map((item) => `• ${item}`).join('\n'),
    '',
    '*🧠 Qualidade de vida*',
    sections.qualidadeDeVida.map((item) => `• ${item}`).join('\n'),
    '',
    '*🛠️ Correções*',
    sections.correcoes.map((item) => `• ${item}`).join('\n'),
  ].join('\n');

  return {
    text,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📣 Atualização atual do bot',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${versionLabel}*\nPrincipais melhorias recentes já implementadas e ativas.`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚔️ Combate / PvP*\n${sections.combate.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🧭 Dungeons*\n${sections.dungeons.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎨 Visual*\n${sections.visual.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📦 Economia*\n${sections.economia.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🧠 Qualidade de vida*\n${sections.qualidadeDeVida.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🛠️ Correções*\n${sections.correcoes.map((item) => `• ${item}`).join('\n')}`,
        },
      },
    ],
  };
}

module.exports = {
  CURRENT_UPDATE,
  buildUpdateMessage,
};
