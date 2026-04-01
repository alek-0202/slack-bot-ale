const CURRENT_UPDATE = {
  versionLabel: 'Atualização de Produção — Fusão, Fragmentos e Novos Itens',
  sections: {
    combate: [
      'Logs de batalha mais claros para acompanhar cada turno sem confusão.',
      'Efeitos e ações de combate com leitura mais limpa durante as lutas.',
    ],
    magias: [
      'O `!magicregister` agora registra somente as magias corretas, sem incluir magias características.',
      'O `!mrskill` foi ajustado e está funcionando corretamente na seleção de magias.',
      'As habilidades agora exibem descrição para facilitar decisões no time.',
    ],
    sistemaMochila: [
      'Compras por quantidade disponíveis na mochila: x1, x10, x50 e x100.',
      'Novo item *Roleta Mágica*: permite reroll de IV no Pokémon escolhido.',
      'Novo item *Prisma*: transforma o Pokémon em shiny.',
      'Novo item *Prisma PRIME*: transforma o Pokémon em shiny prime.',
      'IV agora aparece no `!pa` e no `!pokeid`, com visual mais direto.',
    ],
    fusao: [
      'Novo sistema `!fusão` já disponível no jogo.',
      'Fluxo de fusão mais estável, sem fechar no meio da ação.',
      'Feedback da fusão mais claro em cada etapa para evitar dúvidas.',
    ],
    fragmentos: [
      'Novo *Fragmento Épico*: obtido ao vender Pokémon épico no nível 50.',
      'Novo *Fragmento Prismático*: obtido ao vender Pokémon shiny.',
      'Fragmentos entram como recurso importante para evolução da conta.',
    ],
    qualidadeDeVida: [
      'Leitura geral das telas e comandos melhorada para reduzir cliques e retrabalho.',
      'Ajustes de usabilidade em menus e respostas para deixar a progressão mais fluida.',
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
    '*🧠 Magias*',
    sections.magias.map((item) => `• ${item}`).join('\n'),
    '',
    '*🎒 Sistema / Mochila*',
    sections.sistemaMochila.map((item) => `• ${item}`).join('\n'),
    '',
    '*🧪 Fusão*',
    sections.fusao.map((item) => `• ${item}`).join('\n'),
    '',
    '*💎 Fragmentos*',
    sections.fragmentos.map((item) => `• ${item}`).join('\n'),
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
          text: `*${versionLabel}*\nConfira tudo que já entrou no jogo nesta rodada de melhorias.`,
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
          text: `*🧠 Magias*\n${sections.magias.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎒 Sistema / Mochila*\n${sections.sistemaMochila.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🧪 Fusão*\n${sections.fusao.map((item) => `• ${item}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*💎 Fragmentos*\n${sections.fragmentos.map((item) => `• ${item}`).join('\n')}`,
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
