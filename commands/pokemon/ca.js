const { captureForUser } = require('../../application/useCases/pokemon/captureForUser');
const { getUserItemQuantity, removeItem } = require('../../services/inventoryService');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('slack-ca-capture-batch-command');
const MAX_BATCH_CAPTURE = 15;

function formatCapturedEntry(result) {
  const shinyPrefix = result?.shiny ? '✨ ' : '';
  const name = result?.species?.name || 'Pokémon';
  const rarity = result?.species?.rarity || 'desconhecida';
  const pokeId = result?.captured?.id || '?';
  return `• ${shinyPrefix}${name} - ${rarity} - ${pokeId}`;
}

module.exports = {
  name: 'ca',
  async execute({ event, say }) {
    const quantity = await getUserItemQuantity(event.user, 'pokeball_c');
    if (quantity <= 0) {
      await say('❌ Você não tem *Pokebola (!c)* na mochila.');
      return;
    }

    const attempts = Math.min(MAX_BATCH_CAPTURE, quantity);
    const captured = [];
    let consumed = 0;

    for (let index = 0; index < attempts; index += 1) {
      const result = await captureForUser({
        userId: event.user,
        channelId: event.channel,
        platform: 'slack',
        rawText: event.text,
        source: 'pokeball_c_batch',
        bypassCooldown: true,
        skipCooldownWrite: true,
      });

      if (!result.ok) {
        logger.warn('Captura em lote interrompida por falha de captura', {
          file: 'commands/pokemon/ca.js',
          command: 'ca',
          slackUserId: event.user,
          attempt: index + 1,
          reason: result.reason,
        });
        break;
      }

      const consumeResult = await removeItem(event.user, 'pokeball_c', 1);
      if (!consumeResult.ok) {
        logger.warn('Captura em lote interrompida por falha ao consumir Pokebola (!c)', {
          file: 'commands/pokemon/ca.js',
          command: 'ca',
          slackUserId: event.user,
          attempt: index + 1,
          reason: consumeResult.reason,
        });
        break;
      }

      consumed += 1;
      captured.push(result);
    }

    if (!captured.length) {
      await say('⚠️ Não consegui concluir a captura em lote agora. Nenhuma Pokebola foi consumida com sucesso.');
      return;
    }

    const lines = captured.map((entry) => formatCapturedEntry(entry));
    await say(
      `🧿 <@${event.user}> usou *${consumed}* Pokebola (!c) em lote (máx. ${MAX_BATCH_CAPTURE}).\n` +
      `🐾 Pokémons obtidos:\n${lines.join('\n')}`,
    );
  },
};
