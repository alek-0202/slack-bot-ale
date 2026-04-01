const { grantGold } = require('../services/adminGrantService');
const { ensureAdminOrReply, parseTargetAndQuantity } = require('./adminGrantUtils');

module.exports = {
  name: 'givegold',
  async execute({ event, args, say }) {
    if (!(await ensureAdminOrReply(event, say))) return;

    const parsed = parseTargetAndQuantity(args);
    if (!parsed.ok) {
      await say(parsed.reason === 'invalid_target'
        ? 'Uso: `!givegold @usuario <quantidade>`.'
        : 'Informe uma quantidade inteira positiva. Ex.: `!givegold @usuario 1000`.');
      return;
    }

    await grantGold(parsed.targetUserId, parsed.quantity);
    await say(`✅ Gold adicionado com sucesso: <@${parsed.targetUserId}> recebeu *${parsed.quantity}* gold.`);
  },
};
