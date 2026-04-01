const { grantPokeballC } = require('../services/adminGrantService');
const { ensureAdminOrReply, parseTargetAndQuantity } = require('./adminGrantUtils');

module.exports = {
  name: 'givec',
  async execute({ event, args, say }) {
    if (!(await ensureAdminOrReply(event, say))) return;

    const parsed = parseTargetAndQuantity(args);
    if (!parsed.ok) {
      await say(parsed.reason === 'invalid_target'
        ? 'Uso: `!givec @usuario <quantidade>`.'
        : 'Informe uma quantidade inteira positiva. Ex.: `!givec @usuario 5`.');
      return;
    }

    await grantPokeballC(parsed.targetUserId, parsed.quantity);
    await say(`✅ Pokebola (!c) adicionada: <@${parsed.targetUserId}> recebeu *${parsed.quantity}* unidade(s).`);
  },
};
