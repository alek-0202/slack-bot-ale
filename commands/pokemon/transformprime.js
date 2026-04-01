const { parsePositiveInt } = require('../../utils/number');
const { useTransform } = require('../../services/fusionService');

module.exports = {
  name: 'transformprime',
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say('Use `!transformprime <id>` com um ID válido.');
      return;
    }

    const result = await useTransform({ slackUserId: event.user, pokemonId, prime: true });
    if (!result.ok) {
      const map = {
        pokemon_not_found: 'Pokémon não encontrado na sua coleção.',
        missing_item: 'Você não possui Prisma PRIME na mochila.',
        already_prime: 'Esse Pokémon já é SHINE PRIME.',
        pokemon_in_healing_station: 'Esse Pokémon está na estação de cura.',
        pokemon_in_active_battle: 'Esse Pokémon está em batalha ativa.',
      };
      await say(map[result.reason] || 'Não consegui transformar para PRIME agora.');
      return;
    }

    await say(`🌈 Transform PRIME concluído: Pokémon #${pokemonId} agora é SHINE PRIME.`);
  },
};
