const { createLogger } = require('../../utils/logger');
const { resetPokemonShiny } = require('../../services/shinyResetService');

const logger = createLogger('command:resetshiny');

module.exports = {
  name: 'resetshiny',
  async execute({ event, say, args }) {
    try {
      const pokemonId = Number.parseInt(String(args || '').trim(), 10);
      if (!Number.isInteger(pokemonId) || pokemonId <= 0) {
        await say('Use `!resetshiny <pokemon_id>`. Ex.: `!resetshiny 25`.');
        return;
      }

      const result = await resetPokemonShiny({ slackUserId: event.user, pokemonId });
      if (!result.ok) {
        const map = {
          pokemon_not_owned: 'Pokémon não encontrado ou não pertence a você.',
          pokemon_not_shiny: 'Esse Pokémon não possui shiny para resetar.',
        };
        await say(map[result.reason] || 'Não consegui resetar o shiny agora 😵');
        return;
      }

      const shinyLabel = result.removedShinyType === 'prime' ? 'SHINY PRIME' : 'SHINY normal';
      await say(
        `🔁 *Shiny resetado com sucesso!*
• Pokémon: *${result.pokemonName}* (#${result.pokemonId})
• Tipo removido: *${shinyLabel}*
• Recompensa: *${Number(result.prismaticReward || 0).toLocaleString('pt-BR')}* fragmentos prismáticos
• IVs resetados para *0*`,
      );
    } catch (error) {
      logger.error('Erro no !resetshiny', { slackUserId: event.user, args, error });
      await say('Não consegui resetar o shiny desse Pokémon agora 😵‍💫');
    }
  },
};
