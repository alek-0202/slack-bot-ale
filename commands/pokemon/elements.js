const { getPokemonElementsReference } = require('../../services/pokemonElementsService');

module.exports = {
  name: 'elements',
  async execute({ say }) {
    try {
      const entries = getPokemonElementsReference();
      const text = [
        '🧪 *Elementos disponíveis*',
        '',
        ...entries.map((entry) => `• *${entry.name}* → fraquezas: ${entry.weaknesses.join(', ')}`),
      ].join('\n');

      await say({
        text: 'Elementos disponíveis',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text,
            },
          },
        ],
      });
    } catch (error) {
      console.error('Erro no !elements:', error.message || error);
      await say('Não consegui listar os elementos agora 😵');
    }
  },
};
