const { removeItem } = require('../services/inventoryService');
const { grantLegendaryPassive } = require('../services/legendaryCodexService');

module.exports = {
  name: 'usetomo',
  aliases: ['tomo'],
  async execute({ event, say }) {
    const consumed = await removeItem(event.user, 'legendary_tome', 1);
    if (!consumed.ok) {
      await say('❌ Você não possui *Tomo Lendário* na mochila. Compre em `!fusão`.');
      return;
    }

    const result = await grantLegendaryPassive({ slackUserId: event.user });
    if (!result.ok) {
      await say('❌ Não foi possível abrir o Tomo Lendário agora.');
      return;
    }

    const rolledName = result.codexEntry?.passiveName || 'Passiva';
    const rolledCode = result.codexEntry?.passiveCode || result.rolled?.passiveCode;
    const description = result.codexEntry?.description || '';
    const actionLine = result.action === 'kept_existing'
      ? 'Você já possuía uma versão melhor dessa passiva e manteve a antiga.'
      : (result.action === 'upgraded_existing' ? 'Sua versão anterior foi substituída por uma melhor no códex.' : 'Nova passiva registrada no códex.');

    await say(
      `📘 <@${event.user}> abriu um *Tomo Lendário*!\n` +
      `✨ Passiva: *${rolledName}* [${rolledCode}]\n` +
      `Efeito: ${description}\n` +
      `🧠 ${actionLine}`,
    );
  },
};
