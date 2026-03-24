const CURRENT_UPDATE = {
  versionLabel: 'Atualização de Produção — Dungeon & Progressão',
  sections: {
    novidades: [
      '🏰 *Sistema de Dungeon (`!dungeon`)* agora está no ar com fluxo interativo: você escolhe seu Pokémon e inicia a batalha no mesmo estilo PvP contra inimigo controlado pelo bot.',
      '⚠️ *Dungeon diária* está temporariamente em manutenção. A *Dungeon Farm* segue liberada normalmente.',
      '⚡ Entradas na farm agora usam *energia* (1 dungeon = 1 energia).',
      '🎒 *Mochila (`!mochila`)* ativa para guardar itens como Livro Ancião e Pokebola (`!c`).',
      '🆕 Novo comando *`!c`* para captura com item, sem depender do cooldown do `!capture`.',
    ],
    comoUsar: [
      '*Dungeon (`!dungeon`)*',
      '1. Abra `!dungeon`.',
      '2. Escolha o Pokémon antes de entrar.',
      '3. Selecione a farm e o nível da dungeon.',
      '4. A batalha inicia no fluxo interativo e consome 1 energia por entrada.',
      '',
      '*Captura com item (`!c`)*',
      '• Use `!c` para capturar gastando Pokebola de item.',
      '• Pode usar várias vezes seguidas se tiver estoque na mochila.',
      '• Não depende do cooldown do `!capture`.',
      '',
      '*Mochila (`!mochila`)*',
      '• Use para acompanhar seus itens e quantidades.',
    ],
    recompensas: [
      '💰 *Dungeon Farm* agora recompensa com gold, XP da conta, Livro Ancião e Pokebola (`!c`) com quantidade variando conforme o nível.',
      '📈 Sua conta agora tem *nível próprio*.',
      '• Você ganha XP ao completar dungeons.',
      '• Você ganha XP também por captura.',
      '• A cada level up você recebe recompensa em gold.',
      '• A cada 20 níveis você recebe recompensa especial de Pokebola (`!c`).',
      '⚡ *Energia da conta*: máximo 5, recarga de 1 energia a cada 2h e reset completo ao virar o dia.',
    ],
    profile: [
      '👤 O `!profile` foi atualizado para mostrar:',
      '• nível da conta',
      '• progresso de XP',
      '• energia atual',
      '• quantidade de Pokebolas (`!c`)',
      '• cooldown do próximo `!capture`',
      '• botão para abrir a mochila',
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
