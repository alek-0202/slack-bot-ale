const { parsePositiveInt } = require('../../utils/number');
const { useReroll } = require('../../services/fusionService');

const REROLL_IV_LABELS = [
  ['attack_iv', 'Attack'],
  ['defense_iv', 'Defense'],
  ['magic_iv', 'Magic'],
  ['speed_iv', 'Speed'],
  ['hp_iv', 'HP'],
];

module.exports = {
  name: 'reroll',
  async execute({ event, args, say }) {
    const pokemonId = parsePositiveInt(args);
    if (!pokemonId) {
      await say('Use `!reroll <id>` com um ID válido.');
      return;
    }

    const result = await useReroll({ slackUserId: event.user, pokemonId });
    if (!result.ok) {
      const map = {
        pokemon_not_found: 'Pokémon não encontrado na sua coleção.',
        missing_item: 'Você não possui Roleta Mágica na mochila.',
        pokemon_in_healing_station: 'Esse Pokémon está na estação de cura.',
        pokemon_in_active_battle: 'Esse Pokémon está em batalha ativa.',
      };
      await say(map[result.reason] || 'Não consegui aplicar o reroll agora.');
      return;
    }

    const pokemonName = result.pokemon?.pokemon_species?.name || `Pokémon #${pokemonId}`;
    const level = Number(result.pokemon?.level || 1);
    const comparison = REROLL_IV_LABELS
      .map(([key, label]) => `${label}: +${Number(result.previousIvOffsets?.[key] || 0)} -> +${Number(result.nextIvOffsets?.[key] || 0)}`)
      .join('\n');

    await say(`🎲 ${pokemonName} Nvl ${level}\n${comparison}`);
  },
};
