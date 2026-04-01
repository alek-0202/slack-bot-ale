const { parsePositiveInt } = require('../../utils/number');
const { useTransform } = require('../../services/fusionService');

module.exports = {
  name: 'transform',
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say('Use `!transform <id>` com um ID válido.');
      return;
    }

    const result = await useTransform({ slackUserId: event.user, pokemonId, prime: false });
    if (!result.ok) {
      const map = {
        pokemon_not_found: 'Pokémon não encontrado na sua coleção.',
        missing_item: 'Você não possui Prisma na mochila.',
        already_shiny: 'Esse Pokémon já é SHINE.',
        pokemon_in_healing_station: 'Esse Pokémon está na estação de cura.',
        pokemon_in_active_battle: 'Esse Pokémon está em batalha ativa.',
      };
      await say(map[result.reason] || 'Não consegui transformar agora.');
      return;
    }

    await say(`✨ Transform concluído: Pokémon #${pokemonId} agora é SHINE normal.`);
  },
};
