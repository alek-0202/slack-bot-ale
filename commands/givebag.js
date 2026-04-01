const { grantDungeonBag } = require('../services/adminGrantService');
const { ensureAdminOrReply, parseTargetAndQuantity } = require('./adminGrantUtils');

module.exports = {
  name: 'givebag',
  async execute({ event, args, say }) {
    if (!(await ensureAdminOrReply(event, say))) return;

    const parsed = parseTargetAndQuantity(args);
    if (!parsed.ok) {
      await say(parsed.reason === 'invalid_target'
        ? 'Uso: `!givebag @usuario <quantidade>`.'
        : 'Informe uma quantidade inteira positiva. Ex.: `!givebag @usuario 1`.');
      return;
    }

    await grantDungeonBag(parsed.targetUserId, parsed.quantity);
    await say(`✅ Bag de suprimentos (Dungeon 60) adicionada: <@${parsed.targetUserId}> recebeu *${parsed.quantity}* unidade(s).`);
  },
};
