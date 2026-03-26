const CURRENT_UPDATE = {
  versionLabel: 'Atualização de Produção — Essência, Shiny e Progressão',
  sections: {
    novidades: [
      '🧪 *Essência Pokémon* adicionada ao loop principal de progressão.',
      '💰 `!sell` agora gera *gold + essência Pokémon* na venda.',
      '🎁 `!daily` atualizado: além do gold, entrega Pokebola (`!c`), Livro Ancião e essência.',
      '🎒 `!mochila` agora mostra também sua *Essência Pokémon* atual.',
      '⚡ `!pokeid` ganhou *Stats extras* (crit / esquiva / efeito elemental) via botão *Stats*.',
      '🧬 Novos Pokémons agora entram com *individualidade (IV)* visível no `!pokeid`.',
      '✨ Sistema shiny revisado: diferencia *shiny normal* e *shiny prime* + transferência via `!tshiny`.',
      '🎨 Visual shiny ajustado: fundo roxo mantido, efeito antigo removido.',
    ],
    comoUsar: [
      '*Essência Pokémon*',
      '• Veja seu saldo em `!mochila`.',
      '• Ganhe essência em `!sell` e `!daily`.',
      '',
      '*Shiny e transferência (`!tshiny`)*',
      '• Use `!tshiny <id_origem> <id_destino>` para transferir shiny.',
      '• O shiny *prime* da origem vira shiny *normal* no destino.',
      '• A ação é irreversível e exige confirmação.',
      '',
      '*Stats extras (`!pokeid` + botão Stats)*',
      '• Abra `!pokeid <id>` e clique em *Stats*.',
      '• Faça upgrades extras de crit, esquiva e efeito elemental.',
    ],
    recompensas: [
      '🎁 `!daily`: gold aleatório + `1~3` Pokebolas (`!c`) + `5` Livros Anciãos + `1000` de essência.',
      '💸 `!sell`: mantém retorno em gold e agora soma essência no resultado.',
      '🧪 Essência vira recurso central para upgrades extras e progressão de Pokémon.',
    ],
    profile: [
      '👤 `!profile` segue com nível da conta, energia, Pokebola (`!c`) e cooldown do `!capture`.',
      '🎒 Use o botão da mochila no perfil para ver itens + Essência Pokémon.',
    ],
  },
};

function buildUpdateMessage() {
  const { versionLabel, sections } = CURRENT_UPDATE;

  const novidades = sections.novidades.join('\n');
  const comoUsar = sections.comoUsar.join('\n');
  const recompensas = sections.recompensas.join('\n');
  const profile = sections.profile.join('\n');

  const text = [
    `📣 *${versionLabel}*`,
    '',
    '*Novidades*',
    novidades,
    '',
    '*Como usar*',
    comoUsar,
    '',
    '*Recompensas e progressão*',
    recompensas,
    '',
    '*Novas informações no perfil*',
    profile,
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
          text: `*${versionLabel}*\nResumo rápido das novidades desta versão para você aproveitar no jogo.`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🆕 Novidades*\n${novidades}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎮 Como usar*\n${comoUsar}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🏆 Recompensas e progressão*\n${recompensas}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*👤 Novas informações no !profile*\n${profile}`,
        },
      },
    ],
  };
}

module.exports = {
  CURRENT_UPDATE,
  buildUpdateMessage,
};
