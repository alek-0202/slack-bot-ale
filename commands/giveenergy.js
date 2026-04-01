const { grantEnergy } = require('../services/adminGrantService');
const { ensureAdminOrReply, parseTargetAndQuantity } = require('./adminGrantUtils');

module.exports = {
  name: 'giveenergy',
  async execute({ event, args, say }) {
    if (!(await ensureAdminOrReply(event, say))) return;

    const parsed = parseTargetAndQuantity(args);
    if (!parsed.ok) {
      await say(parsed.reason === 'invalid_target'
        ? 'Uso: `!giveenergy @usuario <quantidade>`.'
        : 'Informe uma quantidade inteira positiva. Ex.: `!giveenergy @usuario 3`.');
      return;
    }

    const result = await grantEnergy(parsed.targetUserId, parsed.quantity);
    await say(
      `✅ Energia atualizada para <@${parsed.targetUserId}>: +${result.grantedAmount} (agora *${result.currentEnergy}/${result.maxEnergy}*).`,
    );
  },
};
