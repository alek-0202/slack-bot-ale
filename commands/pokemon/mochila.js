const { getUserItems } = require('../../services/inventoryService');

function buildMochilaPayload(slackUserId, items) {
  const text = [
    `🎒 *Mochila de <@${slackUserId}>*`,
    '',
    ...items.map((item) => `• *${item.item_name}* x${item.quantity}${item.description ? ` — ${item.description}` : ''}`),
  ].join('\n');

  return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

module.exports = {
  name: 'mochila',
  buildMochilaPayload,
  async execute({ event, say }) {
    const items = await getUserItems(event.user);
    if (!items.length) {
      await say('🎒 Sua mochila está vazia no momento.');
      return;
    }
    await say(buildMochilaPayload(event.user, items));
  },
};
