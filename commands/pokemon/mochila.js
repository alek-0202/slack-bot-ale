const { getUserItems } = require('../../services/inventoryService');
const { getUser } = require('../../services/userService');

function buildMochilaPayload(slackUserId, items, pokemonEssence = '0') {
  const essenceLabel = Number(pokemonEssence || 0).toLocaleString('pt-BR');
  const text = [
    `🎒 *Mochila de <@${slackUserId}>*`,
    '',
    `🧪 *Essência Pokémon:* x${essenceLabel}`,
    '',
    ...(items.length
      ? items.map((item) => `• *${item.item_name}* x${item.quantity}${item.description ? ` — ${item.description}` : ''}`)
      : ['• Sem itens no momento.']),
  ].join('\n');

  return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

module.exports = {
  name: 'mochila',
  buildMochilaPayload,
  async execute({ event, say }) {
    const [items, user] = await Promise.all([getUserItems(event.user), getUser(event.user)]);
    await say(buildMochilaPayload(event.user, items, user?.pokemonEssence || '0'));
  },
};
