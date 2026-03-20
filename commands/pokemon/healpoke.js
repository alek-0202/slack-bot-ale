const { parsePositiveInt } = require('../../utils/number');
const { createLogger } = require('../../utils/logger');
const { addPokemonToHealingStation, removePokemonFromHealingStation } = require('../../services/healingStationService');

const logger = createLogger('command:healpoke');

module.exports = {
  name: 'healpoke',
  async execute({ event, args, say }) {
    try {
      const [action, rawPokemonId] = String(args || '').trim().split(/\s+/).filter(Boolean);
      const pokemonId = parsePositiveInt(rawPokemonId);
      if (!['add', 'remove'].includes(action) || !pokemonId) {
        await say('Use `!healpoke add <id>` ou `!healpoke remove <id>`.');
        return;
      }

      const result = action === 'add'
        ? await addPokemonToHealingStation({ slackUserId: event.user, pokemonId })
        : await removePokemonFromHealingStation({ slackUserId: event.user, pokemonId });

      if (!result.ok) {
        const messages = {
          pokemon_not_owned: 'Pokémon não encontrado ou não pertence a você.',
          station_full: 'Sua estação já está cheia (5/5).',
          already_in_station: 'Esse Pokémon já está na estação de cura.',
          already_full_hp: 'Esse Pokémon já está com HP cheio.',
          pokemon_in_active_battle: 'Esse Pokémon está em batalha ativa e não pode entrar na estação.',
          not_in_station: 'Esse Pokémon não está na estação de cura.',
        };
        await say(messages[result.reason] || 'Não consegui processar esse comando agora 😵');
        return;
      }

      logger.info('Comando healpoke executado', { slackUserId: event.user, action, pokemonId });
      await say(action === 'add' ? `🩺 Pokémon #${pokemonId} enviado para a estação de cura.` : `✅ Pokémon #${pokemonId} removido da estação de cura.`);
    } catch (error) {
      logger.error('Erro no !healpoke', { slackUserId: event.user, args, error });
      await say('Não consegui processar sua estação de cura agora 😵');
    }
  },
};
