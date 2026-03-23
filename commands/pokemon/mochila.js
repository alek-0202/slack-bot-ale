const { getUserItems } = require('../../services/inventoryService');

module.exports = {
  name: 'mochila',
  async execute({ event, say }) {
    const items = await getUserItems(event.user);
    if (!items.length) {
      await say('🎒 Sua mochila está vazia no momento.');
      return;
    }

    const text = [
      `🎒 *Mochila de <@${event.user}>*`,
      '',
      ...items.map((item) => `• *${item.item_name}* x${item.quantity}${item.description ? ` — ${item.description}` : ''}`),
    ].join('\n');

    await say({ text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] });
  },
};
