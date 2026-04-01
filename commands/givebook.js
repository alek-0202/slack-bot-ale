const { grantAncientBook } = require('../services/adminGrantService');
const { ensureAdminOrReply, parseTargetAndQuantity } = require('./adminGrantUtils');

module.exports = {
  name: 'givebook',
  async execute({ event, args, say }) {
    if (!(await ensureAdminOrReply(event, say))) return;

    const parsed = parseTargetAndQuantity(args);
    if (!parsed.ok) {
      await say(parsed.reason === 'invalid_target'
        ? 'Uso: `!givebook @usuario <quantidade>`.'
        : 'Informe uma quantidade inteira positiva. Ex.: `!givebook @usuario 10`.');
      return;
    }

    await grantAncientBook(parsed.targetUserId, parsed.quantity);
    await say(`✅ Livros adicionados: <@${parsed.targetUserId}> recebeu *${parsed.quantity}* Livro(s) Ancião.`);
  },
};
