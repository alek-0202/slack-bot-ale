const { captureForUser } = require('../../application/useCases/pokemon/captureForUser');
const { renderSlackCaptureResult } = require('../../adapters/slack/renderers/sharedPokemonRenderer');
const { removeItem, getUserItemQuantity } = require('../../services/inventoryService');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('slack-c-capture-command');

module.exports = {
  name: 'c',
  async execute({ event, say }) {
    const quantity = await getUserItemQuantity(event.user, 'pokeball_c');
    if (quantity <= 0) {
      await say('❌ Você não tem *Pokebola (!c)* na mochila.');
      return;
    }

    const result = await captureForUser({
      userId: event.user,
      channelId: event.channel,
      platform: 'slack',
      rawText: event.text,
      source: 'pokeball_c',
      bypassCooldown: true,
      skipCooldownWrite: true,
    });

    if (!result.ok) {
      await say(renderSlackCaptureResult({ slackUserId: event.user, result }));
      return;
    }

    const consumeResult = await removeItem(event.user, 'pokeball_c', 1);
    if (!consumeResult.ok) {
      logger.warn('Falha ao consumir Pokebola (!c) após captura', {
        file: 'commands/pokemon/c.js',
        command: 'c',
        slackUserId: event.user,
        reason: consumeResult.reason,
      });
      await say('⚠️ Captura concluída, mas não consegui consumir sua Pokebola (!c).');
    }

    logger.info('Uso de !c concluído', {
      file: 'commands/pokemon/c.js',
      command: 'c',
      slackUserId: event.user,
      captureId: result.captured?.id || null,
      speciesId: result.species?.id || null,
      itemConsumed: consumeResult.ok,
    });

    const payload = renderSlackCaptureResult({
      slackUserId: event.user,
      result: {
        ...result,
        accountXpReward: result.accountXpReward,
      },
    });

    const suffix = consumeResult.ok ? '\n🧿 *Pokebola (!c)* consumida: -1.' : '';
    if (typeof payload === 'string') {
      await say(`${payload}${suffix}`);
      return;
    }

    await say({
      ...payload,
      text: `${payload.text || ''}${suffix}`,
      blocks: payload.blocks,
    });
  },
};
