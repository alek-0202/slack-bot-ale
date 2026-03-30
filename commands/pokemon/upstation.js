const { createLogger } = require('../../utils/logger');
const { buildHealingStationUpgradePreview } = require('../../services/healingStationService');
const { renderHealingStationUpgradePreview } = require('../../adapters/slack/renderers/healingStationRenderer');

const logger = createLogger('command:upstation');

module.exports = {
  name: 'upstation',
  async execute({ event, say }) {
    try {
      const preview = await buildHealingStationUpgradePreview(event.user);
      if (!preview.ok) {
        const messages = {
          max_level_reached: 'Sua estação de cura já está no nível máximo (30/30).',
        };
        await say(messages[preview.reason] || 'Não consegui abrir o upgrade da estação agora 😵');
        return;
      }

      logger.info('Preview de upgrade da estação consultado', { slackUserId: event.user, currentLevel: preview.currentLevel, nextLevel: preview.nextLevel, cost: preview.cost });
      await say(renderHealingStationUpgradePreview({ slackUserId: event.user, preview }));
    } catch (error) {
      logger.error('Erro no !upstation', { slackUserId: event.user, error });
      await say('Não consegui abrir o upgrade da sua estação agora 😵');
    }
  },
};
