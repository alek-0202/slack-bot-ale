const { createLogger } = require('../../utils/logger');
const { getHealingStationView } = require('../../services/healingStationService');
const { renderHealingStation } = require('../../adapters/slack/renderers/healingStationRenderer');

const logger = createLogger('command:healstation');

module.exports = {
  name: 'healstation',
  async execute({ event, say }) {
    try {
      const view = await getHealingStationView(event.user);
      logger.info('HUD da estação consultada', { slackUserId: event.user, occupiedSlots: view.slots.length, level: view.station.level });
      await say(renderHealingStation(view, event.user));
    } catch (error) {
      logger.error('Erro no !healstation', { slackUserId: event.user, error });
      await say('Não consegui abrir sua estação de cura agora 😵');
    }
  },
};
